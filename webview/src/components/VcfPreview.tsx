// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState, useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { DocumentMetadata, VcfHeaderInfo, ParsedVcfRow, FilterConfig, FormatDefinition, TypedSampleData, FormatRecordContext } from '../types';
import { VcfHeaderPanel } from './VcfHeaderPanel';
import { VcfFilterBar } from './VcfFilterBar';
import { ExpandedInfoCell } from './ExpandedInfoCell';
import { parseSampleFormats, renderFormatDisplay, getRenderer } from '../vcf/formatParsers';
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

export function VcfPreview({ metadata, rows, headerInfo, loadedLineCount, onRequestRows }: VcfPreviewProps) {
  const [filter, setFilter] = useState<FilterConfig>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showAllSamples, setShowAllSamples] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  // Parse VCF rows
  const parsedRows = useMemo(() => {
    const result: ParsedVcfRow[] = [];
    const headerEndLine = headerInfo?.headerEndLine || 0;

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
    if (!filter.chrom && !filter.filter && filter.minQual === undefined && !filter.infoKey) {
      return parsedRows;
    }

    return parsedRows.filter((row) => {
      if (filter.chrom && row.chrom !== filter.chrom) return false;
      if (filter.filter && row.filter !== filter.filter) return false;
      if (filter.minQual !== undefined && (row.qual === null || row.qual < filter.minQual)) return false;

      if (filter.infoKey && filter.infoValue !== undefined) {
        const infoVal = row.info[filter.infoKey];
        if (infoVal === undefined) return false;

        const numVal = typeof infoVal === 'string' ? parseFloat(infoVal) : NaN;
        const filterNum = parseFloat(filter.infoValue);

        if (!isNaN(numVal) && !isNaN(filterNum)) {
          switch (filter.infoOperator) {
            case '>': if (!(numVal > filterNum)) return false; break;
            case '<': if (!(numVal < filterNum)) return false; break;
            case '>=': if (!(numVal >= filterNum)) return false; break;
            case '<=': if (!(numVal <= filterNum)) return false; break;
            default: if (String(infoVal) !== filter.infoValue) return false;
          }
        } else {
          if (String(infoVal) !== filter.infoValue) return false;
        }
      }

      return true;
    });
  }, [parsedRows, filter]);

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

  // Determine which samples to show
  const sampleColumns = useMemo(() => {
    if (!headerInfo?.samples) return [];
    const limit = showAllSamples ? headerInfo.samples.length : 10;
    return headerInfo.samples.slice(0, limit);
  }, [headerInfo, showAllSamples]);

  // Row renderer for virtual list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = filteredRows[index];
    if (!row) return null;

    const isExpanded = expandedRow === row.lineNumber;

    return (
      <div style={style}>
        <div
          className={`table-row ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setExpandedRow(isExpanded ? null : row.lineNumber)}
        >
          <div className="table-cell col-chrom" title={row.chrom}>{row.chrom}</div>
          <div className="table-cell col-pos" title={String(row.pos)}>{row.pos}</div>
          <div className="table-cell col-id" title={row.id}>{row.id}</div>
          <div className="table-cell col-ref" title={row.ref}>{row.ref}</div>
          <div className="table-cell col-alt" title={row.alt}>{row.alt}</div>
          <div className="table-cell col-qual" title={row.qual?.toString() || '.'}>{row.qual ?? '.'}</div>
          <div className="table-cell col-filter" title={row.filter}>{row.filter}</div>
          <div
            className={`table-cell col-info expandable ${isExpanded ? 'expanded' : ''}`}
            title={formatInfoForDisplay(row.info)}
          >
            <ColoredInfoDisplay info={row.info} />
          </div>
          {row.format && <div className="table-cell col-format" title={row.format}>{row.format}</div>}
          {sampleColumns.map((sample) => {
            const alts = row.alt === '.' ? [] : row.alt.split(',');
            const typedSample = row.typedSamples?.[sample];
            const rawSample = row.samples?.[sample];
            const formatKeys = row.format?.split(':') || [];
            return (
              <div
                key={sample}
                className="table-cell col-sample"
                title={rawSample ? Object.values(rawSample).join(':') : '.'}
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
        {isExpanded && (
          <ExpandedInfoCell
            row={row}
            headerInfo={headerInfo}
          />
        )}
      </div>
    );
  }, [filteredRows, expandedRow, sampleColumns, headerInfo]);

  // Handle scroll to load more rows
  const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    const visibleStart = Math.floor(scrollOffset / ROW_HEIGHT);
    const visibleEnd = visibleStart + Math.ceil(window.innerHeight / ROW_HEIGHT) + 10;

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
          <span>Variants: {filteredRows.length.toLocaleString()}</span>
          {headerInfo?.samples && <span>Samples: {headerInfo.samples.length}</span>}
        </div>
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

      {/* Header Panel */}
      {headerInfo && (
        <VcfHeaderPanel
          headerInfo={headerInfo}
          expanded={headerExpanded}
          onToggle={() => setHeaderExpanded(!headerExpanded)}
        />
      )}

      {/* Filter Bar */}
      <VcfFilterBar
        filter={filter}
        onFilterChange={setFilter}
        options={filterOptions}
        infoFields={headerInfo?.infoFields || []}
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
        {/* Header row */}
        <div className="table-header">
          <div className="table-header-cell col-chrom">CHROM</div>
          <div className="table-header-cell col-pos">POS</div>
          <div className="table-header-cell col-id">ID</div>
          <div className="table-header-cell col-ref">REF</div>
          <div className="table-header-cell col-alt">ALT</div>
          <div className="table-header-cell col-qual">QUAL</div>
          <div className="table-header-cell col-filter">FILTER</div>
          <div className="table-header-cell col-info">INFO</div>
          {parsedRows[0]?.format && <div className="table-header-cell col-format">FORMAT</div>}
          {sampleColumns.map((sample) => (
            <div key={sample} className="table-header-cell col-sample">{sample}</div>
          ))}
        </div>

        {/* Virtual list */}
        <List
          height={window.innerHeight - 300}
          itemCount={filteredRows.length}
          itemSize={expandedRow !== null ? ROW_HEIGHT * 2 : ROW_HEIGHT}
          width="100%"
          onScroll={handleScroll}
        >
          {Row}
        </List>
      </div>
    </div>
  );
}

function parseVcfLine(line: string, lineNumber: number, headerInfo: VcfHeaderInfo | null): ParsedVcfRow | null {
  const columns = line.split('\t');
  if (columns.length < 8) return null;

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

    for (let i = 0; i < headerInfo.samples.length && i + 9 < columns.length; i++) {
      const sampleName = headerInfo.samples[i];
      const sampleValues = columns[9 + i].split(':');
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
    pos: parseInt(columns[1], 10),
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
