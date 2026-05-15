// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState } from 'react';

interface StatsPanelProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export function StatsPanel({ children, defaultCollapsed = true }: StatsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="stats-panel">
      <button
        className="stats-panel-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '\u25B6' : '\u25BC'} Statistics
      </button>
      {!collapsed && (
        <div className="stats-panel-content">
          {children}
        </div>
      )}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
}

export function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="stat-item">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  );
}
