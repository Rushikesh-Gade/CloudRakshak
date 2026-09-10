/**
 * ServiceBreakdown.jsx
 *
 * Pie chart + table showing total spend per service for the current month.
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApi } from '../hooks/useApi';
import { SERVICE_COLORS } from './SpendChart';

const DEFAULT_COLOR = '#94a3b8';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-white font-medium">{item.name}</p>
      <p className="text-gray-300 font-mono">₹{item.value.toLocaleString('en-IN')}</p>
      <p className="text-gray-400">${item.payload.totalUsd.toFixed(2)} USD</p>
    </div>
  );
}

export default function ServiceBreakdown() {
  const { data, loading, error } = useApi('/api/costs/by-service?days=30');

  const totalInr = data?.reduce((s, r) => s + r.totalInr, 0) || 0;

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h2 className="text-base font-semibold text-gray-100 mb-4">
        Service Breakdown — Last 30 Days
      </h2>

      {loading && (
        <div className="h-48 flex items-center justify-center text-gray-500 animate-pulse">
          Loading...
        </div>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {!loading && !error && data && (
        <div className="flex flex-col gap-4">
          {/* Pie chart */}
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="totalInr"
                nameKey="serviceName"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.serviceKey}
                    fill={SERVICE_COLORS[entry.serviceKey] || DEFAULT_COLOR}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
                formatter={(value) => value}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Table */}
          <div className="divide-y divide-gray-800">
            {data.map((row) => {
              const pct = totalInr > 0 ? ((row.totalInr / totalInr) * 100).toFixed(1) : 0;
              const color = SERVICE_COLORS[row.serviceKey] || DEFAULT_COLOR;
              return (
                <div key={row.serviceKey} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-gray-300">{row.serviceName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-gray-500 text-xs w-10">{pct}%</span>
                    <span className="text-white font-mono w-24">
                      ₹{Math.round(row.totalInr).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 text-sm font-semibold">
              <span className="text-gray-400">Total</span>
              <span className="text-white font-mono">₹{Math.round(totalInr).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
