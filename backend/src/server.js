'use strict';

/**
 * server.js — CloudRakshak Express API server
 *
 * Serves the backend API that the React dashboard consumes.
 * Also runs the anomaly detector + Telegram sender on a schedule.
 *
 * Routes:
 *   GET  /api/costs/daily        → spend-over-time data
 *   GET  /api/costs/by-service   → per-service breakdown
 *   GET  /api/alerts             → active alert events
 *   PATCH /api/alerts/:id/resolve → dismiss an alert
 *   GET  /api/summary            → dashboard header stats
 */

require('dotenv').config();

const express = require('express');
const cron    = require('node-cron');

const costsRouter   = require('./routes/costs');
const alertsRouter  = require('./routes/alerts');
const summaryRouter = require('./routes/summary');

const { detectSpikes }        = require('./anomaly/spikeDetector');
const { detectIdleResources } = require('./anomaly/idleDetector');
const prisma                  = require('./db/prismaClient');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());

// CORS — allow the React dev server (port 5173) to call this API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/costs',   costsRouter);
app.use('/api/alerts',  alertsRouter);
app.use('/api/summary', summaryRouter);

// Health check — useful for deployment
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────

// Run anomaly detection every day at 9:00 AM IST (3:30 AM UTC)
// Format: second minute hour day month weekday
cron.schedule('0 30 3 * * *', async () => {
  console.log('[cron] Running anomaly detectors...');
  try {
    const accounts   = await prisma.account.findMany();
    const usdToInr   = parseFloat(process.env.USD_TO_INR_RATE || '84');

    for (const account of accounts) {
      const [spikes, idles] = await Promise.all([
        detectSpikes(account.id, usdToInr),
        detectIdleResources(account.id, usdToInr),
      ]);

      // Save new alerts (deduplication handled inside each save)
      for (const alert of [...spikes, ...idles]) {
        const existing = await prisma.alertEvent.findFirst({
          where: { accountId: alert.accountId, type: alert.type, serviceName: alert.serviceName, resolvedAt: null },
        });
        if (!existing) {
          await prisma.alertEvent.create({ data: alert });
        }
      }
    }
    console.log('[cron] Anomaly detection complete.');
  } catch (err) {
    console.error('[cron] Detector error:', err.message);
  }
}, { timezone: 'UTC' });

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nCloudRakshak API server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
