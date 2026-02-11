// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import type { ParsedVcfRow, VcfHeaderInfo, FormatDefinition, FormatRecordContext, TypedFormatValue } from '../types';
import { getFormatSummaries, hasSpecializedRenderer } from '../vcf/formatParsers';

interface ExpandedInfoCellProps {
  row: ParsedVcfRow;
  headerInfo: VcfHeaderInfo | null;
}

export function ExpandedInfoCell({ row, headerInfo }: ExpandedInfoCellProps) {
  const infoEntries = Object.entries(row.info);
  const sampleEntries = row.samples ? Object.entries(row.samples) : [];

  // Build format definitions map
  const formatDefs = new Map<string, FormatDefinition>();
  if (headerInfo) {
    for (const fd of headerInfo.formatFields) {
      formatDefs.set(fd.id, fd);
    }
  }

  // Parse ALTs for context
  const alts = row.alt === '.' ? [] : row.alt.split(',');

  return (
    <div className="expanded-content">
      {/* INFO Section */}
      {infoEntries.length > 0 && (
        <div>
          <h4>INFO Fields</h4>
          <table className="key-value-table">
            <tbody>
              {infoEntries.map(([key, value]) => {
                const definition = headerInfo?.infoFields.find((f) => f.id === key);
                return (
                  <tr key={key}>
                    <th title={definition?.description || ''}>
                      {key}
                      {definition && (
                        <span style={{ opacity: 0.6, marginLeft: 4 }}>
                          ({definition.type})
                        </span>
                      )}
                    </th>
                    <td>{value === true ? '(flag)' : String(value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Samples Section */}
      {sampleEntries.length > 0 && row.format && (
        <div style={{ marginTop: 16 }}>
          <h4>Sample Genotypes (FORMAT: {row.format})</h4>
          <SampleGenotypesTable
            row={row}
            sampleEntries={sampleEntries}
            formatDefs={formatDefs}
            alts={alts}
            headerInfo={headerInfo}
          />
        </div>
      )}
    </div>
  );
}

interface SampleGenotypesTableProps {
  row: ParsedVcfRow;
  sampleEntries: [string, Record<string, string>][];
  formatDefs: Map<string, FormatDefinition>;
  alts: string[];
  headerInfo: VcfHeaderInfo | null;
}

function SampleGenotypesTable({ row, sampleEntries, formatDefs, alts, headerInfo }: SampleGenotypesTableProps) {
  const formatKeys = row.format!.split(':');

  return (
    <table className="key-value-table">
      <thead>
        <tr>
          <th>Sample</th>
          {formatKeys.map((key) => {
            const definition = formatDefs.get(key);
            const hasSpecialized = hasSpecializedRenderer(key);
            return (
              <th
                key={key}
                title={definition?.description || ''}
                style={hasSpecialized ? { color: 'var(--vscode-symbolIcon-functionForeground, #dcdcaa)' } : undefined}
              >
                {key}
                {definition && (
                  <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.85em' }}>
                    ({definition.type})
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sampleEntries.slice(0, 10).map(([sampleName, sampleData]) => {
          const typedSample = row.typedSamples?.[sampleName];
          const ctx: FormatRecordContext = {
            ref: row.ref,
            alts,
            nAlleles: 1 + alts.length,
            formatKeys,
            sampleName,
          };

          return (
            <tr key={sampleName}>
              <th>{sampleName}</th>
              {formatKeys.map((key) => {
                const rawValue = sampleData[key] || '.';
                const typedValue = typedSample?.typed[key];
                return (
                  <td key={key}>
                    <FormatValueCell
                      formatKey={key}
                      rawValue={rawValue}
                      typedValue={typedValue}
                      formatDefs={formatDefs}
                      ctx={ctx}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
        {sampleEntries.length > 10 && (
          <tr>
            <td colSpan={formatKeys.length + 1} style={{ textAlign: 'center', opacity: 0.6 }}>
              ... and {sampleEntries.length - 10} more samples
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

interface FormatValueCellProps {
  formatKey: string;
  rawValue: string;
  typedValue?: TypedFormatValue;
  formatDefs: Map<string, FormatDefinition>;
  ctx: FormatRecordContext;
}

function FormatValueCell({ formatKey, rawValue, typedValue, formatDefs, ctx }: FormatValueCellProps) {
  if (!typedValue) {
    return <span>{rawValue}</span>;
  }

  // Get summaries for tooltip
  const summaries = getFormatSummaries(formatKey, typedValue, formatDefs, ctx);
  const tooltipText = summaries.map((s) => `${s.label}: ${s.value}`).join('\n');

  // Render based on type
  switch (typedValue.type) {
    case 'GT':
      return <GenotypeDisplay value={typedValue.value} ctx={ctx} tooltip={tooltipText} />;
    case 'GQ':
      return <NumericDisplay value={typedValue.value} tooltip={tooltipText} />;
    case 'DP':
      return <NumericDisplay value={typedValue.value} tooltip={tooltipText} />;
    case 'AD':
      return <ADDisplay value={typedValue.value} ctx={ctx} tooltip={tooltipText} />;
    case 'PL':
      return <PLDisplay value={typedValue.value} tooltip={tooltipText} />;
    case 'PS':
      return <PSDisplay value={typedValue.value} tooltip={tooltipText} />;
    case 'FT':
      return <FTDisplay value={typedValue.value} tooltip={tooltipText} />;
    default:
      return <span title={tooltipText}>{rawValue}</span>;
  }
}

// ============================================================================
// Specialized Display Components
// ============================================================================

import type { ParsedGenotype, ParsedAD, ParsedPL, ParsedPS, ParsedFT } from '../types';

function GenotypeDisplay({ value, ctx, tooltip }: { value: ParsedGenotype; ctx: FormatRecordContext; tooltip: string }) {
  const sep = value.isPhased ? '|' : '/';
  const indices = value.alleles.map((a) => (a === null ? '.' : String(a)));

  // Map indices to allele letters
  const letters = value.alleles.map((idx) => {
    if (idx === null) return '.';
    if (idx === 0) return ctx.ref.charAt(0);
    const altIdx = idx - 1;
    return altIdx < ctx.alts.length ? ctx.alts[altIdx].charAt(0) : '?';
  });

  // Style based on zygosity
  const isHomRef = value.alleles.every((a) => a === 0);
  const isHomAlt = value.alleles.length > 0 && value.alleles.every((a) => a !== null && a > 0 && a === value.alleles[0]);
  const isHet = !isHomRef && !isHomAlt && !value.hasMissing;

  let color = 'inherit';
  if (isHomRef) {
    color = 'var(--vscode-charts-green, #89d185)';
  } else if (isHomAlt) {
    color = 'var(--vscode-charts-red, #f14c4c)';
  } else if (isHet) {
    color = 'var(--vscode-charts-yellow, #cca700)';
  }

  return (
    <span title={tooltip} style={{ color, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {indices.join(sep)}
      <span style={{ opacity: 0.6, marginLeft: 4 }}>({letters.join(sep)})</span>
      {value.isPhased && <span style={{ marginLeft: 4, fontSize: '0.8em', opacity: 0.7 }}>⬍</span>}
    </span>
  );
}

function NumericDisplay({ value, tooltip }: { value: number | null; tooltip: string }) {
  if (value === null) {
    return <span title={tooltip} style={{ opacity: 0.5 }}>.</span>;
  }

  // Color based on quality (for GQ primarily)
  let color = 'inherit';
  if (value >= 99) {
    color = 'var(--vscode-charts-green, #89d185)';
  } else if (value >= 30) {
    color = 'var(--vscode-charts-yellow, #cca700)';
  } else if (value < 20) {
    color = 'var(--vscode-charts-red, #f14c4c)';
  }

  return (
    <span title={tooltip} style={{ color, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {value}
    </span>
  );
}

function ADDisplay({ value, ctx, tooltip }: { value: ParsedAD; ctx: FormatRecordContext; tooltip: string }) {
  if (value.values.length === 0) {
    return <span title={tooltip} style={{ opacity: 0.5 }}>.</span>;
  }

  return (
    <span title={tooltip} style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      <span style={{ color: 'var(--vscode-charts-green, #89d185)' }}>
        {value.refDepth ?? '.'}
      </span>
      {value.altDepths.map((d, i) => (
        <span key={i}>
          ,<span style={{ color: 'var(--vscode-charts-orange, #d18616)' }}>{d ?? '.'}</span>
        </span>
      ))}
      <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.85em' }}>
        (Σ={value.total})
      </span>
    </span>
  );
}

function PLDisplay({ value, tooltip }: { value: ParsedPL; tooltip: string }) {
  if (value.values.length === 0) {
    return <span title={tooltip} style={{ opacity: 0.5 }}>.</span>;
  }

  return (
    <span title={tooltip} style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {value.values.map((v, i) => {
        const isMin = i === value.minPLIndex;
        return (
          <span key={i}>
            {i > 0 && ','}
            <span style={isMin ? { color: 'var(--vscode-charts-green, #89d185)', fontWeight: 600 } : undefined}>
              {v ?? '.'}
            </span>
          </span>
        );
      })}
      {value.minPL !== null && (
        <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.85em' }}>
          (min={value.minPL})
        </span>
      )}
    </span>
  );
}

function PSDisplay({ value, tooltip }: { value: ParsedPS; tooltip: string }) {
  if (value.value === null) {
    return <span title={tooltip} style={{ opacity: 0.5 }}>.</span>;
  }

  return (
    <span title={tooltip} style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {value.value}
      <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '0.8em' }}>⬍block</span>
    </span>
  );
}

function FTDisplay({ value, tooltip }: { value: ParsedFT; tooltip: string }) {
  if (value.isPassing) {
    return (
      <span
        title={tooltip}
        style={{
          color: 'var(--vscode-charts-green, #89d185)',
          fontWeight: 500,
        }}
      >
        PASS
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      style={{
        color: 'var(--vscode-charts-red, #f14c4c)',
      }}
    >
      {value.filters.join(';')}
    </span>
  );
}
