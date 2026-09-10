'use strict';

/**
 * costs.js — /api/costs routes
 *
 * GET /api/costs/daily?days=30
 *   Returns daily cost records grouped by date for the last N days.
 *   Used by the spend-over-time line chart.
 *
 * GET /api/costs/by-service?days=30
 *   Returns total cost per service for the last N days.
 *   Used by the pie chart / service breakdown.
 */

const express = require('express');
const prisma  = require('../db/prismaClient');

const router = express.Router();

// Helper: get the date N days ago
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/costs/daily?days=30
router.get('/daily', async (req, res) => {
  try {
    const days      = parseInt(req.query.days) || 30;
    const sinceDate = daysAgo(days);

    // Get all daily cost records within the range
    const records = await prisma.dailyCost.findMany({
      where:   { date: { gte: sinceDate } },
      orderBy: { date: 'asc' },
      select: {
        date:        true,
        serviceName: true,
        serviceKey:  true,
        costUsd:     true,
        costInr:     true,
      },
    });

    // Group by date → { date: "2026-09-01", services: [...], totalInr: 500 }
    const grouped = {};
    for (const r of records) {
      const dateStr = r.date.toISOString().slice(0, 10);
      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, services: [], totalUsd: 0, totalInr: 0 };
      }
      grouped[dateStr].services.push({
        name:    r.serviceName,
        key:     r.serviceKey,
        costUsd: r.costUsd,
        costInr: r.costInr,
      });
      grouped[dateStr].totalUsd += r.costUsd;
      grouped[dateStr].totalInr += r.costInr;
    }

    const result = Object.values(grouped).map(d => ({
      ...d,
      totalUsd: parseFloat(d.totalUsd.toFixed(2)),
      totalInr: parseFloat(d.totalInr.toFixed(2)),
    }));

    res.json({ success: true, days, data: result });
  } catch (err) {
    console.error('GET /costs/daily error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/costs/by-service?days=30
router.get('/by-service', async (req, res) => {
  try {
    const days      = parseInt(req.query.days) || 30;
    const sinceDate = daysAgo(days);

    const summary = await prisma.dailyCost.groupBy({
      by:    ['serviceName', 'serviceKey'],
      where: { date: { gte: sinceDate } },
      _sum:  { costUsd: true, costInr: true },
      orderBy: { _sum: { costInr: 'desc' } },
    });

    const data = summary.map(r => ({
      serviceName: r.serviceName,
      serviceKey:  r.serviceKey,
      totalUsd:    parseFloat((r._sum.costUsd || 0).toFixed(2)),
      totalInr:    parseFloat((r._sum.costInr || 0).toFixed(2)),
    }));

    res.json({ success: true, days, data });
  } catch (err) {
    console.error('GET /costs/by-service error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
