// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from 'react';

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_BUFFER = 50;
const DEFAULT_PREFETCH = 100;

interface UseScrollHandlerOptions {
  loadedLineCount: number;
  totalLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
  isLineLoaded?: (line: number) => boolean;
  rowHeight?: number;
  buffer?: number;
  prefetch?: number;
}

/**
 * Shared hook for handling scroll-based row loading in preview components.
 * Calculates visible rows and requests more data when approaching the end.
 */
export function useScrollHandler({
  loadedLineCount,
  totalLineCount,
  onRequestRows,
  isLineLoaded,
  rowHeight = DEFAULT_ROW_HEIGHT,
  buffer = DEFAULT_BUFFER,
  prefetch = DEFAULT_PREFETCH,
}: UseScrollHandlerOptions) {
  return useCallback(
    ({ scrollOffset }: { scrollOffset: number }) => {
      if (loadedLineCount >= totalLineCount) {
        return;
      }

      const visibleStart = Math.floor(scrollOffset / rowHeight);
      const viewportRows = Math.ceil(window.innerHeight / rowHeight);
      const visibleEnd = visibleStart + viewportRows + buffer;

      if (isLineLoaded) {
        const cappedEnd = Math.min(visibleEnd, totalLineCount);
        let missingStart = -1;
        for (let i = visibleStart; i < cappedEnd; i++) {
          if (!isLineLoaded(i)) {
            missingStart = i;
            break;
          }
        }
        if (missingStart !== -1) {
          const requestStart = Math.max(0, missingStart - buffer);
          const requestEnd = Math.min(totalLineCount, missingStart + prefetch);
          onRequestRows(requestStart, requestEnd);
        }
      } else if (visibleEnd > loadedLineCount) {
        const requestEnd = Math.min(totalLineCount, visibleEnd + prefetch);
        onRequestRows(loadedLineCount, requestEnd);
      }
    },
    [loadedLineCount, totalLineCount, onRequestRows, isLineLoaded, rowHeight, buffer, prefetch]
  );
}
