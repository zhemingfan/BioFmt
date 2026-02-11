// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentMetadata } from '../types';

interface GenbankPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface GenbankRecord {
  locus: string;
  definition: string;
  accession: string;
  version: string;
  keywords: string;
  source: string;
  organism: string;
  features: Feature[];
  origin: string;
  sequence: string;
}

interface Feature {
  type: string;
  location: string;
  qualifiers: { key: string; value: string }[];
}

function parseGenbank(rows: string[]): GenbankRecord {
  const record: GenbankRecord = {
    locus: '',
    definition: '',
    accession: '',
    version: '',
    keywords: '',
    source: '',
    organism: '',
    features: [],
    origin: '',
    sequence: '',
  };

  let currentSection = '';
  let currentFeature: Feature | null = null;
  let currentQualifierValue = '';
  let inSequence = false;

  for (const line of rows) {
    // Handle sequence section
    if (inSequence) {
      if (line.startsWith('//')) {
        inSequence = false;
        continue;
      }
      // Extract sequence characters (skip line numbers and spaces)
      const seqPart = line.replace(/[\d\s]/g, '');
      record.sequence += seqPart;
      continue;
    }

    // Parse headers
    if (line.startsWith('LOCUS')) {
      record.locus = line.substring(12).trim();
      currentSection = 'LOCUS';
    } else if (line.startsWith('DEFINITION')) {
      record.definition = line.substring(12).trim();
      currentSection = 'DEFINITION';
    } else if (line.startsWith('ACCESSION')) {
      record.accession = line.substring(12).trim();
      currentSection = 'ACCESSION';
    } else if (line.startsWith('VERSION')) {
      record.version = line.substring(12).trim();
      currentSection = 'VERSION';
    } else if (line.startsWith('KEYWORDS')) {
      record.keywords = line.substring(12).trim();
      currentSection = 'KEYWORDS';
    } else if (line.startsWith('SOURCE')) {
      record.source = line.substring(12).trim();
      currentSection = 'SOURCE';
    } else if (line.startsWith('  ORGANISM')) {
      record.organism = line.substring(12).trim();
      currentSection = 'ORGANISM';
    } else if (line.startsWith('FEATURES')) {
      currentSection = 'FEATURES';
    } else if (line.startsWith('ORIGIN')) {
      currentSection = 'ORIGIN';
      inSequence = true;
    } else if (line.startsWith('//')) {
      // End of record
    } else if (currentSection === 'DEFINITION' && line.startsWith('            ')) {
      // Continuation of definition
      record.definition += ' ' + line.trim();
    } else if (currentSection === 'FEATURES' && line.length > 21) {
      // Feature parsing
      const featureType = line.substring(5, 21).trim();
      const location = line.substring(21).trim();

      if (featureType && !featureType.startsWith('/')) {
        // New feature
        if (currentFeature) {
          record.features.push(currentFeature);
        }
        currentFeature = {
          type: featureType,
          location: location,
          qualifiers: [],
        };
      } else if (line.trim().startsWith('/') && currentFeature) {
        // Qualifier
        const qualLine = line.trim();
        const eqIdx = qualLine.indexOf('=');
        if (eqIdx > 0) {
          const key = qualLine.substring(1, eqIdx);
          let value = qualLine.substring(eqIdx + 1);
          // Remove quotes
          value = value.replace(/^"|"$/g, '');
          currentFeature.qualifiers.push({ key, value });
          currentQualifierValue = value;
        } else {
          currentFeature.qualifiers.push({
            key: qualLine.substring(1),
            value: 'true'
          });
        }
      } else if (currentFeature && line.startsWith('                     ') && line.trim()) {
        // Continuation of qualifier value
        const lastQual = currentFeature.qualifiers[currentFeature.qualifiers.length - 1];
        if (lastQual) {
          lastQual.value += ' ' + line.trim().replace(/^"|"$/g, '');
        }
      }
    }
  }

  // Don't forget last feature
  if (currentFeature) {
    record.features.push(currentFeature);
  }

  return record;
}

