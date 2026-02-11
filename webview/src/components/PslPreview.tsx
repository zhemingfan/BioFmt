// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface PslPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const PSL_COLUMNS: ColumnDefinition[] = [
  { key: 'matches', label: 'Matches', width: 80 },
  { key: 'misMatches', label: 'Mismatch', width: 80 },
  { key: 'repMatches', label: 'RepMatch', width: 80 },
  { key: 'nCount', label: 'Ns', width: 60 },
  { key: 'qNumInsert', label: 'QIns', width: 60 },
  { key: 'qBaseInsert', label: 'QInsBase', width: 80 },
  { key: 'tNumInsert', label: 'TIns', width: 60 },
  { key: 'tBaseInsert', label: 'TInsBase', width: 80 },
  { key: 'strand', label: 'Strand', width: 60 },
  { key: 'qName', label: 'Query', width: 150 },
  { key: 'qSize', label: 'QSize', width: 80 },
  { key: 'qStart', label: 'QStart', width: 80 },
  { key: 'qEnd', label: 'QEnd', width: 80 },
  { key: 'tName', label: 'Target', width: 150 },
  { key: 'tSize', label: 'TSize', width: 80 },
  { key: 'tStart', label: 'TStart', width: 80 },
  { key: 'tEnd', label: 'TEnd', width: 80 },
  { key: 'blockCount', label: 'Blocks', width: 60 },
  { key: 'identity', label: 'Identity', width: 80 },
];

function calculateIdentity(matches: number, misMatches: number, repMatches: number, qNumInsert: number, tNumInsert: number): string {
  const aligned = matches + misMatches + repMatches;
  if (aligned === 0) return '0.00%';
  const pct = ((matches + repMatches) / (aligned + qNumInsert + tNumInsert)) * 100;
  return pct.toFixed(2) + '%';
}

