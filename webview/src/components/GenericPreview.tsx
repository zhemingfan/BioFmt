// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
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

const MAX_COLUMNS = 20;

export function GenericPreview({ metadata, rows, loadedLineCount, isLineLoaded, onRequestRows }: GenericPreviewProps) {
  // Parse rows into structured data and determine columns
  const { parsedRows, columns } = useMemo(() => {
    const parsed: Record<string, string>[] = [];
    let maxCols = 0;

    // First pass: determine max columns
    for (const row of rows) {
      if (!row.trim()) continue;
      const cols = row.split('\t').slice(0, MAX_COLUMNS);
      maxCols = Math.max(maxCols, cols.length);
    }

    // Build column definitions with content-based width estimation
    const colMaxLens: number[] = new Array(maxCols).fill(0);
    const sampleSize = Math.min(rows.length, 50);
    const sampleRows = rows.slice(0, sampleSize);

    for (const row of sampleRows) {
      if (!row.trim()) continue;
      const cols = row.split('\t').slice(0, MAX_COLUMNS);
      for (let i = 0; i < cols.length; i++) {
        colMaxLens[i] = Math.max(colMaxLens[i], cols[i].length);
      }
    }

    const colDefs: ColumnDefinition[] = [];
    for (let i = 0; i < maxCols; i++) {
      const estimated = Math.max(80, colMaxLens[i] * 7.5 + 16);
      colDefs.push({
        key: `col_${i}`,
        label: `Col ${i + 1}`,
        width: Math.min(600, estimated),
      });
    }

    // Second pass: parse all rows
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim()) continue;

      const cols = line.split('\t').slice(0, MAX_COLUMNS);
      const row: Record<string, string> = { _lineNumber: String(i + 1) };
      for (let j = 0; j < cols.length; j++) {
        row[`col_${j}`] = cols[j];
      }
      parsed.push(row);
    }

    return { parsedRows: parsed, columns: colDefs };
  }, [rows]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
    isLineLoaded,
  });

  const formatName = metadata.languageId.replace('omics-', '').toUpperCase();

  return (
    <div className="generic-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {formatName}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Columns: {columns.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={columns}
          rows={parsedRows}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
}
