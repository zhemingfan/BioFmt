// SPDX-License-Identifier: GPL-3.0-or-later

import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { PreviewDiagnostic, PreviewDiagnosticSeverity } from '../../../src/shared/diagnostics';
import { worstSeverity } from '../../../src/shared/diagnostics';

type ScrollFn = (line: number) => void;

export interface DiagnosticCounts {
  error: number;
  warning: number;
  info: number;
  hint: number;
}

export interface DiagnosticsContextValue {
  /** Diagnostics grouped by their 0-based start line. */
  byLine: Map<number, PreviewDiagnostic[]>;
  /** Sorted list of lines that carry at least one diagnostic. */
  markerLines: number[];
  counts: DiagnosticCounts;
  hasDiagnostics: boolean;
  forLine: (line: number) => PreviewDiagnostic[] | undefined;
  worstFor: (line: number) => PreviewDiagnosticSeverity | undefined;
  /** Ask the extension to reveal (and select) a line in the text editor. */
  revealLine: (line: number) => void;
  /** A preview registers how to scroll its virtual list to a given line. */
  registerScroller: (fn: ScrollFn | null) => void;
  /** Scroll the active preview to a line, if a scroller is registered. */
  scrollToLine: (line: number) => void;
}

const EMPTY_COUNTS: DiagnosticCounts = { error: 0, warning: 0, info: 0, hint: 0 };

const noop = () => {};

const defaultValue: DiagnosticsContextValue = {
  byLine: new Map(),
  markerLines: [],
  counts: EMPTY_COUNTS,
  hasDiagnostics: false,
  forLine: () => undefined,
  worstFor: () => undefined,
  revealLine: noop,
  registerScroller: noop,
  scrollToLine: noop,
};

const DiagnosticsContext = createContext<DiagnosticsContextValue>(defaultValue);

export function useDiagnostics(): DiagnosticsContextValue {
  return useContext(DiagnosticsContext);
}

export interface DiagnosticsProviderProps {
  diagnostics: PreviewDiagnostic[];
  onRevealLine: (line: number) => void;
  children: React.ReactNode;
}

export function DiagnosticsProvider({
  diagnostics,
  onRevealLine,
  children,
}: DiagnosticsProviderProps) {
  const scrollerRef = useRef<ScrollFn | null>(null);

  const byLine = useMemo(() => {
    const map = new Map<number, PreviewDiagnostic[]>();
    for (const d of diagnostics) {
      const existing = map.get(d.line);
      if (existing) existing.push(d);
      else map.set(d.line, [d]);
    }
    return map;
  }, [diagnostics]);

  const markerLines = useMemo(
    () => Array.from(byLine.keys()).sort((a, b) => a - b),
    [byLine]
  );

  const counts = useMemo(() => {
    const c: DiagnosticCounts = { error: 0, warning: 0, info: 0, hint: 0 };
    for (const d of diagnostics) c[d.severity]++;
    return c;
  }, [diagnostics]);

  const forLine = useCallback((line: number) => byLine.get(line), [byLine]);
  const worstFor = useCallback(
    (line: number) => {
      const diags = byLine.get(line);
      return diags ? worstSeverity(diags) : undefined;
    },
    [byLine]
  );

  const registerScroller = useCallback((fn: ScrollFn | null) => {
    scrollerRef.current = fn;
  }, []);
  const scrollToLine = useCallback((line: number) => {
    scrollerRef.current?.(line);
  }, []);

  const value = useMemo<DiagnosticsContextValue>(
    () => ({
      byLine,
      markerLines,
      counts,
      hasDiagnostics: diagnostics.length > 0,
      forLine,
      worstFor,
      revealLine: onRevealLine,
      registerScroller,
      scrollToLine,
    }),
    [byLine, markerLines, counts, diagnostics.length, forLine, worstFor, onRevealLine, registerScroller, scrollToLine]
  );

  return <DiagnosticsContext.Provider value={value}>{children}</DiagnosticsContext.Provider>;
}
