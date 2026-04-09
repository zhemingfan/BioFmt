// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import { baseToColor } from '../utils/phredColor';
import type { DocumentMetadata } from '../types';

interface FastaPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface ParsedSequence {
  name: string;
  description: string;
  sequence: string;
  length: number;
  startLine: number;
}

const FASTA_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Name', width: 200 },
  { key: 'length', label: 'Length (bp)', width: 120 },
  { key: 'gcContent', label: 'GC %', width: 80 },
  { key: 'description', label: 'Description', width: 300 },
];

const WRAP_WIDTH = 80;

function computeGcPercent(seq: string): string {
  if (seq.length === 0) return '0.0';
  let gc = 0;
  let valid = 0;
  for (let i = 0; i < seq.length; i++) {
    const c = seq[i].toUpperCase();
    if (c === 'G' || c === 'C') { gc++; valid++; }
    else if (c === 'A' || c === 'T' || c === 'U') { valid++; }
  }
  return valid > 0 ? ((gc / valid) * 100).toFixed(1) : '0.0';
}

export function FastaPreview({ metadata, rows, loadedLineCount, onRequestRows }: FastaPreviewProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Parse FASTA sequences incrementally
  const parsedCache = useRef<{ count: number; sequences: ParsedSequence[]; pending: ParsedSequence | null }>({
    count: 0, sequences: [], pending: null,
  });

  const sequences = useMemo(() => {
    const prev = parsedCache.current;

    // If rows shrunk (shouldn't happen, but guard), reset
    if (rows.length < prev.count) {
      parsedCache.current = { count: 0, sequences: [], pending: null };
      return [];
    }

    const result = [...prev.sequences];
    let current = prev.pending ? { ...prev.pending, sequence: prev.pending.sequence } : null;

    for (let i = prev.count; i < rows.length; i++) {
      const line = rows[i];
      if (!line || line.startsWith(';')) continue;

      if (line.startsWith('>')) {
        // Finalize previous sequence
        if (current) {
          current.length = current.sequence.length;
          result.push(current);
        }
        const spaceIdx = line.indexOf(' ', 1);
        const name = spaceIdx > 0 ? line.substring(1, spaceIdx) : line.substring(1);
        const description = spaceIdx > 0 ? line.substring(spaceIdx + 1) : '';
        current = { name, description, sequence: '', length: 0, startLine: i };
      } else if (current) {
        current.sequence += line.trim();
      }
    }

    parsedCache.current = { count: rows.length, sequences: result, pending: current };

    // Include pending (last sequence, may still be accumulating)
    const all = current ? [...result, { ...current, length: current.sequence.length }] : result;
    return all;
  }, [rows]);

  // Build table rows
  const tableRows = useMemo<TableRow[]>(() => {
    return sequences.map((seq, idx) => ({
      _index: idx,
      name: seq.name,
      length: seq.length.toLocaleString(),
      gcContent: computeGcPercent(seq.sequence),
      description: seq.description,
    }));
  }, [sequences]);

  // Handle row click
  const handleRowClick = useCallback((_row: TableRow, index: number) => {
    setExpandedRow(prev => prev === index ? null : index);
  }, []);

  // Render expanded sequence
  const renderExpandedContent = useCallback((_row: TableRow, index: number) => {
    const seq = sequences[index];
    if (!seq) return null;

    // Wrap sequence into lines
    const lines: string[] = [];
    for (let i = 0; i < seq.sequence.length; i += WRAP_WIDTH) {
      lines.push(seq.sequence.substring(i, i + WRAP_WIDTH));
    }

    return (
      <div className="expanded-fasta">
        <div className="expanded-section">
          <div className="expanded-section-header">
            &gt;{seq.name} {seq.description}
          </div>
          <div className="expanded-section-header" style={{ fontSize: '0.85em', opacity: 0.7 }}>
            {seq.length.toLocaleString()} bp | GC: {computeGcPercent(seq.sequence)}%
          </div>
        </div>
        <div className="expanded-section">
          <div className="sequence-display" style={{ fontFamily: 'monospace', lineHeight: '1.4' }}>
            {lines.map((line, lineIdx) => (
              <div key={lineIdx} style={{ display: 'flex' }}>
                <span style={{ width: '60px', color: 'var(--vscode-descriptionForeground)', textAlign: 'right', paddingRight: '8px', userSelect: 'none' }}>
                  {(lineIdx * WRAP_WIDTH + 1).toLocaleString()}
                </span>
                <span>
                  {line.split('').map((base, baseIdx) => (
                    <span key={baseIdx} style={{ color: baseToColor(base) }}>{base}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, [sequences]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  const totalBases = useMemo(() => {
    return sequences.reduce((sum, seq) => sum + seq.length, 0);
  }, [sequences]);

  return (
    <div className="fasta-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: FASTA</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Sequences: {sequences.length.toLocaleString()}</span>
          <span>Total bases: {totalBases.toLocaleString()}</span>
        </div>
      </div>

      <div className="tip">
        Click a row to view the sequence with base coloring
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={FASTA_COLUMNS}
          rows={tableRows}
          onScroll={handleScroll}
          onRowClick={handleRowClick}
          expandedRow={expandedRow}
          renderExpandedContent={renderExpandedContent}
        />
      </div>
    </div>
  );
}
