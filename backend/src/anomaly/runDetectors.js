'use strict';

/**
 * runDetectors.js
 *
 * Orchestrator: runs both anomaly detectors for all accounts,
 * then saves new alerts to the alert_events table.
 *
 * DEDUPLICATION:
 *   Before saving, we check if an identical alert already exists for the same
 *   (accountId, type, serviceName) that is still unresolved (resolvedAt = null).
 *   This prevents flooding the alert_events table when the detector runs daily.
 *
 * USAGE:
 *   node src/anomaly/runDetectors.js
 *
 *   Later (Feature 4+) this will be called on a schedule via node-cron.
 */

require('dotenv').config();

const prisma                = require('../db/prismaClient');
const { detectSpikes }      = require('./spikeDetector');
const { detectIdleResources } = require('./idleDetector');

const USD_TO_INR = parseFloat(process.env.USD_TO_INR_RATE || '84');

async function main() {
  console.log('CloudRakshak — Anomaly Detector');
  console.log('================================');

  // 1. Fetch all accounts
  const accounts = await prisma.account.findMany();

  if (accounts.length === 0) {
    console.log('No accounts found. Run the ingestion pipeline first.');
    process.exit(0);
  }

  let totalNewAlerts = 0;

  for (const account of accounts) {
    console.log(`\n🔍 Analysing account: [${account.provider}] ${account.accountAlias || account.accountId}`);

    // 2. Run both detectors
    const [spikeAlerts, idleAlerts] = await Promise.all([
      detectSpikes(account.id, USD_TO_INR),
      detectIdleResources(account.id, USD_TO_INR),
    ]);

    const allAlerts = [...spikeAlerts, ...idleAlerts];
    console.log(`  Found ${spikeAlerts.length} spike alert(s), ${idleAlerts.length} idle alert(s)`);

    if (allAlerts.length === 0) continue;

    // 3. Deduplicate — skip if an unresolved alert of same type+service already exists
    let savedCount = 0;

    for (const alert of allAlerts) {
      const existing = await prisma.alertEvent.findFirst({
        where: {
          accountId:   alert.accountId,
          type:        alert.type,
          serviceName: alert.serviceName,
          resolvedAt:  null,   // still active
        },
      });

      if (existing) {
        console.log(`  [skip] Duplicate alert already exists for ${alert.serviceName} (${alert.type})`);
        continue;
      }

      // 4. Save the new alert
      await prisma.alertEvent.create({
        data: {
          accountId:   alert.accountId,
          type:        alert.type,
          severity:    alert.severity,
          serviceName: alert.serviceName,
          resourceId:  alert.resourceId ?? null,
          description: alert.description,
          metadata:    alert.metadata,
          // sentAt and resolvedAt remain null — Telegram sender (Feature 4) will fill sentAt
        },
      });

      savedCount++;
      totalNewAlerts++;
    }

    console.log(`  ✅ Saved ${savedCount} new alert(s) to DB`);
  }

  // 5. Print a summary of ALL active (unsent) alerts
  console.log('\n📋 Active alerts in DB:');
  const activeAlerts = await prisma.alertEvent.findMany({
    where:   { resolvedAt: null },
    orderBy: { detectedAt: 'desc' },
    include: { account: { select: { accountAlias: true } } },
  });

  if (activeAlerts.length === 0) {
    console.log('  None.');
  } else {
    for (const a of activeAlerts) {
      const sent   = a.sentAt     ? '✉️  sent'    : '📬 unsent';
      const icon   = a.type === 'SPEND_SPIKE' ? '🔴' : '🟡';
      console.log(`  ${icon} [${a.severity}] ${a.serviceName} — ${a.type} — ${sent}`);
      console.log(`     "${a.description}"`);
    }
  }

  console.log(`\nTotal new alerts this run: ${totalNewAlerts}`);
  console.log('Next step → Feature 4: send these alerts to Telegram.');
}

main()
  .catch((err) => {
    console.error('❌ Detector run failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
