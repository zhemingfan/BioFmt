// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface SamPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

// SAM flag bits
const FLAG_PAIRED = 0x1;
const FLAG_PROPER_PAIR = 0x2;
const FLAG_UNMAPPED = 0x4;
const FLAG_MATE_UNMAPPED = 0x8;
const FLAG_REVERSE = 0x10;
const FLAG_MATE_REVERSE = 0x20;
const FLAG_FIRST_IN_PAIR = 0x40;
const FLAG_SECOND_IN_PAIR = 0x80;
const FLAG_NOT_PRIMARY = 0x100;
const FLAG_FAIL_QC = 0x200;
const FLAG_DUPLICATE = 0x400;
const FLAG_SUPPLEMENTARY = 0x800;

function parseFlagBits(flag: number): string[] {
  const bits: string[] = [];
  if (flag & FLAG_PAIRED) bits.push('paired');
  if (flag & FLAG_PROPER_PAIR) bits.push('proper_pair');
  if (flag & FLAG_UNMAPPED) bits.push('unmapped');
  if (flag & FLAG_MATE_UNMAPPED) bits.push('mate_unmapped');
  if (flag & FLAG_REVERSE) bits.push('reverse');
  if (flag & FLAG_MATE_REVERSE) bits.push('mate_reverse');
  if (flag & FLAG_FIRST_IN_PAIR) bits.push('read1');
  if (flag & FLAG_SECOND_IN_PAIR) bits.push('read2');
  if (flag & FLAG_NOT_PRIMARY) bits.push('secondary');
  if (flag & FLAG_FAIL_QC) bits.push('fail_qc');
  if (flag & FLAG_DUPLICATE) bits.push('duplicate');
  if (flag & FLAG_SUPPLEMENTARY) bits.push('supplementary');
  return bits;
}

function parseTags(tagFields: string[]): Record<string, { type: string; value: string }> {
  const tags: Record<string, { type: string; value: string }> = {};

  for (const field of tagFields) {
    const parts = field.split(':');
    if (parts.length >= 3) {
      const key = parts[0];
      const type = parts[1];
      const value = parts.slice(2).join(':');
      tags[key] = { type, value };
    }
  }

  return tags;
}

const SAM_COLUMNS: ColumnDefinition[] = [
  { key: 'qname', label: 'QNAME', width: 150 },
  { key: 'flag', label: 'FLAG', width: 60 },
  { key: 'rname', label: 'RNAME', width: 100 },
  { key: 'pos', label: 'POS', width: 80 },
  { key: 'mapq', label: 'MAPQ', width: 60 },
  { key: 'cigar', label: 'CIGAR', width: 120 },
  { key: 'rnext', label: 'RNEXT', width: 80 },
  { key: 'pnext', label: 'PNEXT', width: 80 },
  { key: 'tlen', label: 'TLEN', width: 70 },
  { key: 'seq', label: 'SEQ', width: 150 },
  { key: 'qual', label: 'QUAL', width: 100 },
];

export function SamPreview({ metadata, rows, loadedLineCount, onRequestRows }: SamPreviewProps) {
  const [refFilter, setRefFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Parse rows
  const { parsedRows, references, headerLines } = useMemo(() => {
    const parsed: (TableRow & {
      _tags: Record<string, { type: string; value: string }>;
      _flagBits: string[];
      _flagNum: number;
    })[] = [];
    const refSet = new Set<string>();
    const headers: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim()) continue;

      // Header lines start with @
      if (line.startsWith('@')) {
        headers.push(line);
        continue;
      }

      const cols = line.split('\t');
      if (cols.length < 11) continue;

      const flagNum = parseInt(cols[1], 10) || 0;
      const tags = parseTags(cols.slice(11));

      const row = {
        _lineNumber: String(i + 1),
        qname: cols[0],
        flag: cols[1],
        rname: cols[2],
        pos: cols[3],
        mapq: cols[4],
        cigar: cols[5],
        rnext: cols[6],
        pnext: cols[7],
        tlen: cols[8],
        seq: cols[9],
        qual: cols[10],
        _tags: tags,
        _flagBits: parseFlagBits(flagNum),
        _flagNum: flagNum,
      };

      if (cols[2] !== '*') {
        refSet.add(cols[2]);
      }

      parsed.push(row);
    }

    return {
      parsedRows: parsed,
      references: Array.from(refSet).sort(),
      headerLines: headers,
    };
  }, [rows]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = parsedRows;

    if (refFilter) {
      filtered = filtered.filter(row => row.rname === refFilter);
    }

    if (flagFilter) {
      filtered = filtered.filter(row => {
        switch (flagFilter) {
          case 'mapped':
            return !(row._flagNum & FLAG_UNMAPPED);
          case 'unmapped':
            return !!(row._flagNum & FLAG_UNMAPPED);
          case 'paired':
            return !!(row._flagNum & FLAG_PAIRED);
          case 'proper_pair':
            return !!(row._flagNum & FLAG_PROPER_PAIR);
          case 'reverse':
            return !!(row._flagNum & FLAG_REVERSE);
          case 'duplicate':
            return !!(row._flagNum & FLAG_DUPLICATE);
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [parsedRows, refFilter, flagFilter]);

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
      _tags: Record<string, { type: string; value: string }>;
      _flagBits: string[];
    };

    return (
      <div className="expanded-sam">
        <div className="expanded-section">
          <div className="expanded-section-header">FLAG bits</div>
          <div className="flag-bits">
            {typedRow._flagBits.length > 0
              ? typedRow._flagBits.join(', ')
              : 'none'}
          </div>
        </div>

        {Object.keys(typedRow._tags).length > 0 && (
          <div className="expanded-section">
            <div className="expanded-section-header">Tags</div>
            <div className="tags-grid">
              {Object.entries(typedRow._tags).map(([key, { type, value }]) => (
                <React.Fragment key={key}>
                  <div className="tag-key">{key}</div>
                  <div className="tag-type">{type}</div>
                  <div className="tag-value">{value}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="expanded-section">
          <div className="expanded-section-header">Sequence ({typedRow.seq?.length || 0} bp)</div>
          <div className="sequence-display">{typedRow.seq}</div>
        </div>
      </div>
    );
  }, []);

  return (
    <div className="sam-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: SAM</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Alignments: {parsedRows.length.toLocaleString()}</span>
          <span>References: {references.length}</span>
          <span>Header lines: {headerLines.length}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>
          Reference:
          <select
            value={refFilter}
            onChange={(e) => setRefFilter(e.target.value)}
          >
            <option value="">All</option>
            {references.map(ref => (
              <option key={ref} value={ref}>{ref}</option>
            ))}
          </select>
        </label>

        <label>
          Flag filter:
          <select
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="mapped">Mapped</option>
            <option value="unmapped">Unmapped</option>
            <option value="paired">Paired</option>
            <option value="proper_pair">Proper pair</option>
            <option value="reverse">Reverse strand</option>
            <option value="duplicate">Duplicates</option>
          </select>
        </label>

        {(refFilter || flagFilter) && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {parsedRows.length.toLocaleString()} alignments
          </span>
        )}
      </div>

      {/* Tip */}
      <div className="tip">
        Click a row to see FLAG bits, tags, and sequence
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={SAM_COLUMNS}
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
