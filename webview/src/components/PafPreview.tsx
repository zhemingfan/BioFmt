// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';
import { parseTags } from '../utils';

interface PafPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const PAF_COLUMNS: ColumnDefinition[] = [
  { key: 'queryName', label: 'Query', width: 150 },
  { key: 'queryLen', label: 'QLen', width: 80 },
  { key: 'queryStart', label: 'QStart', width: 80 },
  { key: 'queryEnd', label: 'QEnd', width: 80 },
  { key: 'strand', label: 'Strand', width: 60 },
  { key: 'targetName', label: 'Target', width: 150 },
  { key: 'targetLen', label: 'TLen', width: 80 },
  { key: 'targetStart', label: 'TStart', width: 80 },
  { key: 'targetEnd', label: 'TEnd', width: 80 },
  { key: 'matches', label: 'Matches', width: 80 },
  { key: 'alnLen', label: 'AlnLen', width: 80 },
  { key: 'mapq', label: 'MAPQ', width: 60 },
  { key: 'identity', label: 'Identity', width: 80 },
];

export function PafPreview({ metadata, rows, loadedLineCount, onRequestRows }: PafPreviewProps) {
  const [queryFilter, setQueryFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Parse rows
  const { parsedRows, queries, targets } = useMemo(() => {
    const parsed: (TableRow & { _tags: Record<string, string> })[] = [];
    const querySet = new Set<string>();
    const targetSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim() || line.startsWith('#')) continue;

      const cols = line.split('\t');
      if (cols.length < 12) continue;

      const matches = parseInt(cols[9], 10) || 0;
      const alnLen = parseInt(cols[10], 10) || 1;
      const identity = ((matches / alnLen) * 100).toFixed(2) + '%';

      const tags = parseTags(cols.slice(12));

      const row = {
        _lineNumber: String(i + 1),
        queryName: cols[0],
        queryLen: cols[1],
        queryStart: cols[2],
        queryEnd: cols[3],
        strand: cols[4],
        targetName: cols[5],
        targetLen: cols[6],
        targetStart: cols[7],
        targetEnd: cols[8],
        matches: cols[9],
        alnLen: cols[10],
        mapq: cols[11],
        identity,
        _tags: tags,
      };

      querySet.add(cols[0]);
      targetSet.add(cols[5]);

      parsed.push(row);
    }

    return {
      parsedRows: parsed,
      queries: Array.from(querySet).sort(),
      targets: Array.from(targetSet).sort(),
    };
  }, [rows]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = parsedRows;

    if (queryFilter) {
      filtered = filtered.filter(row => row.queryName === queryFilter);
    }

    if (targetFilter) {
      filtered = filtered.filter(row => row.targetName === targetFilter);
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
    const typedRow = row as Record<string, string> & { _tags: Record<string, string> };

    const queryLen = parseInt(typedRow.queryLen, 10) || 0;
    const queryStart = parseInt(typedRow.queryStart, 10) || 0;
    const queryEnd = parseInt(typedRow.queryEnd, 10) || 0;
    const queryCov = queryLen > 0 ? (((queryEnd - queryStart) / queryLen) * 100).toFixed(1) : '0';

    const targetLen = parseInt(typedRow.targetLen, 10) || 0;
    const targetStart = parseInt(typedRow.targetStart, 10) || 0;
    const targetEnd = parseInt(typedRow.targetEnd, 10) || 0;
    const targetCov = targetLen > 0 ? (((targetEnd - targetStart) / targetLen) * 100).toFixed(1) : '0';

    return (
      <div className="expanded-paf">
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
          </div>
        </div>

        {Object.keys(typedRow._tags).length > 0 && (
          <div className="expanded-section">
            <div className="expanded-section-header">Tags</div>
            <div className="tags-grid-simple">
              {Object.entries(typedRow._tags).map(([key, value]) => (
                <React.Fragment key={key}>
                  <div className="tag-key">{key}</div>
                  <div className="tag-value">{value}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, []);

  return (
    <div className="paf-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: PAF</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Alignments: {parsedRows.length.toLocaleString()}</span>
          <span>Queries: {queries.length}</span>
          <span>Targets: {targets.length}</span>
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
        Click a row to see alignment statistics and tags
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={PAF_COLUMNS}
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
