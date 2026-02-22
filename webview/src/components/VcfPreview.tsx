// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { DocumentMetadata, VcfHeaderInfo, ParsedVcfRow, FilterConfig, FormatDefinition, TypedSampleData, FormatRecordContext } from '../types';
import { VcfFilterBar } from './VcfFilterBar';
import { ExpandedInfoCell } from './ExpandedInfoCell';
import { parseSampleFormats, renderFormatDisplay, getRenderer, getFormatSummaries } from '../vcf/formatParsers';
import { sortChromosomes } from '../utils';

interface VcfPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  headerInfo: VcfHeaderInfo | null;
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

const MAX_DISPLAY_ROWS = 200000;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;

const DEFAULT_COL_WIDTHS = {
  chrom: 100, pos: 100, id: 120, ref: 80, alt: 100,
  qual: 80, filter: 100, info: 250, format: 120, sample: 150,
} as const;
type ColKey = keyof typeof DEFAULT_COL_WIDTHS;

export function VcfPreview({ metadata, rows, headerInfo, loadedLineCount, onRequestRows }: VcfPreviewProps) {
  const [filter, setFilter] = useState<FilterConfig>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showAllSamples, setShowAllSamples] = useState(false);
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>({ ...DEFAULT_COL_WIDTHS });
  const resizingRef = useRef<{ key: ColKey; startX: number; startWidth: number } | null>(null);

  // Reactive list height — updates when the webview pane is resized
  const [listHeight, setListHeight] = useState(() => Math.max(200, window.innerHeight - 300));
  const listHeightRef = useRef(listHeight);
  useEffect(() => {
    const onResize = () => {
      const h = Math.max(200, window.innerHeight - 300);
      listHeightRef.current = h;
      setListHeight(h);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Track container width so the table fills the pane when totalWidth < pane width
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(60, startWidth + (e.clientX - startX));
      setColWidths(prev => ({ ...prev, [key]: newWidth }));
    };
    const onMouseUp = () => { resizingRef.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Parse VCF rows
  const parsedRows = useMemo(() => {
    const result: ParsedVcfRow[] = [];
    const headerEndLine = headerInfo?.headerEndLine ?? 0;

    for (let i = headerEndLine; i < rows.length && result.length < MAX_DISPLAY_ROWS; i++) {
      const line = rows[i];
      if (!line || line.startsWith('#')) continue;

      const parsed = parseVcfLine(line, i, headerInfo);
      if (parsed) {
        result.push(parsed);
      }
    }

    return result;
  }, [rows, headerInfo]);

  // Apply filters
  const filteredRows = useMemo(() => {
    if (!filter.chrom && !filter.id && !filter.filter && !filter.search) {
      return parsedRows;
    }

    const idQuery = filter.id?.toLowerCase();
    const searchQuery = filter.search?.toLowerCase();

    return parsedRows.filter((row) => {
      if (filter.chrom && row.chrom !== filter.chrom) return false;
      if (filter.filter && row.filter !== filter.filter) return false;
      if (idQuery && !row.id.toLowerCase().includes(idQuery)) return false;
      if (searchQuery && !row.raw.toLowerCase().includes(searchQuery)) return false;
      return true;
    });
  }, [parsedRows, filter]);

  // Clear expanded row if it's been filtered out
  useEffect(() => {
    if (expandedRow !== null && !filteredRows.find((r) => r.lineNumber === expandedRow)) {
      setExpandedRow(null);
    }
  }, [filteredRows, expandedRow]);

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const chroms = new Set<string>();
    const filters = new Set<string>();

    for (const row of parsedRows.slice(0, 10000)) {
      chroms.add(row.chrom);
      filters.add(row.filter);
    }

    return {
      chroms: sortChromosomes(chroms),
      filters: Array.from(filters).sort(),
    };
  }, [parsedRows]);

  // Build format definition map once for tooltip generation
  const formatDefs = useMemo(() => {
    const map = new Map<string, FormatDefinition>();
    for (const fd of headerInfo?.formatFields ?? []) {
      map.set(fd.id, fd);
    }
    return map;
  }, [headerInfo]);

  // Determine which samples to show
  const sampleColumns = useMemo(() => {
    if (!headerInfo?.samples) return [];
    const limit = showAllSamples ? headerInfo.samples.length : 10;
    return headerInfo.samples.slice(0, limit);
  }, [headerInfo, showAllSamples]);

  // Sort state
  const [sort, setSort] = useState<{ col: 'chrom' | 'pos' | null; dir: 'asc' | 'desc' }>({ col: null, dir: 'asc' });

  const toggleSort = useCallback((col: 'chrom' | 'pos') => {
    setSort(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // Apply sort (chrom uses natural ordering; pos as tiebreaker within chrom sort)
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (sort.col === 'pos') {
        cmp = a.pos - b.pos;
      } else {
        const aNum = parseInt(a.chrom.replace(/\D/g, ''), 10);
        const bNum = parseInt(b.chrom.replace(/\D/g, ''), 10);
        cmp = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : a.chrom.localeCompare(b.chrom);
        if (cmp === 0) cmp = a.pos - b.pos;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sort]);

  // Export visible (filtered + sorted) rows as a proper VCF file
  const exportVcf = useCallback(() => {
    const headerEndLine = headerInfo?.headerEndLine ?? 0;
    const headerLines = rows.slice(0, headerEndLine).join('\n');
    const dataLines = sortedRows.map((r) => r.raw).join('\n');
    const content = headerLines + (headerLines && dataLines ? '\n' : '') + dataLines;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = metadata.fileName.replace(/\.vcf(\.gz)?$/i, '') + '_filtered.vcf';
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, headerInfo, sortedRows, metadata.fileName]);

  // Total table width for horizontal scroll
  const totalWidth = useMemo(() => {
    let w = colWidths.chrom + colWidths.pos + colWidths.id + colWidths.ref +
            colWidths.alt + colWidths.qual + colWidths.filter + colWidths.info;
    if (parsedRows[0]?.format) w += colWidths.format;
    w += sampleColumns.length * colWidths.sample;
    return w;
  }, [colWidths, parsedRows, sampleColumns]);

  // Row renderer for virtual list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = sortedRows[index];
    if (!row) return null;

    const isExpanded = expandedRow === row.lineNumber;

    return (
      <div style={style}>
        <div
          className={`table-row ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setExpandedRow(isExpanded ? null : row.lineNumber)}
        >
          <div className="table-cell" style={{ width: colWidths.chrom, flexShrink: 0 }} title={row.chrom}>{row.chrom}</div>
          <div className="table-cell" style={{ width: colWidths.pos, flexShrink: 0 }} title={String(row.pos)}>{row.pos}</div>
          <div className="table-cell" style={{ width: colWidths.id, flexShrink: 0 }} title={row.id}>{row.id}</div>
          <div className="table-cell" style={{ width: colWidths.ref, flexShrink: 0 }} title={row.ref}>{row.ref}</div>
          <div className="table-cell" style={{ width: colWidths.alt, flexShrink: 0 }} title={row.alt}>{row.alt}</div>
          <div className="table-cell" style={{ width: colWidths.qual, flexShrink: 0 }} title={row.qual?.toString() || '.'}>{row.qual ?? '.'}</div>
          <div className="table-cell" style={{ width: colWidths.filter, flexShrink: 0 }} title={row.filter}><FilterBadge value={row.filter} /></div>
          <div
            className={`table-cell expandable ${isExpanded ? 'expanded' : ''}`}
            style={{ width: colWidths.info, flexShrink: 0 }}
            title={formatInfoForDisplay(row.info)}
          >
            <ColoredInfoDisplay info={row.info} />
          </div>
          {row.format && <div className="table-cell" style={{ width: colWidths.format, flexShrink: 0 }} title={row.format}>{row.format}</div>}
          {sampleColumns.map((sample) => {
            const alts = row.alt === '.' ? [] : row.alt.split(',');
            const typedSample = row.typedSamples?.[sample];
            const rawSample = row.samples?.[sample];
            const formatKeys = row.format?.split(':') || [];
            return (
              <div
                key={sample}
                className="table-cell"
                style={{ width: colWidths.sample, flexShrink: 0 }}
                title={rawSample ? buildSampleTooltip(rawSample, typedSample, formatKeys, formatDefs, row.ref, alts) : '.'}
              >
                {rawSample ? (
                  <ColoredSampleDisplay
                    rawSample={rawSample}
                    typedSample={typedSample}
                    formatKeys={formatKeys}
                    ref_={row.ref}
                    alts={alts}
                  />
                ) : '.'}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [sortedRows, expandedRow, sampleColumns, colWidths, formatDefs]);

  // Handle scroll to load more rows
  const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    const visibleStart = Math.floor(scrollOffset / ROW_HEIGHT);
    const visibleEnd = visibleStart + Math.ceil(listHeightRef.current / ROW_HEIGHT) + 10;

    // Request rows if needed
    const headerEnd = headerInfo?.headerEndLine || 0;
    const requestEnd = Math.min(metadata.lineCount, headerEnd + visibleEnd + 100); // Buffer

    if (requestEnd > loadedLineCount) {
      onRequestRows(loadedLineCount, requestEnd);
    }
  }, [headerInfo, loadedLineCount, metadata.lineCount, onRequestRows]);

  const isTruncated = metadata.lineCount > MAX_DISPLAY_ROWS;

  return (
    <div className="vcf-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: VCF {headerInfo?.fileformat?.replace('VCF', '') || ''}</span>
          <span>Variants: {sortedRows.length.toLocaleString()}</span>
          {headerInfo?.samples && <span>Samples: {headerInfo.samples.length}</span>}
        </div>
        <button
          className="export-vcf-btn"
          onClick={exportVcf}
          title="Export filtered rows as VCF"
          disabled={sortedRows.length === 0}
        >
          Export VCF
        </button>
      </div>

      {/* Truncation Warning */}
      {isTruncated && (
        <div className="truncation-banner">
          <span className="icon">⚠️</span>
          <span className="message">
            Showing first {MAX_DISPLAY_ROWS.toLocaleString()} rows of {metadata.lineCount.toLocaleString()} total
          </span>
        </div>
      )}

      {/* Filter Bar */}
      <VcfFilterBar
        filter={filter}
        onFilterChange={setFilter}
        options={filterOptions}
        totalRows={parsedRows.length}
        filteredRows={filteredRows.length}
      />

      {/* Sample toggle */}
      {headerInfo && headerInfo.samples.length > 10 && (
        <div className="filter-bar">
          <label>
            <input
              type="checkbox"
              checked={showAllSamples}
              onChange={(e) => setShowAllSamples(e.target.checked)}
            />
            {' '}Show all {headerInfo.samples.length} samples
          </label>
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <div ref={containerRef} style={{ overflowX: 'auto' }}>
          {/* Header row */}
          <div className="table-header" style={{ width: Math.max(totalWidth, containerWidth) }}>
            {(['chrom', 'pos', 'id', 'ref', 'alt', 'qual', 'filter', 'info'] as ColKey[]).map((key) => {
              const isSortable = key === 'chrom' || key === 'pos';
              const isActive = sort.col === key;
              const sortIcon = isActive ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : (isSortable ? ' ↕' : '');
              return (
                <div
                  key={key}
                  className={`table-header-cell${isSortable ? ' sortable' : ''}`}
                  style={{ width: colWidths[key], flexShrink: 0, position: 'relative' }}
                  onClick={isSortable ? () => toggleSort(key as 'chrom' | 'pos') : undefined}
                  title={isSortable ? `Sort by ${key.toUpperCase()}` : undefined}
                >
                  {key.toUpperCase()}
                  <span className={`sort-icon${isActive ? ' active' : ''}`}>{sortIcon}</span>
                  <div
                    className="col-resize-handle"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
                    }}
                  />
                </div>
              );
            })}
            {parsedRows[0]?.format && (
              <div
                className="table-header-cell"
                style={{ width: colWidths.format, flexShrink: 0, position: 'relative' }}
              >
                FORMAT
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    resizingRef.current = { key: 'format', startX: e.clientX, startWidth: colWidths.format };
                  }}
                />
              </div>
            )}
            {sampleColumns.map((sample) => (
              <div
                key={sample}
                className="table-header-cell"
                style={{ width: colWidths.sample, flexShrink: 0, position: 'relative' }}
              >
                {sample}
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    resizingRef.current = { key: 'sample', startX: e.clientX, startWidth: colWidths.sample };
                  }}
                />
              </div>
            ))}
          </div>

          {/* Virtual list */}
          <List
            height={listHeight}
            itemCount={sortedRows.length}
            itemSize={ROW_HEIGHT}
            width={Math.max(totalWidth, containerWidth)}
            onScroll={handleScroll}
          >
            {Row}
          </List>
        </div>
      </div>

      {/* Row detail panel — fixed at bottom */}
      {expandedRow !== null && (() => {
        const row = sortedRows.find((r) => r.lineNumber === expandedRow);
        if (!row) return null;
        return (
          <div className="expanded-vcf">
            <div className="expanded-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {row.chrom}:{row.pos}
                {row.id !== '.' && <span style={{ marginLeft: 8, opacity: 0.7 }}>{row.id}</span>}
                <span style={{ marginLeft: 8, opacity: 0.6 }}>{row.ref} → {row.alt}</span>
              </span>
              <button
                onClick={() => setExpandedRow(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vscode-foreground)', fontSize: '1.1em', lineHeight: 1 }}
                title="Close"
              >×</button>
            </div>
            <ExpandedInfoCell row={row} headerInfo={headerInfo} />
          </div>
        );
      })()}
    </div>
  );
}

function parseVcfLine(line: string, lineNumber: number, headerInfo: VcfHeaderInfo | null): ParsedVcfRow | null {
  const columns = line.split('\t');
  if (columns.length < 8) return null;

  const pos = parseInt(columns[1], 10);
  if (isNaN(pos)) return null;

  const info: Record<string, string | boolean> = {};
  if (columns[7] !== '.') {
    const infoPairs = columns[7].split(';');
    for (const pair of infoPairs) {
      if (pair.includes('=')) {
        const [key, val] = pair.split('=', 2);
        info[key] = val;
      } else if (pair) {
        info[pair] = true;
      }
    }
  }

  const ref = columns[3];
  const alt = columns[4];
  const alts = alt === '.' ? [] : alt.split(',');

  // Parse samples if present
  let samples: Record<string, Record<string, string>> | undefined;
  let typedSamples: Record<string, TypedSampleData> | undefined;

  if (columns.length > 9 && columns[8] && headerInfo?.samples) {
    const formatKeys = columns[8].split(':');
    samples = {};
    typedSamples = {};

    // Build format definitions map
    const formatDefs = new Map<string, FormatDefinition>();
    for (const fd of headerInfo.formatFields) {
      formatDefs.set(fd.id, fd);
    }

    for (let i = 0; i < headerInfo.samples.length && 9 + i < columns.length; i++) {
      const sampleCol = columns[9 + i];
      if (!sampleCol) break;
      const sampleName = headerInfo.samples[i];
      const sampleValues = sampleCol.split(':');
      const rawData: Record<string, string> = {};

      for (let j = 0; j < formatKeys.length; j++) {
        rawData[formatKeys[j]] = sampleValues[j] || '.';
      }

      samples[sampleName] = rawData;

      // Create context for typed parsing
      const ctx: FormatRecordContext = {
        ref,
        alts,
        nAlleles: 1 + alts.length,
        formatKeys,
        sampleName,
      };

      // Parse into typed values
      const typed = parseSampleFormats(rawData, formatDefs, ctx);
      typedSamples[sampleName] = { raw: rawData, typed };
    }
  }

  return {
    lineNumber,
    chrom: columns[0],
    pos,
    id: columns[2],
    ref,
    alt,
    qual: columns[5] === '.' ? null : parseFloat(columns[5]),
    filter: columns[6],
    info,
    format: columns[8],
    samples,
    typedSamples,
    raw: line,
  };
}

function formatInfoForDisplay(info: Record<string, string | boolean>): string {
  return Object.entries(info)
    .map(([k, v]) => (v === true ? k : `${k}=${v}`))
    .join(';');
}

// Color-blind friendly palette for FORMAT fields
const FORMAT_COLORS: Record<string, string> = {
  GT: '#56b4e9',  // Sky blue - genotype
  AD: '#e69f00',  // Orange - allelic depth
  DP: '#009e73',  // Teal - read depth
  GQ: '#cc79a7',  // Pink - genotype quality
  PL: '#0072b2',  // Blue - phred likelihoods
  PS: '#f0e442',  // Yellow - phase set
  FT: '#d55e00',  // Vermillion - filter
};

const DEFAULT_FORMAT_COLOR = '#999999';  // Gray for unknown

// Colors for INFO field display - just two colors for readability
const INFO_KEY_COLOR = '#4ec9b0';    // Teal/cyan for key= (and flags)
const INFO_VALUE_COLOR = '#ce9178';  // Orange/salmon for values

interface ColoredInfoDisplayProps {
  info: Record<string, string | boolean>;
}

function ColoredInfoDisplay({ info }: ColoredInfoDisplayProps) {
  const entries = Object.entries(info);

  if (entries.length === 0) {
    return <span style={{ opacity: 0.5 }}>.</span>;
  }

  return (
    <span style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {entries.map(([key, value], idx) => (
        <React.Fragment key={key}>
          {idx > 0 && <span style={{ color: INFO_KEY_COLOR }}>;</span>}
          {value === true ? (
            // Flag field (no value) - just the key
            <span style={{ color: INFO_KEY_COLOR }}>{key}</span>
          ) : (
            // Key=value field
            <>
              <span style={{ color: INFO_KEY_COLOR }}>{key}=</span>
              <span style={{ color: INFO_VALUE_COLOR }}>{String(value)}</span>
            </>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

function FilterBadge({ value }: { value: string }) {
  if (value === '.') {
    return <span style={{ opacity: 0.4 }}>.</span>;
  }
  const isPass = value === 'PASS';
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: '0.85em',
      fontWeight: 600,
      background: isPass ? 'rgba(0,158,115,0.20)' : 'rgba(230,159,0,0.20)',
      color: isPass ? '#009e73' : '#e69f00',
      border: `1px solid ${isPass ? 'rgba(0,158,115,0.4)' : 'rgba(230,159,0,0.4)'}`,
    }}>
      {value}
    </span>
  );
}

function getFormatColor(formatKey: string): string {
  return FORMAT_COLORS[formatKey] || DEFAULT_FORMAT_COLOR;
}

interface ColoredSampleDisplayProps {
  rawSample: Record<string, string>;
  typedSample?: TypedSampleData;
  formatKeys: string[];
  ref_: string;
  alts: string[];
}

function ColoredSampleDisplay({ rawSample, typedSample, formatKeys, ref_, alts }: ColoredSampleDisplayProps) {
  const ctx: FormatRecordContext = {
    ref: ref_,
    alts,
    nAlleles: 1 + alts.length,
    formatKeys,
    sampleName: '',
  };

  return (
    <span style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {formatKeys.map((key, idx) => {
        const rawValue = rawSample[key] || '.';
        const typed = typedSample?.typed[key];
        const color = getFormatColor(key);

        let displayValue: string;
        if (typed) {
          const renderer = getRenderer(key);
          displayValue = renderer.renderDisplay(typed, ctx);
        } else {
          displayValue = rawValue;
        }

        return (
          <React.Fragment key={key}>
            {idx > 0 && <span style={{ color: '#666' }}>:</span>}
            <span style={{ color }} title={`${key}: ${rawValue}`}>
              {displayValue}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}

function buildSampleTooltip(
  rawSample: Record<string, string>,
  typedSample: TypedSampleData | undefined,
  formatKeys: string[],
  formatDefs: Map<string, FormatDefinition>,
  ref_: string,
  alts: string[]
): string {
  if (!typedSample) return Object.values(rawSample).join(':');
  const ctx: FormatRecordContext = {
    ref: ref_,
    alts,
    nAlleles: 1 + alts.length,
    formatKeys,
    sampleName: '',
  };
  const lines: string[] = [];
  for (const key of formatKeys) {
    const typed = typedSample.typed[key];
    if (!typed) {
      lines.push(`${key}: ${rawSample[key] ?? '.'}`);
      continue;
    }
    const summaries = getFormatSummaries(key, typed, formatDefs, ctx);
    if (summaries.length === 0) {
      lines.push(`${key}: ${rawSample[key] ?? '.'}`);
    } else {
      for (const s of summaries) {
        lines.push(`${s.label}: ${s.value}`);
      }
    }
  }
  return lines.join('\n');
}

function formatSampleForDisplay(sample: Record<string, string>, typedSample?: TypedSampleData, ref?: string, alts?: string[]): string {
  if (!typedSample) {
    return Object.values(sample).join(':');
  }

  // Build display string using typed values
  const parts: string[] = [];
  const ctx: FormatRecordContext = {
    ref: ref || '',
    alts: alts || [],
    nAlleles: 1 + (alts?.length || 0),
    formatKeys: Object.keys(sample),
    sampleName: '',
  };

  for (const key of Object.keys(sample)) {
    const typed = typedSample.typed[key];
    if (typed) {
      const renderer = getRenderer(key);
      parts.push(renderer.renderDisplay(typed, ctx));
    } else {
      parts.push(sample[key]);
    }
  }

  return parts.join(':');
}
