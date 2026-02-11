// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface GfaPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

type RecordType = 'H' | 'S' | 'L' | 'P' | 'other';

const SEGMENT_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Name', width: 120 },
  {
    key: 'seqLength',
    label: 'Length',
    width: 90,
    render: (value: string) => value ? parseInt(value, 10).toLocaleString() : '',
  },
  {
    key: 'sequence',
    label: 'Sequence',
    width: 300,
    render: (value: string) => {
      if (!value || value === '*') return <span style={{ opacity: 0.5 }}>*</span>;
      const truncated = value.length > 80 ? value.slice(0, 80) + '...' : value;
      return <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>{truncated}</span>;
    },
  },
  { key: 'tags', label: 'Tags', width: 200 },
];

const LINK_COLUMNS: ColumnDefinition[] = [
  { key: 'from', label: 'From', width: 120 },
  { key: 'fromOrient', label: 'Orient', width: 60 },
  { key: 'to', label: 'To', width: 120 },
  { key: 'toOrient', label: 'Orient', width: 60 },
  { key: 'overlap', label: 'Overlap', width: 100 },
  { key: 'tags', label: 'Tags', width: 200 },
];

const PATH_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Name', width: 120 },
  { key: 'segments', label: 'Segments', width: 400 },
  { key: 'overlaps', label: 'Overlaps', width: 200 },
];

const HEADER_COLUMNS: ColumnDefinition[] = [
  { key: 'content', label: 'Header Tags', width: 500 },
];

export function GfaPreview({ metadata, rows, loadedLineCount, onRequestRows }: GfaPreviewProps) {
  const [activeTab, setActiveTab] = useState<RecordType>('S');

  const { headers, segments, links, paths } = useMemo(() => {
    const h: TableRow[] = [];
    const s: TableRow[] = [];
    const l: TableRow[] = [];
    const p: TableRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line || !line.trim()) continue;

      const cols = line.split('\t');
      const type = cols[0];

      if (type === 'H') {
        h.push({
          _lineNumber: String(i + 1),
          content: cols.slice(1).join('\t'),
        });
      } else if (type === 'S' && cols.length >= 3) {
        const seq = cols[2];
        s.push({
          _lineNumber: String(i + 1),
          name: cols[1],
          sequence: seq,
          seqLength: seq === '*' ? '' : String(seq.length),
          tags: cols.slice(3).join(' '),
        });
      } else if (type === 'L' && cols.length >= 6) {
        l.push({
          _lineNumber: String(i + 1),
          from: cols[1],
          fromOrient: cols[2],
          to: cols[3],
          toOrient: cols[4],
          overlap: cols[5],
          tags: cols.slice(6).join(' '),
        });
      } else if (type === 'P' && cols.length >= 3) {
        p.push({
          _lineNumber: String(i + 1),
          name: cols[1],
          segments: cols[2],
          overlaps: cols.length > 3 ? cols[3] : '',
        });
      }
    }

    return { headers: h, segments: s, links: l, paths: p };
  }, [rows]);

  // Auto-select first non-empty tab
  const effectiveTab = useMemo(() => {
    if (activeTab === 'S' && segments.length > 0) return 'S';
    if (activeTab === 'L' && links.length > 0) return 'L';
    if (activeTab === 'P' && paths.length > 0) return 'P';
    if (activeTab === 'H' && headers.length > 0) return 'H';
    // fallback
    if (segments.length > 0) return 'S' as RecordType;
    if (links.length > 0) return 'L' as RecordType;
    if (headers.length > 0) return 'H' as RecordType;
    return 'S' as RecordType;
  }, [activeTab, segments, links, paths, headers]);

  const { currentRows, currentColumns } = useMemo(() => {
    switch (effectiveTab) {
      case 'H': return { currentRows: headers, currentColumns: HEADER_COLUMNS };
      case 'S': return { currentRows: segments, currentColumns: SEGMENT_COLUMNS };
      case 'L': return { currentRows: links, currentColumns: LINK_COLUMNS };
      case 'P': return { currentRows: paths, currentColumns: PATH_COLUMNS };
      default: return { currentRows: segments, currentColumns: SEGMENT_COLUMNS };
    }
  }, [effectiveTab, headers, segments, links, paths]);

  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  const totalBases = useMemo(() => {
    return segments.reduce((sum, s) => {
      const len = parseInt(s.seqLength, 10);
      return sum + (isNaN(len) ? 0 : len);
    }, 0);
  }, [segments]);

  const tabs: { type: RecordType; label: string; count: number }[] = [
    { type: 'S', label: 'Segments', count: segments.length },
    { type: 'L', label: 'Links', count: links.length },
    { type: 'P', label: 'Paths', count: paths.length },
    { type: 'H', label: 'Header', count: headers.length },
  ];

  return (
    <div className="gfa-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: GFA</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Segments: {segments.length.toLocaleString()}</span>
          <span>Links: {links.length.toLocaleString()}</span>
          {totalBases > 0 && <span>Total bases: {totalBases.toLocaleString()}</span>}
        </div>
      </div>

      <div className="filter-bar">
        {tabs.map(tab => (
          <button
            key={tab.type}
            className={`tab-button ${effectiveTab === tab.type ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.type)}
            style={{
              padding: '4px 12px',
              marginRight: 4,
              border: '1px solid var(--vscode-widget-border, #333)',
              background: effectiveTab === tab.type
                ? 'var(--vscode-button-background, #0e639c)'
                : 'transparent',
              color: effectiveTab === tab.type
                ? 'var(--vscode-button-foreground, #fff)'
                : 'inherit',
              cursor: 'pointer',
              borderRadius: 3,
              opacity: tab.count === 0 ? 0.4 : 1,
            }}
            disabled={tab.count === 0}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={currentColumns}
          rows={currentRows}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
}
