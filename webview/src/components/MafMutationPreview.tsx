// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';
import { sortChromosomes } from '../utils';

interface MafMutationPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

// Common MAF mutation columns
const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { key: 'Hugo_Symbol', label: 'Hugo_Symbol', width: 120 },
  { key: 'Chromosome', label: 'Chromosome', width: 100 },
  { key: 'Start_Position', label: 'Start_Position', width: 120 },
  { key: 'End_Position', label: 'End_Position', width: 120 },
  { key: 'Variant_Classification', label: 'Variant_Classification', width: 160 },
  { key: 'Variant_Type', label: 'Variant_Type', width: 100 },
  { key: 'Reference_Allele', label: 'Reference_Allele', width: 120 },
  { key: 'Tumor_Seq_Allele1', label: 'Tumor_Allele1', width: 120 },
  { key: 'Tumor_Seq_Allele2', label: 'Tumor_Allele2', width: 120 },
  { key: 'Tumor_Sample_Barcode', label: 'Tumor_Sample', width: 150 },
];

export function MafMutationPreview({ metadata, rows, loadedLineCount, onRequestRows }: MafMutationPreviewProps) {
  const [geneFilter, setGeneFilter] = useState('');
  const [chromFilter, setChromFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Parse header and rows
  const { columns, parsedRows, genes, chromosomes, classifications } = useMemo(() => {
    const result: Record<string, string>[] = [];
    let headerRow: string[] = [];
    const geneSet = new Set<string>();
    const chromSet = new Set<string>();
    const classSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const line = rows[i];
      if (!line.trim()) continue;

      // Skip comments
      if (line.startsWith('#')) continue;

      const cols = line.split('\t');

      // First non-comment line with Hugo_Symbol is the header
      if (headerRow.length === 0) {
        if (cols.includes('Hugo_Symbol') || cols[0] === 'Hugo_Symbol') {
          headerRow = cols;
          continue;
        }
      }

      if (headerRow.length > 0) {
        const row: Record<string, string> = { _lineNumber: String(i + 1) };
        for (let j = 0; j < cols.length && j < headerRow.length; j++) {
          row[headerRow[j]] = cols[j];
        }

        if (row.Hugo_Symbol) geneSet.add(row.Hugo_Symbol);
        if (row.Chromosome) chromSet.add(row.Chromosome);
        if (row.Variant_Classification) classSet.add(row.Variant_Classification);

        result.push(row);
      }
    }

    // Build columns from header
    const columnDefs: ColumnDefinition[] = headerRow.length > 0
      ? headerRow.slice(0, 15).map(key => ({
          key,
          label: key,
          width: Math.min(150, Math.max(80, key.length * 10)),
        }))
      : DEFAULT_COLUMNS;

    return {
      columns: columnDefs,
      parsedRows: result,
      genes: Array.from(geneSet).sort(),
      chromosomes: sortChromosomes(chromSet),
      classifications: Array.from(classSet).sort(),
    };
  }, [rows]);

  // Filter rows
  const filteredRows = useMemo(() => {
    let filtered = parsedRows;

    if (geneFilter) {
      const term = geneFilter.toLowerCase();
      filtered = filtered.filter(row =>
        row.Hugo_Symbol?.toLowerCase().includes(term)
      );
    }

    if (chromFilter) {
      filtered = filtered.filter(row => row.Chromosome === chromFilter);
    }

    if (classFilter) {
      filtered = filtered.filter(row => row.Variant_Classification === classFilter);
    }

    return filtered;
  }, [parsedRows, geneFilter, chromFilter, classFilter]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  return (
    <div className="maf-mutation-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: MAF (Mutation Annotation)</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Mutations: {parsedRows.length.toLocaleString()}</span>
          <span>Genes: {genes.length.toLocaleString()}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>
          Gene:
          <input
            type="text"
            value={geneFilter}
            onChange={(e) => setGeneFilter(e.target.value)}
            placeholder="Search gene..."
            list="gene-suggestions"
          />
          <datalist id="gene-suggestions">
            {genes.slice(0, 100).map(g => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

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

        <label>
          Classification:
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">All</option>
            {classifications.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </label>

        {(geneFilter || chromFilter || classFilter) && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {parsedRows.length.toLocaleString()} mutations
          </span>
        )}
      </div>

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
