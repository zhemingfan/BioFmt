// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import { navigateToRegion } from '../vscodeApi';
import type { DocumentMetadata, DeclarativeRenderSpec } from '../types';

interface DeclarativePreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  getRow?: (line: number) => string | undefined;
  isLineLoaded?: (line: number) => boolean;
  onRequestRows: (startLine: number, endLine: number) => void;
}

function isSkippable(line: string, render: DeclarativeRenderSpec): boolean {
  if (!line.trim()) return true;
  for (const prefix of [...(render.commentPrefixes ?? []), ...(render.skipPrefixes ?? [])]) {
    if (line.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Generic table preview for declarative formats. Driven entirely by the spec's
 * `render` block (delivered in metadata.declarativeRender) — column labels/widths,
 * line skipping, and optional region-navigation links — with no per-format code.
 */
export function DeclarativePreview({ metadata, rows, loadedLineCount, isLineLoaded, onRequestRows }: DeclarativePreviewProps) {
  // Guaranteed by App.tsx routing (only reached when declarativeRender is present).
  const render = metadata.declarativeRender as DeclarativeRenderSpec;

  const columns = useMemo<ColumnDefinition[]>(() => {
    const nav = render.navigation ?? undefined;
    return render.columns.map((col) => {
      const def: ColumnDefinition = { key: col.key, label: col.label, width: col.width };
      if (nav && col.key === nav.linkColumn) {
        def.render = (value: string, row: Record<string, unknown>) => {
          const chrom = row[nav.chromKey] as string | undefined;
          const start = parseInt(row[nav.startKey] as string, 10);
          const end = parseInt(row[nav.endKey] as string, 10);
          if (!chrom || isNaN(start) || isNaN(end)) return value;
          return (
            <span
              className="nav-link"
              title={`Go to ${chrom}:${start}-${end}`}
              onClick={(e) => {
                e.stopPropagation();
                navigateToRegion(chrom, start, end);
              }}
            >
              {value}
            </span>
          );
        };
      }
      return def;
    });
  }, [render]);

  const parsedRows = useMemo(() => {
    const splitLine = render.delimiter === 'whitespace'
      ? (line: string) => line.trim().split(/\s+/)
      : (line: string) => line.split('\t');
    const keys = render.columns.map((c) => c.key);
    const parsed: Record<string, string>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (isSkippable(line, render)) continue;
      const cols = splitLine(line);
      const row: Record<string, string> = { _lineNumber: String(i + 1) };
      for (let j = 0; j < keys.length && j < cols.length; j++) {
        row[keys[j]] = cols[j];
      }
      parsed.push(row);
    }
    return parsed;
  }, [rows, render]);

  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
    isLineLoaded,
  });

  return (
    <div className="generic-preview">
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {render.displayName}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Rows: {parsedRows.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable columns={columns} rows={parsedRows} onScroll={handleScroll} />
      </div>
    </div>
  );
}
