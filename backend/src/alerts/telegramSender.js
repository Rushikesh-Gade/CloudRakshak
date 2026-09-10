'use strict';

/**
 * telegramSender.js
 *
 * Sends CloudRakshak alert messages to a Telegram chat via the Bot API.
 *
 * HOW IT WORKS:
 *   1. Fetches all unsent alerts (sentAt = null) from the DB
 *   2. Formats each one into a clean Telegram message with emoji + INR amounts
 *   3. POSTs to https://api.telegram.org/bot<TOKEN>/sendMessage
 *   4. Marks each alert as sent (sets sentAt = now) in the DB
 *
 * Telegram message format uses MarkdownV2 so we get bold/code styling.
 *
 * USAGE:
 *   node src/alerts/telegramSender.js
 *
 *   Later this will be called automatically after runDetectors.js (Feature 4+)
 */

require('dotenv').config();

const https  = require('https');
const prisma = require('../db/prismaClient');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

// ─── Telegram API helper ──────────────────────────────────────────────────────

/**
 * Sends a message to Telegram via the Bot API.
 * Returns a Promise that resolves when the message is delivered.
 *
 * @param {string} text  - message text (HTML formatted)
 */
function sendTelegramMessage(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id:    CHAT_ID,
      text:       text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (!json.ok) {
          reject(new Error(`Telegram API error: ${json.description}`));
        } else {
          resolve(json);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Message Formatter ────────────────────────────────────────────────────────

/**
 * Escapes special HTML characters to prevent parse errors.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formats an AlertEvent DB record into a Telegram HTML message.
 *
 * Example output:
 * ━━━━━━━━━━━━━━━━━━━━
 * 🔴 HIGH SPEND SPIKE
 * ━━━━━━━━━━━━━━━━━━━━
 * Service: Amazon EC2
 * Account: my-startup-account
 *
 * EC2 spend spiked 4.5× today — ₹1,176 vs 7-day avg ₹280 (+321%)
 *
 * 🕐 Detected: 10 Sep 2026, 10:30 AM
 * ━━━━━━━━━━━━━━━━━━━━
 */
function formatAlertMessage(alert, accountAlias) {
  const severityEmoji = {
    HIGH:   '🔴',
    MEDIUM: '🟡',
    LOW:    '🔵',
  }[alert.severity] || '⚪';

  const typeLabel = alert.type === 'SPEND_SPIKE' ? 'SPEND SPIKE' : 'IDLE RESOURCE';

  const detectedAt = new Date(alert.detectedAt).toLocaleString('en-IN', {
    timeZone:  'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const separator = '━━━━━━━━━━━━━━━━━━━━';

  return [
    separator,
    `${severityEmoji} <b>${alert.severity} ${typeLabel}</b>`,
    separator,
    `<b>Service:</b> ${escapeHtml(alert.serviceName)}`,
    `<b>Account:</b> ${escapeHtml(accountAlias || 'Unknown')}`,
    '',
    escapeHtml(alert.description),
    '',
    `🕐 <b>Detected:</b> ${escapeHtml(detectedAt)}`,
    separator,
    `<i>Sent by CloudRakshak ☁️🛡️</i>`,
  ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('CloudRakshak — Telegram Alert Sender');
  console.log('=====================================');

  // Validate config
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env');
    process.exit(1);
  }

  // Fetch all unsent alerts with their account info
  const unsentAlerts = await prisma.alertEvent.findMany({
    where:   { sentAt: null, resolvedAt: null },
    orderBy: { detectedAt: 'asc' },
    include: { account: { select: { accountAlias: true, accountId: true } } },
  });

  if (unsentAlerts.length === 0) {
    console.log('✅ No unsent alerts — nothing to send.');
    return;
  }

  console.log(`📬 Found ${unsentAlerts.length} unsent alert(s) — sending to Telegram...`);

  let sentCount   = 0;
  let failedCount = 0;

  for (const alert of unsentAlerts) {
    const accountAlias = alert.account?.accountAlias || alert.account?.accountId;

    try {
      const message = formatAlertMessage(alert, accountAlias);
      await sendTelegramMessage(message);

      // Mark as sent in the DB
      await prisma.alertEvent.update({
        where: { id: alert.id },
        data:  { sentAt: new Date() },
      });

      sentCount++;
      console.log(`  ✅ Sent: [${alert.severity}] ${alert.serviceName} — ${alert.type}`);

      // Small delay between messages to avoid hitting Telegram rate limits
      // (Telegram allows ~30 messages/second to the same chat)
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      failedCount++;
      console.error(`  ❌ Failed to send alert for ${alert.serviceName}:`, err.message);
    }
  }

  console.log(`\n📊 Summary: ${sentCount} sent, ${failedCount} failed`);

  if (sentCount > 0) {
    console.log('Check your Telegram — you should see the alerts in @CloudRakshak_Bot');
  }
}

main()
  .catch(err => {
    console.error('❌ Sender crashed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
