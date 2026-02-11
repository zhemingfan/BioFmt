// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentMetadata } from '../types';

interface MtxPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface MtxHeader {
  format: string;
  field: string;
  symmetry: string;
  nRows: number;
  nCols: number;
  nnz: number;
  comments: string[];
}

interface MtxStats {
  minValue: number;
  maxValue: number;
  sumValue: number;
  rowCounts: Map<number, number>;
  colCounts: Map<number, number>;
}

function parseHeader(rows: string[]): MtxHeader {
  const header: MtxHeader = {
    format: 'coordinate',
    field: 'real',
    symmetry: 'general',
    nRows: 0,
    nCols: 0,
    nnz: 0,
    comments: [],
  };

  let foundDimensions = false;

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // MatrixMarket header line
    if (trimmed.startsWith('%%MatrixMarket')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        header.format = parts[2] || 'coordinate';
        header.field = parts[3] || 'real';
        header.symmetry = parts[4] || 'general';
      }
      continue;
    }

    // Comment lines
    if (trimmed.startsWith('%')) {
      header.comments.push(trimmed.substring(1).trim());
      continue;
    }

    // Dimension line (first non-comment line)
    if (!foundDimensions) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        header.nRows = parseInt(parts[0], 10) || 0;
        header.nCols = parseInt(parts[1], 10) || 0;
        header.nnz = parseInt(parts[2], 10) || 0;
      }
      foundDimensions = true;
      break;
    }
  }

  return header;
}

function computeStats(rows: string[], header: MtxHeader): MtxStats {
  const stats: MtxStats = {
    minValue: Infinity,
    maxValue: -Infinity,
    sumValue: 0,
    rowCounts: new Map(),
    colCounts: new Map(),
  };

  let dataStarted = false;
  let processedEntries = 0;
  const maxEntries = 10000; // Limit for preview

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('%%')) continue;

    // Skip dimension line
    if (!dataStarted) {
      dataStarted = true;
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const row = parseInt(parts[0], 10);
      const col = parseInt(parts[1], 10);
      const value = parts.length >= 3 ? parseFloat(parts[2]) : 1;

      if (!isNaN(row) && !isNaN(col) && !isNaN(value)) {
        stats.minValue = Math.min(stats.minValue, value);
        stats.maxValue = Math.max(stats.maxValue, value);
        stats.sumValue += value;

        stats.rowCounts.set(row, (stats.rowCounts.get(row) || 0) + 1);
        stats.colCounts.set(col, (stats.colCounts.get(col) || 0) + 1);

        processedEntries++;
        if (processedEntries >= maxEntries) break;
      }
    }
  }

  if (stats.minValue === Infinity) stats.minValue = 0;
  if (stats.maxValue === -Infinity) stats.maxValue = 0;

  return stats;
}

function getTopItems(counts: Map<number, number>, n: number): { index: number; count: number }[] {
  return Array.from(counts.entries())
    .map(([index, count]) => ({ index, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function MtxPreview({ metadata, rows, loadedLineCount, onRequestRows }: MtxPreviewProps) {
  const [loadingMore, setLoadingMore] = useState(false);

  // Parse header
  const header = useMemo(() => parseHeader(rows), [rows]);

  const isTruncated = loadedLineCount < metadata.lineCount;

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && isTruncated) {
      setLoadingMore(true);
      onRequestRows(loadedLineCount, Math.min(loadedLineCount + 5000, metadata.lineCount));
    }
  }, [loadingMore, isTruncated, loadedLineCount, metadata.lineCount, onRequestRows]);

  useEffect(() => {
    setLoadingMore(false);
  }, [rows.length]);

  // Compute stats
  const stats = useMemo(() => computeStats(rows, header), [rows, header]);

  const sparsity = header.nRows * header.nCols > 0
    ? ((1 - header.nnz / (header.nRows * header.nCols)) * 100).toFixed(4)
    : '0';

  const topRows = useMemo(() => getTopItems(stats.rowCounts, 10), [stats.rowCounts]);
  const topCols = useMemo(() => getTopItems(stats.colCounts, 10), [stats.colCounts]);

  return (
    <div className="mtx-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: MatrixMarket ({header.format})</span>
          <span>Field: {header.field}</span>
          <span>Symmetry: {header.symmetry}</span>
        </div>
      </div>

      {/* Truncation warning */}
      {isTruncated && (
        <div className="truncation-warning">
          Showing {loadedLineCount.toLocaleString()} of {metadata.lineCount.toLocaleString()} lines.
          <button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Matrix info */}
      <div className="mtx-info">
        <div className="info-section">
          <h3>Matrix Dimensions</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Rows:</span>
              <span className="info-value">{header.nRows.toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Columns:</span>
              <span className="info-value">{header.nCols.toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Non-zeros:</span>
              <span className="info-value">{header.nnz.toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Sparsity:</span>
              <span className="info-value">{sparsity}%</span>
            </div>
          </div>
        </div>

        <div className="info-section">
          <h3>Value Statistics (sampled)</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Min value:</span>
              <span className="info-value">{stats.minValue.toFixed(4)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Max value:</span>
              <span className="info-value">{stats.maxValue.toFixed(4)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Sum (sampled):</span>
              <span className="info-value">{stats.sumValue.toFixed(4)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Mean (sampled):</span>
              <span className="info-value">
                {stats.rowCounts.size > 0
                  ? (stats.sumValue / Array.from(stats.rowCounts.values()).reduce((a, b) => a + b, 0)).toFixed(4)
                  : '0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top rows and columns */}
      <div className="mtx-top-items">
        <div className="top-section">
          <h3>Top Rows by Non-zeros</h3>
          <div className="top-list">
            {topRows.map(({ index, count }) => (
              <div key={index} className="top-item">
                <span className="item-index">Row {index}</span>
                <span className="item-count">{count.toLocaleString()} entries</span>
              </div>
            ))}
          </div>
        </div>

        <div className="top-section">
          <h3>Top Columns by Non-zeros</h3>
          <div className="top-list">
            {topCols.map(({ index, count }) => (
              <div key={index} className="top-item">
                <span className="item-index">Column {index}</span>
                <span className="item-count">{count.toLocaleString()} entries</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comments */}
      {header.comments.length > 0 && (
        <div className="mtx-comments">
          <h3>Comments</h3>
          <div className="comments-list">
            {header.comments.slice(0, 20).map((comment, idx) => (
              <div key={idx} className="comment-line">{comment}</div>
            ))}
            {header.comments.length > 20 && (
              <div className="comment-line more">
                ...and {header.comments.length - 20} more comments
              </div>
            )}
          </div>
        </div>
      )}

      {/* Note about dense matrix */}
      <div className="mtx-note">
        <strong>Note:</strong> Dense matrix rendering is not supported.
        This preview shows summary statistics only.
      </div>
    </div>
  );
}
