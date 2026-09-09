/**
 * generateMockData.js
 *
 * Generates realistic fake AWS Cost Explorer billing data for CloudRakshak.
 *
 * WHY THIS EXISTS:
 *   We want to develop and demo the entire app without a live AWS account.
 *   This script produces data in the exact shape that the real AWS Cost Explorer
 *   API returns, so when we swap in the real API (Feature 6), nothing else changes.
 *
 * OUTPUT:
 *   backend/scripts/output/mock_billing_data.json
 *
 * WHAT IT SIMULATES:
 *   - 90 days of daily cost records (3 months of history)
 *   - 6 common AWS services with realistic INR-range spend
 *   - 2-3 sudden spend spikes (forgotten instance, runaway lambda, etc.)
 *   - 2 idle resource windows (near-zero spend for 7+ consecutive days)
 *
 * RUN:
 *   node scripts/generateMockData.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // How many days of history to generate
  days: 90,

  // Account metadata (mimics a real AWS account)
  accountId: '123456789012',
  accountAlias: 'my-startup-account',

  // USD → INR conversion rate (matches .env.example)
  usdToInr: 84,

  // Where to write the output file
  outputDir: path.join(__dirname, 'output'),
  outputFile: 'mock_billing_data.json',
};

/**
 * AWS services we're simulating, with their daily spend baseline in USD.
 *
 * baseLow / baseHigh: the normal "quiet" daily range for this service.
 * resourceId: a fake ARN / resource identifier (used for idle-resource alerts).
 */
const SERVICES = [
  {
    name: 'Amazon EC2',
    key: 'ec2',
    baseLow: 1.20,   // ~₹100/day at quiet times
    baseHigh: 3.50,  // ~₹294/day on a busy day
    resourceId: 'arn:aws:ec2:ap-south-1:123456789012:instance/i-0abc123def456',
  },
  {
    name: 'Amazon S3',
    key: 's3',
    baseLow: 0.05,
    baseHigh: 0.40,
    resourceId: 'arn:aws:s3:::my-startup-assets',
  },
  {
    name: 'Amazon RDS',
    key: 'rds',
    baseLow: 0.80,
    baseHigh: 1.60,
    resourceId: 'arn:aws:rds:ap-south-1:123456789012:db:my-startup-db',
  },
  {
    name: 'AWS Lambda',
    key: 'lambda',
    baseLow: 0.00,
    baseHigh: 0.15,
    resourceId: 'arn:aws:lambda:ap-south-1:123456789012:function:api-handler',
  },
  {
    name: 'Amazon CloudFront',
    key: 'cloudfront',
    baseLow: 0.10,
    baseHigh: 0.60,
    resourceId: 'arn:aws:cloudfront::123456789012:distribution/EXAMPLEID',
  },
  {
    name: 'AWS Data Transfer',
    key: 'datatransfer',
    baseLow: 0.02,
    baseHigh: 0.30,
    resourceId: 'arn:aws:ec2:ap-south-1:123456789012:network-interface/eni-0xyz',
  },
];

/**
 * Spend spikes: on specific day offsets (from day 0 = start date),
 * a particular service's cost multiplies suddenly.
 * This simulates: forgotten instance, accidental large data download, etc.
 */
const SPEND_SPIKES = [
  { dayOffset: 20, serviceKey: 'ec2',          multiplier: 4.5, reason: 'Forgot to stop EC2 after load test' },
  { dayOffset: 21, serviceKey: 'ec2',          multiplier: 4.5, reason: 'Forgot to stop EC2 after load test (day 2)' },
  { dayOffset: 22, serviceKey: 'ec2',          multiplier: 4.2, reason: 'Forgot to stop EC2 after load test (day 3)' },
  { dayOffset: 55, serviceKey: 'datatransfer', multiplier: 8.0, reason: 'Accidental large S3 download' },
  { dayOffset: 72, serviceKey: 'lambda',       multiplier: 12.0, reason: 'Runaway Lambda invocation loop' },
  { dayOffset: 73, serviceKey: 'lambda',       multiplier: 10.0, reason: 'Runaway Lambda invocation loop (day 2)' },
];

