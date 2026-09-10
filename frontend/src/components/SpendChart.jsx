/**
 * SpendChart.jsx
 *
 * Line chart showing daily total spend in INR over the last 30 days.
 * Built with Recharts — AreaChart for a nice visual fill.
 */

import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useApi } from '../hooks/useApi';

// Service colours — consistent across chart and pie
export const SERVICE_COLORS = {
  ec2:          '#6366f1',  // indigo
  s3:           '#22d3ee',  // cyan
  rds:          '#f59e0b',  // amber
  lambda:       '#a78bfa',  // violet
  cloudfront:   '#34d399',  // emerald
  datatransfer: '#fb7185',  // rose
};

const DEFAULT_COLOR = '#94a3b8';

// Custom tooltip shown on hover
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-gray-300 font-medium mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-mono">₹{Math.round(p.value).toLocaleString('en-IN')}</span>
        </div>
      ))}
      <div className="border-t border-gray-600 mt-2 pt-2 flex justify-between">
        <span className="text-gray-400">Total</span>
        <span className="text-white font-bold font-mono">₹{Math.round(total).toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

export default function SpendChart() {
  const [days, setDays]       = useState(30);
  const { data, loading, error } = useApi(`/api/costs/daily?days=${days}`);

  // Transform API response into Recharts format
  // Each row: { date: "Sep 01", ec2: 245, s3: 12, ... }
  const chartData = React.useMemo(() => {
    if (!data) return [];
    return data.map(day => {
      const row = {
        date: new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      };
      for (const svc of day.services) {
        row[svc.key] = Math.round(svc.costInr);
      }
      return row;
    });
  }, [data]);

  // Get unique service keys present in the data
  const serviceKeys = React.useMemo(() => {
    if (!data || !data[0]) return [];
    return data[0].services.map(s => ({ key: s.key, name: s.name }));
  }, [data]);

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-100">Daily Spend (INR)</h2>
        <div className="flex gap-1">
          {[7, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                days === d
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-64 flex items-center justify-center text-gray-500 animate-pulse">
          Loading chart data...
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {serviceKeys.map(s => (
                <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={SERVICE_COLORS[s.key] || DEFAULT_COLOR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={SERVICE_COLORS[s.key] || DEFAULT_COLOR} stopOpacity={0.0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#9ca3af', paddingTop: '12px' }}
              formatter={(value) => serviceKeys.find(s => s.key === value)?.name || value}
            />
            {serviceKeys.map(s => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={SERVICE_COLORS[s.key] || DEFAULT_COLOR}
                strokeWidth={2}
                fill={`url(#grad-${s.key})`}
                stackId="1"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
