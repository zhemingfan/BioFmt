// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface GtfGffPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const GTF_COLUMNS: ColumnDefinition[] = [
  { key: 'seqname', label: 'seqname', width: 100 },
  { key: 'source', label: 'source', width: 100 },
  { key: 'feature', label: 'feature', width: 100 },
  { key: 'start', label: 'start', width: 90 },
  { key: 'end', label: 'end', width: 90 },
  { key: 'score', label: 'score', width: 70 },
  { key: 'strand', label: 'strand', width: 60 },
  { key: 'frame', label: 'frame', width: 60 },
  { key: 'attributes', label: 'attributes', width: 400 },
];

function parseAttributes(attrString: string, isGff3: boolean): Record<string, string> {
  const attrs: Record<string, string> = {};

  if (isGff3) {
    // GFF3: key=value;key=value
    const pairs = attrString.split(';');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        attrs[key.trim()] = decodeURIComponent(value.trim());
      }
    }
  } else {
    // GTF: key "value"; key "value"
    const regex = /(\w+)\s+"([^"]+)"/g;
    let match;
    while ((match = regex.exec(attrString)) !== null) {
      attrs[match[1]] = match[2];
    }
  }

  return attrs;
}

export function GtfGffPreview({ metadata, rows, loadedLineCount, onRequestRows }: GtfGffPreviewProps) {
  const [featureFilter, setFeatureFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const isGff3 = metadata.languageId === 'omics-gff3';

  // Parse rows
  const { parsedRows, features, sources } = useMemo(() => {
    const parsed: (Record<string, string> & { _parsedAttrs: Record<string, string> })[] = [];
    const featureSet = new Set<string>();
    const sourceSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim() || line.startsWith('#')) {
        continue;
      }

      const cols = line.split('\t');
      if (cols.length < 9) continue;

      const attrs = parseAttributes(cols[8], isGff3);

      const row = {
        _lineNumber: String(i + 1),
        seqname: cols[0],
        source: cols[1],
        feature: cols[2],
        start: cols[3],
        end: cols[4],
        score: cols[5],
        strand: cols[6],
        frame: cols[7],
        attributes: cols[8],
        _parsedAttrs: attrs,
      };

      featureSet.add(cols[2]);
      sourceSet.add(cols[1]);
      parsed.push(row);
    }

    return {
      parsedRows: parsed,
      features: Array.from(featureSet).sort(),
      sources: Array.from(sourceSet).sort(),
    };
  }, [rows, isGff3]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = parsedRows;

    if (featureFilter) {
      filtered = filtered.filter(row => row.feature === featureFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(row => {
        // Search in attributes
        for (const value of Object.values(row._parsedAttrs)) {
          if (value.toLowerCase().includes(term)) return true;
        }
        // Search in seqname
        if (row.seqname.toLowerCase().includes(term)) return true;
        return false;
      });
    }

    return filtered;
  }, [parsedRows, featureFilter, searchTerm]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  // Handle row click to expand attributes
  const handleRowClick = useCallback((row: Record<string, string>, index: number) => {
    setExpandedRow(prev => prev === index ? null : index);
  }, []);

  // Render expanded attributes
  const renderExpandedContent = useCallback((row: Record<string, string>) => {
    const typedRow = row as Record<string, string> & { _parsedAttrs: Record<string, string> };
    const attrs = typedRow._parsedAttrs;

    return (
      <div className="expanded-attrs">
        <div className="expanded-attrs-header">Attributes</div>
        <div className="expanded-attrs-grid">
          {Object.entries(attrs).map(([key, value]) => (
            <React.Fragment key={key}>
              <div className="attr-key">{key}</div>
              <div className="attr-value">{value}</div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }, []);

  const formatLabel = isGff3 ? 'GFF3' : 'GTF';

  return (
    <div className="gtf-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {formatLabel}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Features: {parsedRows.length.toLocaleString()}</span>
          <span>Types: {features.length}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>
          Feature type:
          <select
            value={featureFilter}
            onChange={(e) => setFeatureFilter(e.target.value)}
          >
            <option value="">All</option>
            {features.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>

        <label>
          Search attributes:
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="gene name, ID..."
          />
        </label>

        {(featureFilter || searchTerm) && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {parsedRows.length.toLocaleString()} features
          </span>
        )}
      </div>

      {/* Tip */}
      <div className="tip">
        Click a row to expand its attributes
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={GTF_COLUMNS}
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
