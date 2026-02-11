// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import type { FilterConfig, InfoDefinition } from '../types';

interface VcfFilterBarProps {
  filter: FilterConfig;
  onFilterChange: (filter: FilterConfig) => void;
  options: {
    chroms: string[];
    filters: string[];
  };
  infoFields: InfoDefinition[];
  totalRows: number;
  filteredRows: number;
}

export function VcfFilterBar({
  filter,
  onFilterChange,
  options,
  infoFields,
  totalRows,
  filteredRows,
}: VcfFilterBarProps) {
  const hasFilters = filter.chrom || filter.filter || filter.minQual !== undefined || filter.infoKey;

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

      {/* Min QUAL filter */}
      <div className="filter-group">
        <label>Min QUAL:</label>
        <input
          type="number"
          value={filter.minQual ?? ''}
          onChange={(e) => onFilterChange({
            ...filter,
            minQual: e.target.value ? parseFloat(e.target.value) : undefined,
          })}
          placeholder="e.g., 30"
          style={{ width: 80 }}
        />
      </div>

      {/* INFO field filter */}
      <div className="filter-group">
        <label>INFO:</label>
        <select
          value={filter.infoKey || ''}
          onChange={(e) => onFilterChange({
            ...filter,
            infoKey: e.target.value || undefined,
            infoValue: e.target.value ? filter.infoValue : undefined,
          })}
          style={{ width: 100 }}
        >
          <option value="">None</option>
          {infoFields.map((field) => (
            <option key={field.id} value={field.id}>{field.id}</option>
          ))}
        </select>

        {filter.infoKey && (
          <>
            <select
              value={filter.infoOperator || '='}
              onChange={(e) => onFilterChange({
                ...filter,
                infoOperator: e.target.value as FilterConfig['infoOperator'],
              })}
              style={{ width: 50 }}
            >
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
            <input
              type="text"
              value={filter.infoValue || ''}
              onChange={(e) => onFilterChange({ ...filter, infoValue: e.target.value })}
              placeholder="value"
              style={{ width: 80 }}
            />
          </>
        )}
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
