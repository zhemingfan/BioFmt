// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo, useRef, useState } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';
import { StatsPanel, StatItem } from './StatsPanel';
import { Histogram } from './Histogram';
import { BarChart } from './BarChart';
import { mean, topN } from '../utils/stats';
import { navigateToRegion } from '../vscodeApi';

interface BedPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

type BedVariant = 'bed' | 'bedpe' | 'narrowPeak' | 'broadPeak';

// Standard BED columns
const BED_COLUMNS: ColumnDefinition[] = [
  { key: 'chrom', label: 'chrom', width: 100 },
  { key: 'chromStart', label: 'chromStart', width: 100 },
  { key: 'chromEnd', label: 'chromEnd', width: 100 },
  { key: 'name', label: 'name', width: 120 },
  { key: 'score', label: 'score', width: 80 },
  { key: 'strand', label: 'strand', width: 60 },
  { key: 'thickStart', label: 'thickStart', width: 100 },
  { key: 'thickEnd', label: 'thickEnd', width: 100 },
  { key: 'itemRgb', label: 'itemRgb', width: 100 },
  { key: 'blockCount', label: 'blockCount', width: 100 },
  { key: 'blockSizes', label: 'blockSizes', width: 120 },
  { key: 'blockStarts', label: 'blockStarts', width: 120 },
];

// BEDPE columns (Paired-End BED)
const BEDPE_COLUMNS: ColumnDefinition[] = [
  { key: 'chrom1', label: 'chrom1', width: 100 },
  { key: 'start1', label: 'start1', width: 100 },
  { key: 'end1', label: 'end1', width: 100 },
  { key: 'chrom2', label: 'chrom2', width: 100 },
  { key: 'start2', label: 'start2', width: 100 },
  { key: 'end2', label: 'end2', width: 100 },
  { key: 'name', label: 'name', width: 120 },
  { key: 'score', label: 'score', width: 80 },
  { key: 'strand1', label: 'strand1', width: 60 },
  { key: 'strand2', label: 'strand2', width: 60 },
];

// narrowPeak columns (BED6+4)
const NARROWPEAK_COLUMNS: ColumnDefinition[] = [
  { key: 'chrom', label: 'chrom', width: 100 },
  { key: 'chromStart', label: 'chromStart', width: 100 },
  { key: 'chromEnd', label: 'chromEnd', width: 100 },
  { key: 'name', label: 'name', width: 120 },
  { key: 'score', label: 'score', width: 80 },
  { key: 'strand', label: 'strand', width: 60 },
  { key: 'signalValue', label: 'signalValue', width: 100 },
  { key: 'pValue', label: 'pValue', width: 80 },
  { key: 'qValue', label: 'qValue', width: 80 },
  { key: 'peak', label: 'peak', width: 80 },
];

// broadPeak columns (BED6+3)
const BROADPEAK_COLUMNS: ColumnDefinition[] = [
  { key: 'chrom', label: 'chrom', width: 100 },
  { key: 'chromStart', label: 'chromStart', width: 100 },
  { key: 'chromEnd', label: 'chromEnd', width: 100 },
  { key: 'name', label: 'name', width: 120 },
  { key: 'score', label: 'score', width: 80 },
  { key: 'strand', label: 'strand', width: 60 },
  { key: 'signalValue', label: 'signalValue', width: 100 },
  { key: 'pValue', label: 'pValue', width: 80 },
  { key: 'qValue', label: 'qValue', width: 80 },
];

function getVariant(languageId: string): BedVariant {
  if (languageId === 'omics-bedpe') return 'bedpe';
  if (languageId === 'omics-narrowpeak') return 'narrowPeak';
  if (languageId === 'omics-broadpeak') return 'broadPeak';
  return 'bed';
}

function getColumns(variant: BedVariant, columnCount: number): ColumnDefinition[] {
  switch (variant) {
    case 'bedpe':
      return BEDPE_COLUMNS;
    case 'narrowPeak':
      return NARROWPEAK_COLUMNS;
    case 'broadPeak':
      return BROADPEAK_COLUMNS;
    default:
      // Return only as many columns as needed
      return BED_COLUMNS.slice(0, Math.max(3, columnCount));
  }
}

