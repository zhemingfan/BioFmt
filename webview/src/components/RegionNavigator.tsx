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
 * Provides chromosome selector, start/end inputs, and a text input for
 * `chr:start-end` notation.
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
  const [chrom, setChrom] = useState(references[0]?.name || '');
  const [startPos, setStartPos] = useState('1');
  const [endPos, setEndPos] = useState('1000000');
  const [regionText, setRegionText] = useState('');

  // Update default chrom when references arrive
  React.useEffect(() => {
    if (references.length > 0 && !chrom) {
      setChrom(references[0].name);
    }
  }, [references, chrom]);

  const formatNumber = (n: string) => {
    const num = parseInt(n.replace(/,/g, ''), 10);
    return isNaN(num) ? n : num.toLocaleString();
  };

  const handleGo = useCallback(() => {
    if (!chrom) return;
    const start = parseInt(startPos.replace(/,/g, ''), 10);
    const end = parseInt(endPos.replace(/,/g, ''), 10);
    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) return;
    onNavigate(chrom, start, end);
  }, [chrom, startPos, endPos, onNavigate]);

  const handleTextGo = useCallback(() => {
    // Parse "chr1:1000000-2000000" or "chr1:1,000,000-2,000,000"
    const match = regionText.match(/^(\S+):([0-9,]+)-([0-9,]+)$/);
    if (!match) return;
    const c = match[1];
    const s = parseInt(match[2].replace(/,/g, ''), 10);
    const e = parseInt(match[3].replace(/,/g, ''), 10);
    if (isNaN(s) || isNaN(e) || s < 0 || e <= s) return;

    setChrom(c);
    setStartPos(String(s));
    setEndPos(String(e));
    onNavigate(c, s, e);
  }, [regionText, onNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (regionText.includes(':')) {
          handleTextGo();
        } else {
          handleGo();
        }
      }
    },
    [handleGo, handleTextGo, regionText]
  );

  return (
    <div className="region-navigator">
      <div className="region-navigator-row">
        <label>
          Chrom:
          <select
            value={chrom}
            onChange={(e) => setChrom(e.target.value)}
            disabled={loading}
          >
            {references.length === 0 && <option value="">--</option>}
            {references.map((ref) => (
              <option key={ref.name} value={ref.name}>
                {ref.name}
                {ref.length != null ? ` (${ref.length.toLocaleString()} bp)` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          Start:
          <input
            type="text"
            value={startPos}
            onChange={(e) => setStartPos(e.target.value)}
            onBlur={() => setStartPos(formatNumber(startPos))}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={{ width: '120px' }}
          />
        </label>

        <label>
          End:
          <input
            type="text"
            value={endPos}
            onChange={(e) => setEndPos(e.target.value)}
            onBlur={() => setEndPos(formatNumber(endPos))}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={{ width: '120px' }}
          />
        </label>

        <button onClick={handleGo} disabled={loading || !chrom}>
          {loading ? 'Loading...' : 'Go'}
        </button>

        <span className="region-separator">|</span>

        <input
          type="text"
          className="region-text-input"
          placeholder="chr1:1000000-2000000"
          value={regionText}
          onChange={(e) => setRegionText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        <button onClick={handleTextGo} disabled={loading || !regionText}>
          Jump
        </button>
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
