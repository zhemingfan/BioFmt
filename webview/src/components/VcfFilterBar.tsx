// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import type { FilterConfig } from '../types';

interface VcfFilterBarProps {
  filter: FilterConfig;
  onFilterChange: (filter: FilterConfig) => void;
  options: {
    chroms: string[];
    filters: string[];
  };
  totalRows: number;
  filteredRows: number;
}

export function VcfFilterBar({
  filter,
  onFilterChange,
  options,
  totalRows,
  filteredRows,
}: VcfFilterBarProps) {
  const hasFilters = filter.chrom || filter.id || filter.filter;

  return (
    <div className="filter-bar">
      {/* Chromosome filter */}
      <div className="filter-group">
        <label>CHROM:</label>
        <select
          value={filter.chrom || ''}
          onChange={(e) => onFilterChange({ ...filter, chrom: e.target.value || undefined })}
        >
          <option value="">All</option>
          {options.chroms.map((chrom) => (
            <option key={chrom} value={chrom}>{chrom}</option>
          ))}
        </select>
      </div>

      {/* ID search */}
      <div className="filter-group">
        <label>ID:</label>
        <input
          type="text"
          value={filter.id || ''}
          onChange={(e) => onFilterChange({ ...filter, id: e.target.value || undefined })}
          placeholder="Search ID…"
          style={{ width: 120 }}
        />
      </div>

      {/* FILTER filter */}
      <div className="filter-group">
        <label>FILTER:</label>
        <select
          value={filter.filter || ''}
          onChange={(e) => onFilterChange({ ...filter, filter: e.target.value || undefined })}
        >
          <option value="">All</option>
          {options.filters.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          className="filter-clear"
          onClick={() => onFilterChange({})}
        >
          Clear filters
        </button>
      )}

      {/* Status */}
      <div className="filter-status">
        {filteredRows === totalRows
          ? `${totalRows.toLocaleString()} rows`
          : `${filteredRows.toLocaleString()} of ${totalRows.toLocaleString()} rows`}
      </div>
    </div>
  );
}