export function BedPreview({ metadata, rows, loadedLineCount, onRequestRows }: BedPreviewProps) {
  const [chromFilter, setChromFilter] = useState('');

  const variant = getVariant(metadata.languageId);

  // Parse rows incrementally — only parse newly appended rows
  const parsedCache = useRef<{ count: number; rows: Record<string, string>[]; maxCols: number; chroms: Set<string> }>({
    count: 0, rows: [], maxCols: 0, chroms: new Set(),
  });
  const { parsedRows, maxColumns, chromosomes } = useMemo(() => {
    const prev = parsedCache.current;
    const parsed = [...prev.rows];
    let maxCols = prev.maxCols;
    const chroms = new Set(prev.chroms);

    for (let i = prev.count; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim() || line.startsWith('track') || line.startsWith('browser') || line.startsWith('#')) {
        continue;
      }

      const cols = line.split('\t');
      maxCols = Math.max(maxCols, cols.length);

      const row: Record<string, string> = {
        _lineNumber: String(i + 1),
      };

      // Map columns based on variant
      const columnDefs = getColumns(variant, cols.length);
      for (let j = 0; j < cols.length && j < columnDefs.length; j++) {
        row[columnDefs[j].key] = cols[j];
      }

      // Collect chromosomes (BEDPE has chrom1/chrom2, others have chrom)
      if (row.chrom) chroms.add(row.chrom);
      if (row.chrom1) chroms.add(row.chrom1);
      if (row.chrom2) chroms.add(row.chrom2);

      parsed.push(row);
    }

    parsedCache.current = { count: rows.length, rows: parsed, maxCols, chroms };
    return {
      parsedRows: parsed,
      maxColumns: maxCols,
      chromosomes: Array.from(chroms).sort(),
    };
  }, [rows, variant]);

  // Get columns to display, with navigation render on the start column
  const columns = useMemo(() => {
    const base = getColumns(variant, maxColumns);
    const navKey = variant === 'bedpe' ? 'start1' : 'chromStart';
    const chromKey = variant === 'bedpe' ? 'chrom1' : 'chrom';
    const endKey = variant === 'bedpe' ? 'end1' : 'chromEnd';
    return base.map(col => {
      if (col.key !== navKey) return col;
      return {
        ...col,
        render: (value: string, row: Record<string, unknown>) => {
          const chrom = row[chromKey] as string | undefined;
          const start = parseInt(row[navKey] as string, 10);
          const end = parseInt(row[endKey] as string, 10);
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
        },
      };
    });
  }, [variant, maxColumns]);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!chromFilter) return parsedRows;
    // BEDPE has chrom1/chrom2, filter if either matches
    return parsedRows.filter(row =>
      row.chrom === chromFilter ||
      row.chrom1 === chromFilter ||
      row.chrom2 === chromFilter
    );
  }, [parsedRows, chromFilter]);

  // BED statistics
  const bedStats = useMemo(() => {
    const sizes: number[] = [];
    const scores: number[] = [];
    const chromCounts = new Map<string, number>();
    let totalCoverage = 0;

    for (const row of parsedRows) {
      // Interval size
      const start = parseInt(row.chromStart ?? row.start1, 10);
      const end = parseInt(row.chromEnd ?? row.end1, 10);
      if (!isNaN(start) && !isNaN(end) && end > start) {
        const size = end - start;
        sizes.push(size);
        totalCoverage += size;
      }

      // Chromosome counts
      const chrom = row.chrom ?? row.chrom1;
      if (chrom) {
        chromCounts.set(chrom, (chromCounts.get(chrom) || 0) + 1);
      }

      // Scores
      const score = parseFloat(row.score);
      if (!isNaN(score)) scores.push(score);
    }

    const avgSize = Math.round(mean(sizes));

    const chromBreakdown = topN(
      Array.from(chromCounts, ([label, value]) => ({ label, value })),
      15
    );

    return { sizes, scores, totalCoverage, avgSize, chromBreakdown };
  }, [parsedRows]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  const formatLabel = variant === 'bedpe' ? 'BEDPE' :
                      variant === 'narrowPeak' ? 'narrowPeak' :
                      variant === 'broadPeak' ? 'broadPeak' : 'BED';

  return (
    <div className="bed-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {formatLabel}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Regions: {parsedRows.length.toLocaleString()}</span>
          <span>Chromosomes: {chromosomes.length}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>
          Chromosome:
          <select
            value={chromFilter}
            onChange={(e) => setChromFilter(e.target.value)}
          >
            <option value="">All</option>
            {chromosomes.map(chr => (
              <option key={chr} value={chr}>{chr}</option>
            ))}
          </select>
        </label>
        {chromFilter && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {parsedRows.length.toLocaleString()} regions
          </span>
        )}
      </div>

      {/* Statistics Panel */}
      {parsedRows.length > 0 && (
        <StatsPanel>
          <div className="stats-summary">
            <StatItem label="Total Coverage" value={bedStats.totalCoverage.toLocaleString() + ' bp'} />
            <StatItem label="Avg Interval Size" value={bedStats.avgSize.toLocaleString() + ' bp'} />
            <StatItem label="Regions" value={parsedRows.length} />
          </div>
          {bedStats.sizes.length > 0 && <Histogram data={bedStats.sizes} label="Interval Size Distribution" />}
          {bedStats.chromBreakdown.length > 1 && <BarChart data={bedStats.chromBreakdown} label="Regions per Chromosome" height={Math.max(80, bedStats.chromBreakdown.length * 22 + 20)} />}
          {bedStats.scores.length > 0 && <Histogram data={bedStats.scores} label="Score Distribution" />}
        </StatsPanel>
      )}

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        <VirtualTable
          columns={columns}
          rows={filteredRows}
          onScroll={handleScroll}
        />
      </div>
    </div>
  );
}