export function GenbankPreview({ metadata, rows, loadedLineCount, onRequestRows }: GenbankPreviewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['header', 'features'])
  );
  const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const record = useMemo(() => parseGenbank(rows), [rows]);

  const isTruncated = loadedLineCount < metadata.lineCount;

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && isTruncated) {
      setLoadingMore(true);
      onRequestRows(loadedLineCount, Math.min(loadedLineCount + 5000, metadata.lineCount));
    }
  }, [loadingMore, isTruncated, loadedLineCount, metadata.lineCount, onRequestRows]);

  useEffect(() => {
    setLoadingMore(false);
  }, [rows.length]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const toggleFeature = (index: number) => {
    const newExpanded = new Set(expandedFeatures);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedFeatures(newExpanded);
  };

  // Group features by type
  const featuresByType = useMemo(() => {
    const groups = new Map<string, Feature[]>();
    for (const feature of record.features) {
      if (!groups.has(feature.type)) {
        groups.set(feature.type, []);
      }
      groups.get(feature.type)!.push(feature);
    }
    return groups;
  }, [record.features]);

  return (
    <div className="genbank-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: GenBank</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Features: {record.features.length}</span>
          <span>Sequence: {record.sequence.length.toLocaleString()} bp</span>
        </div>
      </div>

      {/* Truncation warning */}
      {isTruncated && (
        <div className="truncation-warning">
          Showing {loadedLineCount.toLocaleString()} of {metadata.lineCount.toLocaleString()} lines.
          <button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Outline */}
      <div className="genbank-outline">
        {/* Header section */}
        <div className="outline-section">
          <div
            className="section-header"
            onClick={() => toggleSection('header')}
          >
            <span className="toggle">{expandedSections.has('header') ? '▾' : '▸'}</span>
            <span className="section-name">Header</span>
          </div>
          {expandedSections.has('header') && (
            <div className="section-content">
              <div className="field-row">
                <span className="field-label">LOCUS</span>
                <span className="field-value">{record.locus}</span>
              </div>
              <div className="field-row">
                <span className="field-label">DEFINITION</span>
                <span className="field-value">{record.definition}</span>
              </div>
              <div className="field-row">
                <span className="field-label">ACCESSION</span>
                <span className="field-value">{record.accession}</span>
              </div>
              <div className="field-row">
                <span className="field-label">VERSION</span>
                <span className="field-value">{record.version}</span>
              </div>
              {record.keywords && (
                <div className="field-row">
                  <span className="field-label">KEYWORDS</span>
                  <span className="field-value">{record.keywords}</span>
                </div>
              )}
              {record.source && (
                <div className="field-row">
                  <span className="field-label">SOURCE</span>
                  <span className="field-value">{record.source}</span>
                </div>
              )}
              {record.organism && (
                <div className="field-row">
                  <span className="field-label">ORGANISM</span>
                  <span className="field-value">{record.organism}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Features section */}
        <div className="outline-section">
          <div
            className="section-header"
            onClick={() => toggleSection('features')}
          >
            <span className="toggle">{expandedSections.has('features') ? '▾' : '▸'}</span>
            <span className="section-name">Features ({record.features.length})</span>
          </div>
          {expandedSections.has('features') && (
            <div className="section-content">
              {Array.from(featuresByType.entries()).map(([type, features]) => (
                <div key={type} className="feature-group">
                  <div className="feature-type-header">
                    {type} <span className="feature-count">({features.length})</span>
                  </div>
                  {features.map((feature, idx) => {
                    const globalIdx = record.features.indexOf(feature);
                    const isExpanded = expandedFeatures.has(globalIdx);
                    return (
                      <div key={idx} className="feature-item">
                        <div
                          className="feature-header"
                          onClick={() => toggleFeature(globalIdx)}
                        >
                          <span className="toggle">{isExpanded ? '▾' : '▸'}</span>
                          <span className="feature-location">{feature.location}</span>
                        </div>
                        {isExpanded && feature.qualifiers.length > 0 && (
                          <div className="feature-qualifiers">
                            {feature.qualifiers.map((q, qIdx) => (
                              <div key={qIdx} className="qualifier-row">
                                <span className="qualifier-key">/{q.key}</span>
                                <span className="qualifier-value">{q.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sequence section */}
        <div className="outline-section">
          <div
            className="section-header"
            onClick={() => toggleSection('sequence')}
          >
            <span className="toggle">{expandedSections.has('sequence') ? '▾' : '▸'}</span>
            <span className="section-name">Sequence ({record.sequence.length.toLocaleString()} bp)</span>
          </div>
          {expandedSections.has('sequence') && (
            <div className="section-content">
              <div className="sequence-preview">
                {record.sequence.substring(0, 500)}
                {record.sequence.length > 500 && (
                  <span className="sequence-more">
                    ...{(record.sequence.length - 500).toLocaleString()} more bp
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
