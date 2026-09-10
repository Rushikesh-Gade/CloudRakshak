/**
 * App.jsx — CloudRakshak Dashboard
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Header (logo + account badge)           │
 *   ├─────────────────────────────────────────┤
 *   │  SummaryCards (4 stat cards)             │
 *   ├───────────────────────┬─────────────────┤
 *   │  SpendChart (2/3)     │ ServiceBreakdown │
 *   │                       │ (1/3)            │
 *   ├───────────────────────┴─────────────────┤
 *   │  AlertsList (full width)                 │
 *   └─────────────────────────────────────────┘
 */

import React from 'react';
import SummaryCards     from './components/SummaryCards';
import SpendChart       from './components/SpendChart';
import ServiceBreakdown from './components/ServiceBreakdown';
import AlertsList       from './components/AlertsList';

function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-2xl">☁️</span>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">CloudRakshak</h1>
          <p className="text-xs text-gray-500">Multi-cloud cost monitor</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full border border-gray-700">
          🏦 my-startup-account
        </span>
        <span className="text-xs bg-green-950 text-green-400 px-3 py-1 rounded-full border border-green-900">
          ● Live (Mock Data)
        </span>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Summary stat cards */}
        <SummaryCards />

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SpendChart />
          </div>
          <div className="lg:col-span-1">
            <ServiceBreakdown />
          </div>
        </div>

        {/* Alerts */}
        <AlertsList />

        {/* Footer */}
        <footer className="text-center text-xs text-gray-700 pb-4">
          CloudRakshak ☁️🛡️ — Final Year B.Tech Project · Data refreshed on page load
        </footer>

      </main>
    </div>
  );
}
