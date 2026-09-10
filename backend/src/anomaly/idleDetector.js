'use strict';

/**
 * idleDetector.js
 *
 * Detects resources that are provisioned but not actually being used.
 *
 * ALGORITHM:
 *   For each service, look at the last N days in the DB.
 *   If usageQuantity = 0 (or near-zero) for IDLE_THRESHOLD_DAYS consecutive
 *   days AND cost > 0 (resource is still running and billing), flag it.
 *
 * WHY THIS MATTERS:
 *   A forgotten RDS instance or stopped-but-not-terminated EC2 costs money
 *   every hour even if nothing is using it. This is one of the most common
 *   budget killers for students and small teams.
 *
 * IDLE_THRESHOLD_DAYS default = 7
 *   Configurable via env var IDLE_THRESHOLD_DAYS
 */

const prisma = require('../db/prismaClient');

const IDLE_THRESHOLD_DAYS  = parseInt(process.env.IDLE_THRESHOLD_DAYS || '7');
const NEAR_ZERO_USAGE      = 0.001;   // treat anything below this as "zero usage"
const MIN_IDLE_COST_USD    = 0.01;    // ignore truly free resources (< 1 cent/day)

/**
 * Determines severity based on how many days idle and estimated total cost.
 *
 * @param {number} days       - consecutive idle days
 * @param {number} totalCostUsd
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
function getSeverity(days, totalCostUsd) {
  if (days >= 14 || totalCostUsd >= 10) return 'HIGH';
  if (days >= 7  || totalCostUsd >= 3)  return 'MEDIUM';
  return 'LOW';
}

/**
 * Runs the idle resource detector for a given account.
 *
 * @param {string} accountId
 * @param {number} usdToInr
 * @returns {Promise<Array>}  - array of alert objects (not yet saved to DB)
 */
async function detectIdleResources(accountId, usdToInr = 84) {
  const alerts = [];

  // Get the most recent date
  const latest = await prisma.dailyCost.findFirst({
    where:   { accountId },
    orderBy: { date: 'desc' },
    select:  { date: true },
  });

  if (!latest) return alerts;

  const latestDate = latest.date;

  // Get all distinct services for this account
  const services = await prisma.dailyCost.findMany({
    where:    { accountId, date: latestDate },
    select:   { serviceName: true, resourceId: true },
    distinct: ['serviceName'],
  });

  for (const { serviceName, resourceId } of services) {
    // Fetch the last IDLE_THRESHOLD_DAYS records for this service
    const recentDays = await prisma.dailyCost.findMany({
      where: {
        accountId,
        serviceName,
        date: { lte: latestDate },
      },
      orderBy: { date: 'desc' },
      take: IDLE_THRESHOLD_DAYS,
    });

    if (recentDays.length < IDLE_THRESHOLD_DAYS) {
      // Not enough history yet
      continue;
    }

    // Check: are ALL of the last N days idle (zero usage, non-zero cost)?
    const allIdle = recentDays.every(
      (r) => r.usageQuantity <= NEAR_ZERO_USAGE && r.costUsd >= MIN_IDLE_COST_USD
    );

    if (!allIdle) continue;

    // Count how many consecutive idle days (could be more than IDLE_THRESHOLD_DAYS)
    // We look back further to give the full picture
    const extendedHistory = await prisma.dailyCost.findMany({
      where: {
        accountId,
        serviceName,
        date: { lte: latestDate },
      },
      orderBy: { date: 'desc' },
      take: 60,   // look back up to 60 days
    });

    let consecutiveIdleDays = 0;
    let totalIdleCostUsd    = 0;

    for (const record of extendedHistory) {
      if (record.usageQuantity <= NEAR_ZERO_USAGE && record.costUsd >= MIN_IDLE_COST_USD) {
        consecutiveIdleDays++;
        totalIdleCostUsd += record.costUsd;
      } else {
        break;  // streak broken — stop counting
      }
    }

    const totalIdleCostInr = (totalIdleCostUsd * usdToInr).toFixed(0);
    const dailyAvgInr      = ((totalIdleCostUsd / consecutiveIdleDays) * usdToInr).toFixed(0);

    const description =
      `${serviceName} has had zero usage for ${consecutiveIdleDays} consecutive days ` +
      `but is still billing ~₹${dailyAvgInr}/day. ` +
      `Total wasted cost: ₹${totalIdleCostInr}. Consider stopping or deleting this resource.`;

    alerts.push({
      accountId,
      type:        'IDLE_RESOURCE',
      severity:    getSeverity(consecutiveIdleDays, totalIdleCostUsd),
      serviceName,
      resourceId,
      description,
      metadata: {
        consecutiveIdleDays,
        totalIdleCostUsd:   parseFloat(totalIdleCostUsd.toFixed(4)),
        totalIdleCostInr:   parseInt(totalIdleCostInr),
        dailyAvgCostInr:    parseInt(dailyAvgInr),
        idleSince:          extendedHistory[consecutiveIdleDays - 1]?.date
                              .toISOString().slice(0, 10),
        threshold:          IDLE_THRESHOLD_DAYS,
      },
    });

    console.log(`  [idle] 🟡 ${serviceName}: idle ${consecutiveIdleDays} days, wasted ₹${totalIdleCostInr} — ${getSeverity(consecutiveIdleDays, totalIdleCostUsd)}`);
  }

  return alerts;
}

module.exports = { detectIdleResources };
