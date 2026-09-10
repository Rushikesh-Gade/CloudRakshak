/**
 * SummaryCards.jsx
 *
 * Top row of the dashboard — 4 stat cards:
 *   1. Current month spend (INR)
 *   2. Projected month-end spend (INR)
 *   3. Day-over-day change %
 *   4. Active alerts count
 */

import React from 'react';
import { useApi } from '../hooks/useApi';

// Formats a number as Indian Rupees: ₹1,23,456
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style:    'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatCard({ title, value, subtitle, accent, icon }) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400 font-medium">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  );
}

export default function SummaryCards() {
  const { data, loading, error } = useApi('/api/summary');

  if (loading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-gray-900 rounded-xl p-5 border border-gray-800 h-28 animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg p-3">
      Failed to load summary: {error}
    </div>
  );

  const { currentMonth, dayOverDayChangePercent, activeAlertCount } = data;
  const dodPositive = dayOverDayChangePercent > 0;
  const dodColor    = dodPositive ? 'text-red-400' : 'text-green-400';
  const dodIcon     = dodPositive ? '📈' : '📉';
  const dodLabel    = `${dodPositive ? '+' : ''}${dayOverDayChangePercent}% vs yesterday`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="This Month So Far"
        value={formatINR(currentMonth.spentInr)}
        subtitle={`${currentMonth.daysElapsed} of ${currentMonth.daysInMonth} days elapsed`}
        accent="text-white"
        icon="💰"
      />
      <StatCard
        title="Projected Month-End"
        value={formatINR(currentMonth.projectedInr)}
        subtitle="Linear extrapolation"
        accent="text-brand-500"
        icon="🔮"
      />
      <StatCard
        title="Day-over-Day Change"
        value={`${dodPositive ? '+' : ''}${dayOverDayChangePercent}%`}
        subtitle={dodLabel}
        accent={dodColor}
        icon={dodIcon}
      />
      <StatCard
        title="Active Alerts"
        value={activeAlertCount}
        subtitle={activeAlertCount === 0 ? 'All clear ✅' : 'Needs attention'}
        accent={activeAlertCount > 0 ? 'text-yellow-400' : 'text-green-400'}
        icon="🚨"
      />
    </div>
  );
}
