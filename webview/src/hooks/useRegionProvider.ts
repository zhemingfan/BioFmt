// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReferenceInfo, MessageFromExtension } from '../types';

const vscode = acquireVsCodeApi();

export interface RegionQuery {
  chrom: string;
  start: number;
  end: number;
}

export interface RegionState {
  rows: string[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  query: RegionQuery | null;
}

export interface UseRegionProviderResult {
  regionState: RegionState;
  references: ReferenceInfo[];
  requestRegion: (chrom: string, start: number, end: number) => void;
}

export function useRegionProvider(): UseRegionProviderResult {
  const [references, setReferences] = useState<ReferenceInfo[]>([]);
  const [regionState, setRegionState] = useState<RegionState>({
    rows: [],
    loading: false,
    error: null,
    hasMore: false,
    query: null,
  });
  const requestIdRef = useRef(0);

  // Request references on mount
  useEffect(() => {
    vscode.postMessage({ command: 'requestReferences' });
  }, []);

  // Listen for region data and references messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageFromExtension>) => {
      const message = event.data;

      if (message.command === 'regionData') {
        setRegionState((prev) => {
          // Only accept responses matching our latest request
          if (prev.query &&
              message.chrom === prev.query.chrom &&
              message.start === prev.query.start &&
              message.end === prev.query.end) {
            return {
              rows: message.rows,
              loading: false,
              error: message.error || null,
              hasMore: message.hasMore,
              query: prev.query,
            };
          }
          return prev;
        });
      } else if (message.command === 'references') {
        setReferences(message.refs);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const requestRegion = useCallback((chrom: string, start: number, end: number) => {
    const requestId = `region-${++requestIdRef.current}`;
    const query: RegionQuery = { chrom, start, end };

    setRegionState({
      rows: [],
      loading: true,
      error: null,
      hasMore: false,
      query,
    });

    vscode.postMessage({
      command: 'requestRegion',
      chrom,
      start,
      end,
      requestId,
    });
  }, []);

  return { regionState, references, requestRegion };
}
