// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState, useCallback } from 'react';
import type { ReferenceInfo } from '../types';

interface RegionNavigatorProps {
  references: ReferenceInfo[];
  onNavigate: (chrom: string, start: number, end: number) => void;
  loading?: boolean;
  resultCount?: number;
  hasMore?: boolean;
  error?: string | null;
  currentQuery?: { chrom: string; start: number; end: number } | null;
}

/**
 * Shared region navigation bar for indexed/binary file previews.
 * Accepts `chr:start-end` for a range or `chr:position` for a 10kb window.
 */
export function RegionNavigator({
  references,
  onNavigate,
  loading = false,
  resultCount,
  hasMore,
  error,
  currentQuery,
}: RegionNavigatorProps) {
  const [regionText, setRegionText] = useState('');

  const handleGo = useCallback(() => {
    const trimmed = regionText.trim();
    if (!trimmed) return;

    // Try "chr1:1000000-2000000" or "chr1:1,000,000-2,000,000"
    const rangeMatch = trimmed.match(/^(\S+):([0-9,]+)-([0-9,]+)$/);
    if (rangeMatch) {
      const c = rangeMatch[1];
      const s = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
      const e = parseInt(rangeMatch[3].replace(/,/g, ''), 10);
      if (isNaN(s) || isNaN(e) || s < 0 || e <= s) return;
      onNavigate(c, s, e);
      return;
    }

    // Try "chr1:1000000" — single position, create 10kb window
    const posMatch = trimmed.match(/^(\S+):([0-9,]+)$/);
    if (posMatch) {
      const c = posMatch[1];
      const pos = parseInt(posMatch[2].replace(/,/g, ''), 10);
      if (isNaN(pos) || pos < 0) return;
      const s = Math.max(0, pos - 5000);
      const e = pos + 5000;
      onNavigate(c, s, e);
      return;
    }

    // Try bare chromosome name (e.g. "chr1") — query first 1Mb
    const ref = references.find((r) => r.name === trimmed);
    if (ref) {
      onNavigate(ref.name, 0, 1000000);
    }
  }, [regionText, onNavigate, references]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleGo();
      }
    },
    [handleGo]
  );

  return (
    <div className="region-navigator">
      <div className="region-navigator-row">
        <input
          type="text"
          className="region-text-input"
          placeholder="chr1:1000000-2000000 or chr1:500000"
          value={regionText}
          onChange={(e) => setRegionText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        <button onClick={handleGo} disabled={loading || !regionText.trim()}>
          {loading ? 'Loading...' : 'Go'}
        </button>

        {references.length > 0 && (
          <select
            className="region-chrom-select"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setRegionText(e.target.value + ':0-1000000');
              }
            }}
            disabled={loading}
          >
            <option value="">Jump to chrom...</option>
            {references.map((ref) => (
              <option key={ref.name} value={ref.name}>
                {ref.name}
                {ref.length != null ? ` (${ref.length.toLocaleString()} bp)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {currentQuery && resultCount != null && !loading && (
        <div className="region-navigator-status">
          Showing {resultCount.toLocaleString()} records in{' '}
          {currentQuery.chrom}:{currentQuery.start.toLocaleString()}-
          {currentQuery.end.toLocaleString()}
          {hasMore && (
            <span className="region-truncated">
              {' '}(truncated — narrow the region for more)
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="region-navigator-error">{error}</div>
      )}
    </div>
  );
}
