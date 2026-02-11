// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { VirtualTable, ColumnDefinition } from './VirtualTable';
import { useScrollHandler } from '../hooks';
import type { DocumentMetadata } from '../types';

interface MzTabPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

type SectionType = 'MTD' | 'PRH' | 'PRT' | 'PEH' | 'PEP' | 'PSH' | 'PSM' | 'SMH' | 'SML' | 'COM';

interface Section {
  type: SectionType;
  rows: Record<string, string>[];
  columns: string[];
}

const SECTION_LABELS: Record<SectionType, string> = {
  'MTD': 'Metadata',
  'PRH': 'Protein Header',
  'PRT': 'Proteins',
  'PEH': 'Peptide Header',
  'PEP': 'Peptides',
  'PSH': 'PSM Header',
  'PSM': 'PSMs',
  'SMH': 'Small Molecule Header',
  'SML': 'Small Molecules',
  'COM': 'Comments',
};

function parseSections(rows: string[]): Map<SectionType, Section> {
  const sections = new Map<SectionType, Section>();
  const headerRows = new Map<string, string[]>();

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 2) continue;

    const prefix = parts[0] as SectionType;

    // Handle header rows (PRH, PEH, PSH, SMH)
    if (['PRH', 'PEH', 'PSH', 'SMH'].includes(prefix)) {
      headerRows.set(prefix.substring(0, 2), parts.slice(1));
      continue;
    }

    // Handle data rows
    if (!sections.has(prefix)) {
      sections.set(prefix, {
        type: prefix,
        rows: [],
        columns: [],
      });
    }

    const section = sections.get(prefix)!;

    if (prefix === 'MTD') {
      // Metadata: key-value pairs
      section.rows.push({
        key: parts[1] || '',
        value: parts.slice(2).join('\t'),
      });
      section.columns = ['key', 'value'];
    } else if (prefix === 'COM') {
      // Comments
      section.rows.push({
        comment: parts.slice(1).join('\t'),
      });
      section.columns = ['comment'];
    } else {
      // Data rows (PRT, PEP, PSM, SML)
      const sectionPrefix = prefix.substring(0, 2);
      const columns = headerRows.get(sectionPrefix) || [];

      const row: Record<string, string> = { _lineNumber: String(rows.indexOf(line) + 1) };
      for (let i = 1; i < parts.length; i++) {
        const colName = columns[i - 1] || `col_${i}`;
        row[colName] = parts[i];
      }
      section.rows.push(row);

      if (section.columns.length === 0 && columns.length > 0) {
        section.columns = columns;
      }
    }
  }

  return sections;
}

export function MzTabPreview({ metadata, rows, loadedLineCount, onRequestRows }: MzTabPreviewProps) {
  const [activeSection, setActiveSection] = useState<SectionType>('MTD');
  const [searchTerm, setSearchTerm] = useState('');

  // Parse sections
  const sections = useMemo(() => parseSections(rows), [rows]);

  // Get available section types
  const availableSections = useMemo(() => {
    return Array.from(sections.keys()).filter(s => sections.get(s)!.rows.length > 0);
  }, [sections]);

  // Set initial active section
  useMemo(() => {
    if (!sections.has(activeSection) && availableSections.length > 0) {
      setActiveSection(availableSections[0]);
    }
  }, [sections, activeSection, availableSections]);

  const currentSection = sections.get(activeSection);

  // Build columns for current section
  const columns: ColumnDefinition[] = useMemo(() => {
    if (!currentSection) return [];

    // Sample content to estimate widths
    const sampleSize = Math.min(currentSection.rows.length, 50);
    const sampleRows = currentSection.rows.slice(0, sampleSize);

    return currentSection.columns.map(col => {
      let maxLen = col.length;
      for (const row of sampleRows) {
        const val = row[col] || '';
        maxLen = Math.max(maxLen, val.length);
      }
      const estimated = Math.max(80, maxLen * 7.5 + 16);
      return {
        key: col,
        label: col,
        width: Math.min(600, estimated),
      };
    });
  }, [currentSection]);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!currentSection) return [];
    if (!searchTerm) return currentSection.rows;

    const term = searchTerm.toLowerCase();
    return currentSection.rows.filter(row =>
      Object.values(row).some(v => v.toLowerCase().includes(term))
    );
  }, [currentSection, searchTerm]);

  // Handle scroll for lazy loading
  const handleScroll = useScrollHandler({
    loadedLineCount,
    totalLineCount: metadata.lineCount,
    onRequestRows,
  });

  return (
    <div className="mztab-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: mzTab</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Sections: {availableSections.length}</span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="section-tabs">
        {availableSections.map(sectionType => {
          const section = sections.get(sectionType)!;
          return (
            <button
              key={sectionType}
              className={`section-tab ${activeSection === sectionType ? 'active' : ''}`}
              onClick={() => setActiveSection(sectionType)}
            >
              {SECTION_LABELS[sectionType] || sectionType}
              <span className="section-count">{section.rows.length}</span>
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="filter-bar">
        <label>
          Search:
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter rows..."
          />
        </label>

        {searchTerm && currentSection && (
          <span className="filter-info">
            Showing {filteredRows.length.toLocaleString()} of {currentSection.rows.length.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-container" style={{ flex: 1 }}>
        {currentSection ? (
          <VirtualTable
            columns={columns}
            rows={filteredRows}
            onScroll={handleScroll}
          />
        ) : (
          <div className="no-section">No data in this section</div>
        )}
      </div>
    </div>
  );
}
