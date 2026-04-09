// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { VcfPreview } from './components/VcfPreview';
import { BedPreview } from './components/BedPreview';
import { GtfGffPreview } from './components/GtfGffPreview';
import { SamPreview } from './components/SamPreview';
import { PafPreview } from './components/PafPreview';
import { PslPreview } from './components/PslPreview';
import { TrackPlot } from './components/TrackPlot';
import { MafAlignmentPreview } from './components/MafAlignmentPreview';
import { MafMutationPreview } from './components/MafMutationPreview';
import { MgfPreview } from './components/MgfPreview';
import { MtxPreview } from './components/MtxPreview';
import { MzTabPreview } from './components/MzTabPreview';
import { GenbankPreview } from './components/GenbankPreview';
import { GenericPreview } from './components/GenericPreview';
import { ChainPreview } from './components/ChainPreview';
import { NetPreview } from './components/NetPreview';
import { GfaPreview } from './components/GfaPreview';
import { FastaPreview } from './components/FastaPreview';
import { FastqPreview } from './components/FastqPreview';
import type { DocumentMetadata, MessageFromExtension, VcfHeaderInfo } from './types';
import './styles.css';

const vscode = acquireVsCodeApi();

export function App() {
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [rows, setRows] = useState<string[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const loadedCountRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [headerInfo, setHeaderInfo] = useState<VcfHeaderInfo | null>(null);
  const rowCache = useRef<Map<number, string>>(new Map());
  const pendingRequests = useRef<Set<string>>(new Set());
  const flushContiguousRows = useCallback(() => {
    const start = loadedCountRef.current;
    const newRows: string[] = [];
    let index = start;
    while (rowCache.current.has(index)) {
      newRows.push(rowCache.current.get(index)!);
      index++;
    }

    if (newRows.length === 0) {
      return;
    }

    loadedCountRef.current = index;
    setRows((prev) => prev.concat(newRows));
    setLoadedCount(index);
  }, []);
  const getRow = useCallback((line: number) => rowCache.current.get(line), []);
  const isLineLoaded = useCallback((line: number) => rowCache.current.has(line), []);

  // Request initial data
  useEffect(() => {
    vscode.postMessage({ command: 'getMetadata' });
    vscode.postMessage({ command: 'requestRows', startLine: 0, endLine: 500 });
  }, []);

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageFromExtension>) => {
      try {
        const message = event.data;

        switch (message.command) {
        case 'metadata':
          setMetadata({
            lineCount: message.lineCount,
            languageId: message.languageId,
            fileName: message.fileName,
            headerInfo: message.headerInfo,
            providerType: message.providerType,
            references: message.references,
            previewSettings: message.previewSettings,
            error: message.error,
          });
          if (message.headerInfo) {
            setHeaderInfo(message.headerInfo);
          }
          setLoading(false);
          break;

        case 'rowData':
          // Cache the rows
          message.rows.forEach((row, idx) => {
            rowCache.current.set(message.startLine + idx, row);
          });

          // Evict oldest entries to prevent unbounded memory growth
          if (rowCache.current.size > 50000) {
            const keys = Array.from(rowCache.current.keys()).sort((a, b) => a - b);
            const evictCount = rowCache.current.size - 50000;
            for (let i = 0; i < evictCount; i++) {
              rowCache.current.delete(keys[i]);
            }
          }

          flushContiguousRows();

          // Clear pending request
          pendingRequests.current.delete(`${message.startLine}:${message.startLine + message.rows.length}`);
          break;

        case 'headerInfo':
          setHeaderInfo(message.headerInfo);
          break;
      }
      } catch (err) {
        console.error('Error handling message from extension:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Request more rows when needed
  const requestRows = useCallback((startLine: number, endLine: number) => {
    const totalLines = metadata?.lineCount;
    const clampedStart = Math.max(0, startLine);
    const clampedEnd = totalLines ? Math.min(endLine, totalLines) : endLine;

    if (clampedEnd <= clampedStart) {
      return;
    }

    const key = `${clampedStart}:${clampedEnd}`;
    if (pendingRequests.current.has(key)) {
      return;
    }

    // Check if we already have these rows cached
    let needsRequest = false;
    for (let i = clampedStart; i < clampedEnd; i++) {
      if (!rowCache.current.has(i)) {
        needsRequest = true;
        break;
      }
    }

    if (needsRequest) {
      pendingRequests.current.add(key);
      vscode.postMessage({ command: 'requestRows', startLine: clampedStart, endLine: clampedEnd });
    }
  }, [metadata]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <div>Loading preview...</div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="error">
        <div>Failed to load document metadata</div>
      </div>
    );
  }

  // Indexed/binary mode: show RegionNavigator + format preview using region data
  if (metadata.providerType === 'indexed' || metadata.providerType === 'binary') {
    return (
      <IndexedPreviewWrapper metadata={metadata} />
    );
  }

  // Route to format-specific preview (text mode)
  switch (metadata.languageId) {
    case 'omics-vcf':
      return (
        <VcfPreview
          metadata={metadata}
          rows={rows}
          headerInfo={headerInfo}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-bed':
    case 'omics-bedpe':
    case 'omics-narrowpeak':
    case 'omics-broadpeak':
      return (
        <BedPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-gtf':
    case 'omics-gff3':
      return (
        <GtfGffPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-sam':
      return (
        <SamPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-paf':
      return (
        <PafPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-psl':
      return (
        <PslPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-wig':
    case 'omics-bedgraph':
      return (
        <TrackPlot
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-maf-alignment':
      return (
        <MafAlignmentPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-maf-mutation':
      return (
        <MafMutationPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-mgf':
      return (
        <MgfPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-mtx':
      return (
        <MtxPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-mztab':
      return (
        <MzTabPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-genbank':
      return (
        <GenbankPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-chain':
      return (
        <ChainPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-net':
      return (
        <NetPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-gfa':
      return (
        <GfaPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-fasta':
      return (
        <FastaPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    case 'omics-fastq':
      return (
        <FastqPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          onRequestRows={requestRows}
        />
      );

    default:
      return (
        <GenericPreview
          metadata={metadata}
          rows={rows}
          loadedLineCount={loadedCount}
          getRow={getRow}
          isLineLoaded={isLineLoaded}
          onRequestRows={requestRows}
        />
      );
  }
}

/**
 * Wrapper for indexed/binary file previews.
 * Renders RegionNavigator above the format-specific preview,
 * feeding region query results as rows.
 *
 * Imports useRegionProvider and RegionNavigator only when actually needed
 * (indexed/binary files) to avoid overhead for text previews.
 */
function IndexedPreviewWrapper({ metadata }: { metadata: DocumentMetadata }) {
  // Lazy-require to avoid module-level side effects for text previews
  const { useRegionProvider } = require('./hooks/useRegionProvider');
  const { RegionNavigator } = require('./components/RegionNavigator');
  const { regionState, references, requestRegion } = useRegionProvider(vscode);

  // Merge metadata references with dynamically fetched ones
  const refs = references.length > 0 ? references : metadata.references || [];

  // Build a pseudo metadata with loaded line count for the format preview
  const regionRows = regionState.rows;
  const noop = useCallback(() => {}, []);

  // Route region rows to the appropriate format preview
  const renderFormatPreview = () => {
    if (regionState.loading) {
      return (
        <div className="loading">
          <div className="spinner"></div>
          <div>Loading region...</div>
        </div>
      );
    }

    if (!regionState.query) {
      return (
        <div className="indexed-placeholder">
          <p>Select a region above to view records.</p>
          {metadata.error && (
            <p className="region-navigator-error">{metadata.error}</p>
          )}
        </div>
      );
    }

    if (regionRows.length === 0 && !regionState.error) {
      return (
        <div className="indexed-placeholder">
          <p>No records found in this region.</p>
        </div>
      );
    }

    // Use the same format-specific preview components with region rows
    switch (metadata.languageId) {
      case 'omics-vcf':
        return (
          <VcfPreview
            metadata={metadata}
            rows={regionRows}
            headerInfo={metadata.headerInfo || null}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      case 'omics-bed':
      case 'omics-bedpe':
      case 'omics-narrowpeak':
      case 'omics-broadpeak':
        return (
          <BedPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      case 'omics-gtf':
      case 'omics-gff3':
        return (
          <GtfGffPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      case 'omics-sam':
      case 'omics-bam':
        return (
          <SamPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      case 'omics-fasta':
        return (
          <FastaPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      case 'omics-fastq':
        return (
          <FastqPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            onRequestRows={noop}
          />
        );

      default:
        return (
          <GenericPreview
            metadata={metadata}
            rows={regionRows}
            loadedLineCount={regionRows.length}
            getRow={(line: number) => regionRows[line]}
            isLineLoaded={(line: number) => line < regionRows.length}
            onRequestRows={noop}
          />
        );
    }
  };

  return (
    <div className="indexed-preview">
      <div className="indexed-header">
        <h2>{metadata.fileName}</h2>
        <span className="indexed-badge">
          {metadata.providerType === 'binary' ? 'Binary' : 'Indexed'}
        </span>
      </div>
      <RegionNavigator
        references={refs}
        onNavigate={requestRegion}
        loading={regionState.loading}
        resultCount={regionState.query ? regionRows.length : undefined}
        hasMore={regionState.hasMore}
        error={regionState.error}
        currentQuery={regionState.query}
      />
      {renderFormatPreview()}
    </div>
  );
}