export function PslPreview({ metadata, rows, loadedLineCount, onRequestRows }: PslPreviewProps) {
  const [queryFilter, setQueryFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Parse rows
  const { parsedRows, queries, targets, hasHeader } = useMemo(() => {
    const parsed: (Record<string, string> & {
      _blockSizes: number[];
      _qStarts: number[];
      _tStarts: number[];
    })[] = [];
    const querySet = new Set<string>();
    const targetSet = new Set<string>();
    let headerFound = false;

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim()) continue;

      // PSL header lines
      if (line.startsWith('psLayout') || line.startsWith('match') || line.startsWith('---')) {
        headerFound = true;
        continue;
      }

      const cols = line.split('\t');
      if (cols.length < 21) continue;

      const matches = parseInt(cols[0], 10) || 0;
      const misMatches = parseInt(cols[1], 10) || 0;
      const repMatches = parseInt(cols[2], 10) || 0;
      const qNumInsert = parseInt(cols[4], 10) || 0;
      const tNumInsert = parseInt(cols[6], 10) || 0;

      const identity = calculateIdentity(matches, misMatches, repMatches, qNumInsert, tNumInsert);

      const blockSizes = cols[18].split(',').filter(Boolean).map(s => parseInt(s, 10) || 0);
      const qStarts = cols[19].split(',').filter(Boolean).map(s => parseInt(s, 10) || 0);
      const tStarts = cols[20].split(',').filter(Boolean).map(s => parseInt(s, 10) || 0);

      const row = {
        _lineNumber: String(i + 1),
        matches: cols[0],
        misMatches: cols[1],
        repMatches: cols[2],
        nCount: cols[3],
        qNumInsert: cols[4],
        qBaseInsert: cols[5],
        tNumInsert: cols[6],
        tBaseInsert: cols[7],
        strand: cols[8],
        qName: cols[9],
        qSize: cols[10],
        qStart: cols[11],
        qEnd: cols[12],
        tName: cols[13],
        tSize: cols[14],
        tStart: cols[15],
        tEnd: cols[16],
        blockCount: cols[17],
        identity,
        _blockSizes: blockSizes,
        _qStarts: qStarts,
        _tStarts: tStarts,
      };

      querySet.add(cols[9]);
      targetSet.add(cols[13]);

      parsed.push(row);
    }

    return {
      parsedRows: parsed,
      queries: Array.from(querySet).sort(),
      targets: Array.from(targetSet).sort(),
      hasHeader: headerFound,
    };
  }, [rows]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = parsedRows;

    if (queryFilter) {
      filtered = filtered.filter(row => row.qName === queryFilter);
    }

    if (targetFilter) {
      filtered = filtered.filter(row => row.tName === targetFilter);
    }

    return filtered;
  }, [parsedRows, queryFilter, targetFilter]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  // Handle row click
  const handleRowClick = useCallback((row: Record<string, string>, index: number) => {
    setExpandedRow(prev => prev === index ? null : index);
  }, []);

  // Render expanded content
  const renderExpandedContent = useCallback((row: Record<string, string>) => {
    const typedRow = row as Record<string, string> & {
      _blockSizes: number[];
      _qStarts: number[];
      _tStarts: number[];
    };

    const qSize = parseInt(typedRow.qSize, 10) || 0;
    const qStart = parseInt(typedRow.qStart, 10) || 0;
    const qEnd = parseInt(typedRow.qEnd, 10) || 0;
    const queryCov = qSize > 0 ? (((qEnd - qStart) / qSize) * 100).toFixed(1) : '0';

    const tSize = parseInt(typedRow.tSize, 10) || 0;
    const tStart = parseInt(typedRow.tStart, 10) || 0;
    const tEnd = parseInt(typedRow.tEnd, 10) || 0;
    const targetCov = tSize > 0 ? (((tEnd - tStart) / tSize) * 100).toFixed(1) : '0';

    return (
      <div className="expanded-psl">
        <div className="expanded-section">
          <div className="expanded-section-header">Alignment Statistics</div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Query coverage:</span>
              <span className="stat-value">{queryCov}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Target coverage:</span>
              <span className="stat-value">{targetCov}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Identity:</span>
              <span className="stat-value">{typedRow.identity}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Alignment length:</span>
              <span className="stat-value">{(qEnd - qStart).toLocaleString()} bp</span>
            </div>
          </div>
        </div>

        <div className="expanded-section">
          <div className="expanded-section-header">
            Block Information ({typedRow.blockCount} blocks)
          </div>
          <div className="blocks-table">
            <div className="blocks-header">
              <span>Block</span>
              <span>Size</span>
              <span>Query Start</span>
              <span>Target Start</span>
            </div>
            {typedRow._blockSizes.slice(0, 10).map((size, idx) => (
              <div key={idx} className="blocks-row">
                <span>{idx + 1}</span>
                <span>{size.toLocaleString()}</span>
                <span>{(typedRow._qStarts[idx] || 0).toLocaleString()}</span>
                <span>{(typedRow._tStarts[idx] || 0).toLocaleString()}</span>
              </div>
            ))}
            {typedRow._blockSizes.length > 10 && (
              <div className="blocks-more">
                ...and {typedRow._blockSizes.length - 10} more blocks
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, []);

  return (
    <div className="psl-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: PSL</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Alignments: {parsedRows.length.toLocaleString()}</span>
          <span>Queries: {queries.length}</span>
          <span>Targets: {targets.length}</span>
          {hasHeader && <span>Has header</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>
          Query:
          <select
            value={queryFilter}
            onChange={(e) => setQueryFilter(e.target.value)}
          >
            <option value="">All ({queries.length})</option>
            {queries.slice(0, 100).map(q => (
              <option key={q} value={q}>{q}</option>
            ))}
            {queries.length > 100 && (
              <option disabled>...and {queries.length - 100} more</option>
            )}
          </select>
        </label>

        <label>
          Target:
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
          >
            <option value="">All ({targets.length})</option>
            {targets.slice(0, 100).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
            {targets.length > 100 && (
              <option disabled>...and {targets.length - 100} more</option>
            )}
          </select>
        </label>

        {(queryFilter || targetFilter) && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {parsedRows.length.toLocaleString()} alignments
          </span>
        )}
      </div>

      {/* Tip */}
      <div className="tip">
        Click a row to see alignment statistics and block details
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={PSL_COLUMNS}
          rows={filteredRows}
          onScroll={handleScroll}
          onRowClick={handleRowClick}
          expandedRow={expandedRow}
          renderExpandedContent={renderExpandedContent}
        />
      </div>
    </div>
  );
}