/**
 * Idle windows: between startDay and endDay (inclusive), a service's spend
 * drops to near-zero. This simulates a dev leaving a resource provisioned
 * but not actually using it.
 */
const IDLE_WINDOWS = [
  { serviceKey: 'rds',   startDay: 35, endDay: 48, idleCostPerDay: 0.02 },
  { serviceKey: 'ec2',   startDay: 60, endDay: 75, idleCostPerDay: 0.05 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a random float between min and max, rounded to 6 decimal places.
 * (Cost Explorer returns 6 decimal places in its API responses.)
 */
function randomBetween(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(6));
}

/**
 * Adds `days` days to a Date object and returns a new Date.
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Formats a Date as "YYYY-MM-DD" — the format Cost Explorer uses.
 */
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

// ─── Core Generator ───────────────────────────────────────────────────────────

/**
 * Builds a lookup maps for spikes and idle windows so we can check O(1)
 * during the main loop.
 */
function buildLookups() {
  // spikeMap: "dayOffset-serviceKey" → multiplier
  const spikeMap = {};
  for (const spike of SPEND_SPIKES) {
    spikeMap[`${spike.dayOffset}-${spike.serviceKey}`] = spike.multiplier;
  }

  // idleMap: "dayOffset-serviceKey" → idleCostPerDay
  const idleMap = {};
  for (const idle of IDLE_WINDOWS) {
    for (let d = idle.startDay; d <= idle.endDay; d++) {
      idleMap[`${d}-${idle.serviceKey}`] = idle.idleCostPerDay;
    }
  }

  return { spikeMap, idleMap };
}

/**
 * Generates the full dataset.
 *
 * Returns an object shaped like the AWS Cost Explorer GetCostAndUsage response:
 * {
 *   ResultsByTime: [
 *     {
 *       TimePeriod: { Start: "2026-06-11", End: "2026-06-12" },
 *       Total: {},           // empty — we use Groups not Total
 *       Groups: [
 *         {
 *           Keys: ["Amazon EC2"],
 *           Metrics: {
 *             BlendedCost: { Amount: "2.345678", Unit: "USD" }
 *           }
 *         },
 *         ...
 *       ],
 *       Estimated: false
 *     },
 *     ...
 *   ],
 *   // CloudRakshak-specific metadata (not in the real API — we add it for convenience)
 *   _meta: {
 *     generatedAt: "...",
 *     accountId: "...",
 *     accountAlias: "...",
 *     currency: "USD",
 *     usdToInr: 84,
 *     periodStart: "...",
 *     periodEnd: "...",
 *     totalDays: 90,
 *     injectedAnomalies: { spikes: [...], idleWindows: [...] }
 *   }
 * }
 */
function generateMockData() {
  const { spikeMap, idleMap } = buildLookups();

  // Start date = 90 days ago from today
  const today     = new Date();
  const startDate = addDays(today, -CONFIG.days);

  const resultsByTime = [];

  for (let dayOffset = 0; dayOffset < CONFIG.days; dayOffset++) {
    const periodStart = addDays(startDate, dayOffset);
    const periodEnd   = addDays(startDate, dayOffset + 1);

    const groups = SERVICES.map((service) => {
      const spikeKey = `${dayOffset}-${service.key}`;
      const idleKey  = `${dayOffset}-${service.key}`;

      let amount;

      if (idleMap[idleKey] !== undefined) {
        // Idle window: near-zero cost (resource is provisioned but unused)
        amount = idleMap[idleKey];
      } else {
        // Normal baseline spend
        amount = randomBetween(service.baseLow, service.baseHigh);

        if (spikeMap[spikeKey]) {
          // Apply spike multiplier on top of baseline
          amount = parseFloat((amount * spikeMap[spikeKey]).toFixed(6));
        }
      }

      return {
        Keys: [service.name],
        Metrics: {
          BlendedCost: {
            Amount: amount.toFixed(6),
            Unit: 'USD',
          },
          // UsageQuantity is also returned by Cost Explorer — useful for
          // idle detection (0 usage but non-zero cost = zombie resource)
          UsageQuantity: {
            Amount: amount < 0.03
              ? '0.000000'                                   // truly idle
              : randomBetween(1, 500).toFixed(6),            // some usage units
            Unit: 'N/A',
          },
        },
        // Extra fields CloudRakshak uses internally (not in the real API)
        _resourceId: service.resourceId,
      };
    });

    resultsByTime.push({
      TimePeriod: {
        Start: toDateString(periodStart),
        End:   toDateString(periodEnd),
      },
      Total: {},          // Cost Explorer returns this empty when Groups are requested
      Groups: groups,
      Estimated: dayOffset >= CONFIG.days - 3,  // last 3 days are "estimated" (like the real API)
    });
  }

  // ── Assemble the final output object ──
  return {
    ResultsByTime: resultsByTime,

    // CloudRakshak metadata block — not part of the real AWS API response.
    // We strip this before saving to the DB; it's here for developer clarity.
    _meta: {
      generatedAt:    new Date().toISOString(),
      accountId:      CONFIG.accountId,
      accountAlias:   CONFIG.accountAlias,
      currency:       'USD',
      usdToInr:       CONFIG.usdToInr,
      periodStart:    toDateString(startDate),
      periodEnd:      toDateString(today),
      totalDays:      CONFIG.days,
      injectedAnomalies: {
        spikes: SPEND_SPIKES.map(s => ({
          date:        toDateString(addDays(startDate, s.dayOffset)),
          service:     s.serviceKey,
          multiplier:  s.multiplier,
          reason:      s.reason,
        })),
        idleWindows: IDLE_WINDOWS.map(w => ({
          service:   w.serviceKey,
          startDate: toDateString(addDays(startDate, w.startDay)),
          endDate:   toDateString(addDays(startDate, w.endDay)),
          days:      w.endDay - w.startDay + 1,
        })),
      },
    },
  };
}

// ─── Write Output ─────────────────────────────────────────────────────────────

function main() {
  console.log('CloudRakshak — Mock Data Generator');
  console.log('====================================');

  // Make sure the output directory exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    console.log(`Created output directory: ${CONFIG.outputDir}`);
  }

  console.log(`Generating ${CONFIG.days} days of billing data for ${SERVICES.length} services...`);

  const data       = generateMockData();
  const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFile);

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

  // ── Print a human-readable summary ──
  console.log('\n✅ Done!');
  console.log(`📄 Output: ${outputPath}`);
  console.log(`📅 Period: ${data._meta.periodStart}  →  ${data._meta.periodEnd}`);
  console.log(`📦 Total daily records: ${data.ResultsByTime.length}`);

  // Calculate total mock spend
  let totalUsd = 0;
  for (const day of data.ResultsByTime) {
    for (const group of day.Groups) {
      totalUsd += parseFloat(group.Metrics.BlendedCost.Amount);
    }
  }
  const totalInr = (totalUsd * CONFIG.usdToInr).toFixed(2);
  console.log(`💰 Total mock spend: $${totalUsd.toFixed(2)} USD  ≈  ₹${totalInr} INR`);

  console.log('\n🚨 Injected anomalies:');
  console.log('  Spend spikes:');
  for (const spike of data._meta.injectedAnomalies.spikes) {
    console.log(`    • ${spike.date}  [${spike.service}]  ×${spike.multiplier}  — ${spike.reason}`);
  }
  console.log('  Idle windows:');
  for (const idle of data._meta.injectedAnomalies.idleWindows) {
    console.log(`    • ${idle.service}  idle from ${idle.startDate} to ${idle.endDate}  (${idle.days} days)`);
  }

  console.log('\nNext step → Feature 2: wire this file into the DB ingestion pipeline.');
}

main();
