'use strict';

/**
 * summary.js — /api/summary route
 *
 * GET /api/summary
 *   Returns a single summary object for the dashboard header:
 *   - Current month spend so far (INR + USD)
 *   - Projected month-end total (linear extrapolation)
 *   - Active alert count
 *   - Day-over-day change %
 */

const express = require('express');
const prisma  = require('../db/prismaClient');

const router = express.Router();

// GET /api/summary
router.get('/', async (req, res) => {
  try {
    const now            = new Date();
    const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth     = now.getDate();

    // Current month spend
    const monthSpend = await prisma.dailyCost.aggregate({
      where:  { date: { gte: monthStart } },
      _sum:   { costUsd: true, costInr: true },
    });

    const spentUsd = monthSpend._sum.costUsd || 0;
    const spentInr = monthSpend._sum.costInr || 0;

    // Projected month-end: simple linear extrapolation
    // projected = (spent so far / days elapsed) × total days in month
    const dailyAvgUsd    = dayOfMonth > 0 ? spentUsd / dayOfMonth : 0;
    const projectedUsd   = dailyAvgUsd * daysInMonth;
    const projectedInr   = projectedUsd * (parseFloat(process.env.USD_TO_INR_RATE) || 84);

    // Yesterday vs day before — day-over-day change
    const yesterday  = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(0,0,0,0);
    const dayBefore  = new Date(now); dayBefore.setDate(now.getDate() - 2); dayBefore.setHours(0,0,0,0);
    const dayAfterYesterday = new Date(yesterday); dayAfterYesterday.setDate(yesterday.getDate() + 1);
    const dayAfterDayBefore = new Date(dayBefore);  dayAfterDayBefore.setDate(dayBefore.getDate() + 1);

    const [ydaySpend, dbSpend] = await Promise.all([
      prisma.dailyCost.aggregate({
        where: { date: { gte: yesterday, lt: dayAfterYesterday } },
        _sum:  { costInr: true },
      }),
      prisma.dailyCost.aggregate({
        where: { date: { gte: dayBefore, lt: dayAfterDayBefore } },
        _sum:  { costInr: true },
      }),
    ]);

    const ydayInr   = ydaySpend._sum.costInr || 0;
    const dbInr     = dbSpend._sum.costInr   || 0;
    const dodChange = dbInr > 0
      ? parseFloat((((ydayInr - dbInr) / dbInr) * 100).toFixed(1))
      : 0;

    // Active alerts count
    const activeAlerts = await prisma.alertEvent.count({
      where: { resolvedAt: null },
    });

    res.json({
      success: true,
      data: {
        currentMonth: {
          spentUsd:     parseFloat(spentUsd.toFixed(2)),
          spentInr:     parseFloat(spentInr.toFixed(2)),
          projectedUsd: parseFloat(projectedUsd.toFixed(2)),
          projectedInr: parseFloat(projectedInr.toFixed(2)),
          daysElapsed:  dayOfMonth,
          daysInMonth,
        },
        dayOverDayChangePercent: dodChange,
        activeAlertCount:        activeAlerts,
      },
    });
  } catch (err) {
    console.error('GET /summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
