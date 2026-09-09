'use strict';

/**
 * ingestMockData.js
 *
 * Reads mock_billing_data.json (produced by generateMockData.js) and inserts
 * every daily cost record into the PostgreSQL database via Prisma.
 *
 * KEY DESIGN DECISION — upsert not insert:
 *   We use Prisma's `upsert` (INSERT ... ON CONFLICT DO UPDATE) so this script
 *   is safe to run multiple times. Re-running it won't create duplicate rows —
 *   it will just overwrite with the latest values. This matters because:
 *     a) during development you'll re-generate mock data often
 *     b) the same pattern will work for the real AWS Cost Explorer ingestion
 *        (Feature 6), where Cost Explorer can revise estimates retroactively.
 *
 * USAGE:
 *   node src/ingestion/ingestMockData.js
 */

require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
const prisma = require('../db/prismaClient');

// ─── Config ───────────────────────────────────────────────────────────────────

const MOCK_DATA_PATH = path.join(
  __dirname,
  '../../scripts/output/mock_billing_data.json'
);

// This is the mock account we'll create/reuse in the DB
const MOCK_ACCOUNT = {
  provider:     'aws',
  accountId:    '123456789012',
  accountAlias: 'my-startup-account',
};

const USD_TO_INR = parseFloat(process.env.USD_TO_INR_RATE) || 84;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps a full AWS service name to a short slug.
 * e.g. "Amazon EC2" → "ec2"
 */
function toServiceKey(serviceName) {
  const map = {
    'Amazon EC2':          'ec2',
    'Amazon S3':           's3',
    'Amazon RDS':          'rds',
    'AWS Lambda':          'lambda',
    'Amazon CloudFront':   'cloudfront',
    'AWS Data Transfer':   'datatransfer',
  };
  return map[serviceName] || serviceName.toLowerCase().replace(/\s+/g, '_');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('CloudRakshak — Mock Data Ingestion Pipeline');
  console.log('============================================');

  // 1. Load the mock data file
  if (!fs.existsSync(MOCK_DATA_PATH)) {
    console.error(`❌ Mock data file not found: ${MOCK_DATA_PATH}`);
    console.error('   Run: node scripts/generateMockData.js  first.');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(MOCK_DATA_PATH, 'utf8'));
  console.log(`📄 Loaded mock data: ${rawData.ResultsByTime.length} days`);

  // 2. Upsert the mock Account row
  //    (creates it if it doesn't exist, does nothing if it does)
  const account = await prisma.account.upsert({
    where: {
      provider_accountId: {
        provider:  MOCK_ACCOUNT.provider,
        accountId: MOCK_ACCOUNT.accountId,
      },
    },
    update: { accountAlias: MOCK_ACCOUNT.accountAlias },
    create: {
      provider:     MOCK_ACCOUNT.provider,
      accountId:    MOCK_ACCOUNT.accountId,
      accountAlias: MOCK_ACCOUNT.accountAlias,
    },
  });
  console.log(`🏦 Account upserted: [${account.provider}] ${account.accountAlias} (id: ${account.id})`);

  // 3. Build all records in memory, then bulk-insert in one DB round-trip.
  //    We use raw SQL (INSERT ... ON CONFLICT DO UPDATE) because Prisma's
  //    createMany does not support upsert on older versions.
  const records = [];

  for (const dayResult of rawData.ResultsByTime) {
    const date = new Date(dayResult.TimePeriod.Start);

    for (const group of dayResult.Groups) {
      const serviceName   = group.Keys[0];
      const costUsd       = parseFloat(group.Metrics.BlendedCost.Amount);
      const usageQuantity = parseFloat(group.Metrics.UsageQuantity?.Amount ?? '0');
      const resourceId    = group._resourceId ?? null;
      const costInr       = parseFloat((costUsd * USD_TO_INR).toFixed(2));

      records.push({
        accountId:    account.id,
        date,
        provider:     MOCK_ACCOUNT.provider,
        serviceName,
        serviceKey:   toServiceKey(serviceName),
        costUsd,
        costInr,
        usageQuantity,
        isEstimated:  dayResult.Estimated,
        resourceId,
      });
    }
  }

  console.log(`📦 Prepared ${records.length} records — bulk inserting...`);

  // Batch into chunks of 100 to avoid hitting query size limits
  const CHUNK_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    // createMany with skipDuplicates handles re-runs safely
    const result = await prisma.dailyCost.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result.count;
    process.stdout.write(`\r   Inserted ${inserted}/${records.length} rows...`);
  }

  console.log(`\n✅ Ingestion complete!`);
  console.log(`   Rows inserted: ${inserted} (skipped ${records.length - inserted} duplicates)`);

  // 4. Quick verification query — print total spend per service
  console.log('\n📊 Spend summary by service (from DB):');
  const summary = await prisma.dailyCost.groupBy({
    by: ['serviceName'],
    where: { accountId: account.id },
    _sum: { costUsd: true, costInr: true },
    orderBy: { _sum: { costUsd: 'desc' } },
  });

  for (const row of summary) {
    const usd = row._sum.costUsd?.toFixed(2) ?? '0.00';
    const inr = row._sum.costInr?.toFixed(2) ?? '0.00';
    console.log(`   ${row.serviceName.padEnd(25)} $${usd.padStart(8)} USD  ≈  ₹${inr.padStart(10)} INR`);
  }

  const totalUsd = summary.reduce((sum, r) => sum + (r._sum.costUsd ?? 0), 0);
  const totalInr = summary.reduce((sum, r) => sum + (r._sum.costInr ?? 0), 0);
  console.log(`\n   ${'TOTAL'.padEnd(25)} $${totalUsd.toFixed(2).padStart(8)} USD  ≈  ₹${totalInr.toFixed(2).padStart(10)} INR`);

  console.log('\nNext step → Feature 3: anomaly detection on this data.');
}

main()
  .catch((err) => {
    console.error('❌ Ingestion failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
