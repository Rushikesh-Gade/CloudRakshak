'use strict';

/**
 * spikeDetector.js
 *
 * Detects sudden spend spikes for each service.
 *
 * ALGORITHM (simple and explainable — no black-box ML):
 *   For each service on the most recent day in the DB:
 *     1. Calculate the 7-day rolling average cost (excluding today)
 *     2. Compare today's cost against that average
 *     3. If today > average × (1 + SPIKE_THRESHOLD), flag it as an alert
 *
 * WHY 7-DAY AVERAGE?
 *   - Short enough to catch recent trends
 *   - Long enough to smooth out normal day-to-day variation
 *   - Easy to explain: "your spend today is X% above your weekly average"
 *
 * SPIKE_THRESHOLD default = 0.30 (30%)
 *   Configurable via env var SPIKE_THRESHOLD_PERCENT
 */

const prisma = require('../db/prismaClient');

const SPIKE_THRESHOLD = parseFloat(process.env.SPIKE_THRESHOLD_PERCENT || '30') / 100;
const LOOKBACK_DAYS   = 7;   // how many days to average over

/**
 * Determines severity based on how much the spike exceeds the threshold.
 *
 * @param {number} ratio  - today / average (e.g. 2.5 means 2.5× the average)
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
function getSeverity(ratio) {
  if (ratio >= 3.0) return 'HIGH';
  if (ratio >= 1.8) return 'MEDIUM';
  return 'LOW';
}

/**
 * Runs the spike detector for a given account.
 *
 * @param {string} accountId  - the Account.id (cuid) to analyse
 * @param {number} usdToInr   - conversion rate for human-readable descriptions
 * @returns {Promise<Array>}  - array of alert objects (not yet saved to DB)
 */
async function detectSpikes(accountId, usdToInr = 84) {
  const alerts = [];

  // Step 1: Find the most recent date in the DB for this account
  const latest = await prisma.dailyCost.findFirst({
    where:   { accountId },
    orderBy: { date: 'desc' },
    select:  { date: true },
  });

  if (!latest) {
    console.log('  [spike] No data found for account — skipping.');
    return alerts;
  }

  const latestDate = latest.date;

  // Step 2: Get all services present on that latest date
  const todayRecords = await prisma.dailyCost.findMany({
    where: {
      accountId,
      date: latestDate,
    },
  });

  if (todayRecords.length === 0) {
    console.log('  [spike] No records for latest date — skipping.');
    return alerts;
  }

  // Step 3: For each service, fetch the previous LOOKBACK_DAYS days and compare
  for (const today of todayRecords) {
    // Get the N days BEFORE today for this service
    const history = await prisma.dailyCost.findMany({
      where: {
        accountId,
        serviceName: today.serviceName,
        date: { lt: latestDate },      // strictly before today
      },
      orderBy: { date: 'desc' },
      take: LOOKBACK_DAYS,             // last 7 days
    });

    if (history.length < 3) {
      // Not enough history to make a meaningful comparison — skip
      continue;
    }

    // Calculate rolling average
    const avgCostUsd = history.reduce((sum, r) => sum + r.costUsd, 0) / history.length;

    // Skip if average is near-zero (service was barely used anyway)
    if (avgCostUsd < 0.01) continue;

    const ratio = today.costUsd / avgCostUsd;

    if (ratio > 1 + SPIKE_THRESHOLD) {
      // It's a spike — build the alert
      const todayInr   = (today.costUsd * usdToInr).toFixed(0);
      const avgInr     = (avgCostUsd * usdToInr).toFixed(0);
      const pctIncrease = ((ratio - 1) * 100).toFixed(0);

      const description =
        `${today.serviceName} spend spiked ${ratio.toFixed(1)}× on ` +
        `${latestDate.toISOString().slice(0, 10)} — ` +
        `today: ₹${todayInr} vs 7-day avg: ₹${avgInr} (+${pctIncrease}%).`;

      alerts.push({
        accountId,
        type:        'SPEND_SPIKE',
        severity:    getSeverity(ratio),
        serviceName: today.serviceName,
        resourceId:  today.resourceId,
        description,
        metadata: {
          date:           latestDate.toISOString().slice(0, 10),
          todayCostUsd:   today.costUsd,
          todayCostInr:   parseFloat(todayInr),
          avgCostUsd:     parseFloat(avgCostUsd.toFixed(6)),
          avgCostInr:     parseFloat(avgInr),
          ratio:          parseFloat(ratio.toFixed(2)),
          pctIncrease:    parseInt(pctIncrease),
          lookbackDays:   history.length,
          threshold:      SPIKE_THRESHOLD,
        },
      });

      console.log(`  [spike] 🔴 ${today.serviceName}: ${ratio.toFixed(1)}× spike (${pctIncrease}% above avg) — ${getSeverity(ratio)}`);
    }
  }

  return alerts;
}

module.exports = { detectSpikes };
