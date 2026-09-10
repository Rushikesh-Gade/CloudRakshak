/**
 * AlertsList.jsx
 *
 * Shows all active (unresolved) alert events.
 * Each card has a "Dismiss" button that calls PATCH /api/alerts/:id/resolve.
 */

import React from 'react';
import { useApi } from '../hooks/useApi';

const SEVERITY_STYLES = {
  HIGH:   { border: 'border-red-800',    bg: 'bg-red-950',    badge: 'bg-red-900 text-red-300',    icon: '🔴' },
  MEDIUM: { border: 'border-yellow-800', bg: 'bg-yellow-950', badge: 'bg-yellow-900 text-yellow-300', icon: '🟡' },
  LOW:    { border: 'border-blue-800',   bg: 'bg-blue-950',   badge: 'bg-blue-900 text-blue-300',   icon: '🔵' },
};

const TYPE_LABEL = {
  SPEND_SPIKE:   '📈 Spend Spike',
  IDLE_RESOURCE: '💤 Idle Resource',
};

function AlertCard({ alert, onDismiss }) {
  const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.LOW;

  const detectedAt = new Date(alert.detectedAt).toLocaleString('en-IN', {
    timeZone:  'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className={`rounded-xl border p-4 ${style.border} ${style.bg} flex flex-col gap-2`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
            {style.icon} {alert.severity}
          </span>
          <span className="text-xs text-gray-400">{TYPE_LABEL[alert.type] || alert.type}</span>
          <span className="text-xs text-gray-500">·</span>
          <span className="text-xs text-gray-400 font-medium">{alert.serviceName}</span>
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded-md transition-colors flex-shrink-0"
        >
          Dismiss
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-200 leading-relaxed">{alert.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
        <span>🕐 {detectedAt} IST</span>
        {alert.sentAt
          ? <span className="text-green-600">✉️ Sent to Telegram</span>
          : <span className="text-gray-600">📬 Not yet sent</span>
        }
      </div>
    </div>
  );
}

export default function AlertsList() {
  const { data, loading, error, refetch } = useApi('/api/alerts');

  async function handleDismiss(id) {
    try {
      await fetch(`/api/alerts/${id}/resolve`, { method: 'PATCH' });
      refetch();  // refresh the list
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-100">Active Alerts</h2>
        {data && data.length > 0 && (
          <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
            {data.length} active
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && data?.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm">No active alerts — your cloud spend looks healthy!</p>
        </div>
      )}

      {!loading && !error && data?.length > 0 && (
        <div className="space-y-3">
          {data.map(alert => (
            <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
