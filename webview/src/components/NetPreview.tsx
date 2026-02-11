// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface NetPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const NET_COLUMNS: ColumnDefinition[] = [
  {
    key: 'depth',
    label: 'Depth',
    width: 60,
    render: (value: string) => {
      const depth = parseInt(value, 10) || 0;
      return (
        <span style={{ paddingLeft: depth * 12 }}>
          {'  '.repeat(depth)}{depth > 0 ? '\u2514' : '\u25CF'}
        </span>
      );
    },
  },
  {
    key: 'type',
    label: 'Type',
    width: 60,
    render: (value: string) => {
      const color = value === 'fill' ? 'var(--vscode-charts-green, #4ec9b0)' :
                    value === 'gap' ? 'var(--vscode-charts-yellow, #dcdcaa)' :
                    value === 'net' ? 'var(--vscode-charts-blue, #569cd6)' : 'inherit';
      return <span style={{ color, fontWeight: 600 }}>{value}</span>;
    },
  },
  { key: 'chromName', label: 'Chrom', width: 120 },
  { key: 'start', label: 'Start', width: 100 },
  { key: 'size', label: 'Size', width: 90 },
  { key: 'strand', label: 'Strand', width: 60 },
  { key: 'qName', label: 'Query', width: 120 },
  { key: 'qStart', label: 'qStart', width: 100 },
  { key: 'qSize', label: 'qSize', width: 90 },
  { key: 'score', label: 'Score', width: 90 },
];

export function NetPreview({ metadata, rows, loadedLineCount, onRequestRows }: NetPreviewProps) {
  const [typeFilter, setTypeFilter] = useState('');

  const { parsedRows, chromosomes } = useMemo(() => {
    const parsed: TableRow[] = [];
    const chromSet = new Set<string>();
    let currentChrom = '';

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line || !line.trim() || line.startsWith('#')) continue;

      const trimmed = line.trimStart();
      const depth = line.length - trimmed.length; // indentation level (spaces)
      const depthLevel = Math.floor(depth / 1); // each indent is 1 space in net format
      const parts = trimmed.split(/\s+/);

      if (parts[0] === 'net' && parts.length >= 3) {
        currentChrom = parts[1];
        chromSet.add(currentChrom);
        parsed.push({
          _lineNumber: String(i + 1),
          depth: '0',
          type: 'net',
          chromName: parts[1],
          start: '',
          size: parts[2],
          strand: '',
          qName: '',
          qStart: '',
          qSize: '',
          score: '',
        });
      } else if (parts[0] === 'fill' || parts[0] === 'gap') {
        // fill/gap tStart tSize qStrand qName qStart qSize [key value]...
        const row: TableRow = {
          _lineNumber: String(i + 1),
          depth: String(depthLevel),
          type: parts[0],
          chromName: currentChrom,
          start: parts[1] || '',
          size: parts[2] || '',
          strand: parts[3] || '',
          qName: parts[4] || '',
          qStart: parts[5] || '',
          qSize: parts[6] || '',
          score: '',
        };

        // Parse key-value pairs after position 6
        for (let j = 7; j < parts.length - 1; j += 2) {
          if (parts[j] === 'score') {
            row.score = parts[j + 1];
          } else if (parts[j] === 'id') {
            row.netId = parts[j + 1];
          }
        }

        parsed.push(row);
      }
    }

    return {
      parsedRows: parsed,
      chromosomes: Array.from(chromSet).sort(),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!typeFilter) return parsedRows;
    return parsedRows.filter(r => r.type === typeFilter);
  }, [parsedRows, typeFilter]);

  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of parsedRows) {
      counts[row.type] = (counts[row.type] || 0) + 1;
    }
    return counts;
  }, [parsedRows]);

  return (
    <div className="net-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: Net</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Entries: {parsedRows.length.toLocaleString()}</span>
          <span>Chromosomes: {chromosomes.length}</span>
          {Object.entries(typeCounts).map(([t, c]) => (
            <span key={t}>{t}: {c}</span>
          ))}
        </div>
      </div>

      <div className="filter-bar">
        <label>
          Type:
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All</option>
            <option value="net">net</option>
            <option value="fill">fill</option>
            <option value="gap">gap</option>
          </select>
        </label>
        {typeFilter && (
          <span className="filter-info">
            Showing {filteredRows.length} of {parsedRows.length} entries
          </span>
        )}
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={NET_COLUMNS}
          rows={filteredRows}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
}
