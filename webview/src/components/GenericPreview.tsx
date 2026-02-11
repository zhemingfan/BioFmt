// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface GenericPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  getRow: (line: number) => string | undefined;
  isLineLoaded?: (line: number) => boolean;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const ROW_HEIGHT = 28;
const MAX_COLUMNS = 20;

export function GenericPreview({ metadata, rows, loadedLineCount, getRow, isLineLoaded, onRequestRows }: GenericPreviewProps) {
  // Parse rows into columns
  const maxCols = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      if (!row.trim()) continue;
      const columns = row.split('\t').slice(0, MAX_COLUMNS);
      max = Math.max(max, columns.length);
    }
    return max;
  }, [rows]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
    isLineLoaded,
    rowHeight: ROW_HEIGHT,
  });

  // Row renderer
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const line = getRow(index);
    if (!line) {
      return (
        <div style={style} className="table-row loading-row">
          <div
            className="table-cell"
            style={{ width: 150, minWidth: 80, maxWidth: 300, opacity: 0.6 }}
          >
            Loading...
          </div>
        </div>
      );
    }

    if (!line.trim()) {
      return (
        <div style={style} className="table-row">
          <div
            className="table-cell"
            style={{ width: 150, minWidth: 80, maxWidth: 300 }}
          >
            &nbsp;
          </div>
        </div>
      );
    }

    const isHeader = line.startsWith('#') || line.startsWith('@');
    const columns = line.split('\t').slice(0, MAX_COLUMNS);

    return (
      <div style={style} className={`table-row ${isHeader ? 'header-row' : ''}`}>
        {columns.map((col, colIdx) => (
          <div
            key={colIdx}
            className="table-cell"
            style={{ width: 150, minWidth: 80, maxWidth: 300 }}
            title={col}
          >
            {col}
          </div>
        ))}
      </div>
    );
  }, [getRow]);

  const formatName = metadata.languageId.replace('omics-', '').toUpperCase();

  return (
    <div className="generic-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {formatName}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Columns: {maxCols}</span>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <List
          height={window.innerHeight - 120}
          itemCount={metadata.lineCount}
          itemSize={ROW_HEIGHT}
          width="100%"
          onScroll={handleScroll}
        >
          {Row}
        </List>
      </div>
    </div>
  );
}
