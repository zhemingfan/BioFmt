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

  // Route to format-specific preview
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

    // chain, net, GFA use generic preview for now
    // with basic readability from syntax highlighting
    case 'omics-chain':
    case 'omics-net':
    case 'omics-gfa':
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
