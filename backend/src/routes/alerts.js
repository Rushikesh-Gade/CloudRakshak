'use strict';

/**
 * alerts.js — /api/alerts routes
 *
 * GET /api/alerts
 *   Returns all active (unresolved) alert events, newest first.
 *   Used by the alerts list on the dashboard.
 *
 * PATCH /api/alerts/:id/resolve
 *   Marks an alert as resolved (sets resolvedAt = now).
 *   Used by the "Dismiss" button on the dashboard.
 */

const express = require('express');
const prisma  = require('../db/prismaClient');

const router = express.Router();

// GET /api/alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await prisma.alertEvent.findMany({
      where:   { resolvedAt: null },
      orderBy: { detectedAt: 'desc' },
      include: { account: { select: { accountAlias: true } } },
    });

    const data = alerts.map(a => ({
      id:          a.id,
      type:        a.type,
      severity:    a.severity,
      serviceName: a.serviceName,
      resourceId:  a.resourceId,
      description: a.description,
      detectedAt:  a.detectedAt,
      sentAt:      a.sentAt,
      metadata:    a.metadata,
      account:     a.account?.accountAlias || 'Unknown',
    }));

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('GET /alerts error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await prisma.alertEvent.update({
      where: { id },
      data:  { resolvedAt: new Date() },
    });

    res.json({ success: true, data: alert });
  } catch (err) {
    console.error('PATCH /alerts/:id/resolve error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
