// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo, useState, useCallback } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface ChainPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const CHAIN_COLUMNS: ColumnDefinition[] = [
  { key: 'score', label: 'Score', width: 90 },
  { key: 'tName', label: 'Target', width: 120 },
  { key: 'tStrand', label: 'tStrand', width: 60 },
  { key: 'tStart', label: 'tStart', width: 100 },
  { key: 'tEnd', label: 'tEnd', width: 100 },
  { key: 'qName', label: 'Query', width: 120 },
  { key: 'qStrand', label: 'qStrand', width: 60 },
  { key: 'qStart', label: 'qStart', width: 100 },
  { key: 'qEnd', label: 'qEnd', width: 100 },
  { key: 'chainId', label: 'ID', width: 70 },
  { key: 'blocks', label: 'Blocks', width: 80 },
  { key: 'tSize', label: 'tSize', width: 110 },
  { key: 'qSize', label: 'qSize', width: 110 },
];

interface ChainBlock {
  size: number;
  dt: number;
  dq: number;
}

export function ChainPreview({ metadata, rows, loadedLineCount, onRequestRows }: ChainPreviewProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { parsedRows, targets, queries } = useMemo(() => {
    const parsed: (TableRow & { _blocks: ChainBlock[] })[] = [];
    const tSet = new Set<string>();
    const qSet = new Set<string>();

    let currentChain: TableRow & { _blocks: ChainBlock[] } | null = null;

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('chain ')) {
        // Save previous chain
        if (currentChain) {
          currentChain.blocks = String(currentChain._blocks.length);
          parsed.push(currentChain);
        }

        const parts = line.split(/\s+/);
        // chain score tName tSize tStrand tStart tEnd qName qSize qStrand qStart qEnd id
        if (parts.length >= 12) {
          tSet.add(parts[2]);
          qSet.add(parts[7]);
          currentChain = {
            _lineNumber: String(i + 1),
            score: parts[1],
            tName: parts[2],
            tSize: parts[3],
            tStrand: parts[4],
            tStart: parts[5],
            tEnd: parts[6],
            qName: parts[7],
            qSize: parts[8],
            qStrand: parts[9],
            qStart: parts[10],
            qEnd: parts[11],
            chainId: parts[12] || '',
            blocks: '0',
            _blocks: [],
          };
        }
      } else if (currentChain) {
        // Data line: size [dt dq]
        const parts = line.split('\t');
        if (parts.length >= 1) {
          const size = parseInt(parts[0], 10);
          if (!isNaN(size)) {
            currentChain._blocks.push({
              size,
              dt: parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0,
              dq: parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0,
            });
          }
        }
      }
    }

    // Push final chain
    if (currentChain) {
      currentChain.blocks = String(currentChain._blocks.length);
      parsed.push(currentChain);
    }

    return {
      parsedRows: parsed,
      targets: Array.from(tSet).sort(),
      queries: Array.from(qSet).sort(),
    };
  }, [rows]);

  const [targetFilter, setTargetFilter] = useState('');

  const filteredRows = useMemo(() => {
    if (!targetFilter) return parsedRows;
    return parsedRows.filter(r => r.tName === targetFilter || r.qName === targetFilter);
  }, [parsedRows, targetFilter]);

  const allSequences = useMemo(() => {
    return Array.from(new Set([...targets, ...queries])).sort();
  }, [targets, queries]);

  const handleRowClick = useCallback((row: TableRow, index: number) => {
    setExpandedRow(expandedRow === index ? null : index);
  }, [expandedRow]);

  const renderExpandedContent = useCallback((row: TableRow) => {
    const typedRow = row as TableRow & { _blocks: ChainBlock[] };
    const blocks = typedRow._blocks;
    if (!blocks || blocks.length === 0) return <div style={{ padding: 8 }}>No alignment blocks</div>;

    return (
      <div style={{ padding: '8px 16px', maxHeight: 200, overflow: 'auto' }}>
        <strong>Alignment Blocks ({blocks.length}):</strong>
        <table style={{ marginTop: 4, borderCollapse: 'collapse', fontSize: '0.85em' }}>
          <thead>
            <tr>
              <th style={{ padding: '2px 12px', textAlign: 'left', borderBottom: '1px solid var(--vscode-widget-border, #333)' }}>#</th>
              <th style={{ padding: '2px 12px', textAlign: 'right', borderBottom: '1px solid var(--vscode-widget-border, #333)' }}>Size</th>
              <th style={{ padding: '2px 12px', textAlign: 'right', borderBottom: '1px solid var(--vscode-widget-border, #333)' }}>dt</th>
              <th style={{ padding: '2px 12px', textAlign: 'right', borderBottom: '1px solid var(--vscode-widget-border, #333)' }}>dq</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, idx) => (
              <tr key={idx}>
                <td style={{ padding: '2px 12px' }}>{idx + 1}</td>
                <td style={{ padding: '2px 12px', textAlign: 'right' }}>{b.size.toLocaleString()}</td>
                <td style={{ padding: '2px 12px', textAlign: 'right' }}>{b.dt.toLocaleString()}</td>
                <td style={{ padding: '2px 12px', textAlign: 'right' }}>{b.dq.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, []);

  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  return (
    <div className="chain-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: Chain</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Chains: {parsedRows.length.toLocaleString()}</span>
          <span>Targets: {targets.length}</span>
          <span>Queries: {queries.length}</span>
        </div>
      </div>

      <div className="filter-bar">
        <label>
          Sequence:
          <select value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
            <option value="">All</option>
            {allSequences.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {targetFilter && (
          <span className="filter-info">
            Showing {filteredRows.length} of {parsedRows.length} chains
          </span>
        )}
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={CHAIN_COLUMNS}
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
