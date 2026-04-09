// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { VirtualTable, ColumnDefinition, TableRow } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import { asciiToPhred, phredToColor, baseToColor } from '../utils/phredColor';
import type { DocumentMetadata } from '../types';

interface FastqPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface ParsedRead {
  id: string;
  description: string;
  sequence: string;
  quality: string;
  avgQual: number;
  startLine: number;
}

const FASTQ_COLUMNS: ColumnDefinition[] = [
  { key: 'id', label: 'Read ID', width: 250 },
  { key: 'length', label: 'Length', width: 80 },
  { key: 'avgQual', label: 'Avg Qual', width: 80 },
  { key: 'minQual', label: 'Min Qual', width: 80 },
  { key: 'description', label: 'Description', width: 250 },
];

function computeAvgQual(quality: string): number {
  if (quality.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < quality.length; i++) {
    sum += quality.charCodeAt(i) - 33;
  }
  return sum / quality.length;
}

function computeMinQual(quality: string): number {
  if (quality.length === 0) return 0;
  let min = Infinity;
  for (let i = 0; i < quality.length; i++) {
    const q = quality.charCodeAt(i) - 33;
    if (q < min) min = q;
  }
  return min === Infinity ? 0 : min;
}

export function FastqPreview({ metadata, rows, loadedLineCount, onRequestRows }: FastqPreviewProps) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Parse FASTQ records incrementally (4-line blocks)
  const parsedCache = useRef<{ count: number; reads: ParsedRead[] }>({
    count: 0, reads: [],
  });

  const reads = useMemo(() => {
    const prev = parsedCache.current;

    if (rows.length < prev.count) {
      parsedCache.current = { count: 0, reads: [] };
      return [];
    }

    const result = [...prev.reads];

    // Start from the last 4-line aligned position
    const startFrom = prev.count - (prev.count % 4);
    // Re-parse from last aligned block if we didn't have all 4 lines
    const actualStart = result.length > 0 && prev.count % 4 !== 0
      ? startFrom
      : prev.count;

    // If we need to re-parse partial block, pop the incomplete one
    if (actualStart < prev.count && result.length > 0) {
      // Don't pop — we only saved complete reads
    }

    for (let i = actualStart; i + 3 < rows.length; i += 4) {
      const headerLine = rows[i];
      const seqLine = rows[i + 1];
      const plusLine = rows[i + 2];
      const qualLine = rows[i + 3];

      // Validate it's a proper FASTQ record
      if (!headerLine.startsWith('@') || !plusLine.startsWith('+')) continue;

      const spaceIdx = headerLine.indexOf(' ', 1);
      const id = spaceIdx > 0 ? headerLine.substring(1, spaceIdx) : headerLine.substring(1);
      const description = spaceIdx > 0 ? headerLine.substring(spaceIdx + 1) : '';

      result.push({
        id,
        description,
        sequence: seqLine,
        quality: qualLine,
        avgQual: computeAvgQual(qualLine),
        startLine: i,
      });
    }

    parsedCache.current = { count: rows.length, reads: result };
    return result;
  }, [rows]);

  // Build table rows
  const tableRows = useMemo<TableRow[]>(() => {
    return reads.map((read, idx) => ({
      _index: idx,
      id: read.id,
      length: String(read.sequence.length),
      avgQual: read.avgQual.toFixed(1),
      minQual: String(computeMinQual(read.quality)),
      description: read.description,
    }));
  }, [reads]);

  // Summary stats
  const stats = useMemo(() => {
    if (reads.length === 0) return { avgLen: 0, avgQual: 0 };
    let totalLen = 0;
    let totalQual = 0;
    for (const read of reads) {
      totalLen += read.sequence.length;
      totalQual += read.avgQual;
    }
    return {
      avgLen: (totalLen / reads.length).toFixed(0),
      avgQual: (totalQual / reads.length).toFixed(1),
    };
  }, [reads]);

  // Handle row click
  const handleRowClick = useCallback((_row: TableRow, index: number) => {
    setExpandedRow(prev => prev === index ? null : index);
  }, []);

  // Render expanded content with quality heatmap
  const renderExpandedContent = useCallback((_row: TableRow, index: number) => {
    const read = reads[index];
    if (!read) return null;

    return (
      <div className="expanded-fastq">
        <div className="expanded-section">
          <div className="expanded-section-header">
            @{read.id} {read.description}
          </div>
          <div className="expanded-section-header" style={{ fontSize: '0.85em', opacity: 0.7 }}>
            {read.sequence.length} bp | Avg Q: {read.avgQual.toFixed(1)} | Min Q: {computeMinQual(read.quality)}
          </div>
        </div>

        {/* Sequence with base coloring */}
        <div className="expanded-section">
          <div className="expanded-section-header">Sequence</div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', letterSpacing: '1px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {read.sequence.split('').map((base, i) => (
              <span key={i} style={{ color: baseToColor(base) }}>{base}</span>
            ))}
          </div>
        </div>

        {/* Quality heatmap */}
        <div className="expanded-section">
          <div className="expanded-section-header">Quality Heatmap</div>
          <div style={{ display: 'flex', overflowX: 'auto', gap: '0' }}>
            {read.quality.split('').map((char, i) => {
              const phred = asciiToPhred(char);
              return (
                <div
                  key={i}
                  style={{
                    width: '14px',
                    height: '20px',
                    backgroundColor: phredToColor(phred),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '8px',
                    color: phred >= 20 ? '#000' : '#fff',
                    fontFamily: 'monospace',
                  }}
                  title={`Position ${i + 1}: Q${phred} (${char})`}
                >
                  {phred}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quality values as text */}
        <div className="expanded-section">
          <div className="expanded-section-header">Quality Scores</div>
          <div style={{ fontFamily: 'monospace', fontSize: '11px', overflowX: 'auto', whiteSpace: 'nowrap', color: 'var(--vscode-descriptionForeground)' }}>
            {read.quality.split('').map((char, i) => {
              const phred = asciiToPhred(char);
              return (
                <span key={i} style={{ display: 'inline-block', width: '14px', textAlign: 'center' }}>
                  {phred}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [reads]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  return (
    <div className="fastq-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: FASTQ</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Reads: {reads.length.toLocaleString()}</span>
          <span>Avg length: {stats.avgLen} bp</span>
          <span>Avg quality: Q{stats.avgQual}</span>
        </div>
      </div>

      <div className="tip">
        Click a row to see sequence, quality heatmap, and per-base scores
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={FASTQ_COLUMNS}
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
