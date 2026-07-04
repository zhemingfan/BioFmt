// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { highlightMatches } from './highlight';

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface TableFind<T> {
  isOpen: boolean;
  open(): void;
  close(): void;
  query: string;
  setQuery(q: string): void;
  caseSensitive: boolean;
  toggleCase(): void;
  filterToMatches: boolean;
  toggleFilter(): void;
  /** Number of matching rows. */
  matchCount: number;
  /** 1-based position of the active match (0 when there are none). */
  activeOrdinal: number;
  next(): void;
  prev(): void;
  /** Rows to render — filtered to matches only when `filterToMatches` is on. */
  displayRows: T[];
  /** The currently active matching row, for row-level emphasis. */
  activeRow: T | undefined;
  /** Index into `displayRows` to scroll to; changes with `scrollTick`. */
  scrollIndex: number;
  /** Increments on every next()/prev() so hosts can scroll on demand. */
  scrollTick: number;
  inputRef: React.RefObject<HTMLInputElement>;
  /** Wrap matched substrings of `text` in <mark> for in-cell highlighting. */
  highlight(text: string): React.ReactNode;
}

/**
 * Editor-style find over a virtualized table. Computes matching rows over the
 * (debounced) query, tracks an active match for next/prev navigation, and
 * optionally filters the rendered set to matches. The host supplies a stable
 * `getRowText` (memoize it) describing what text a row searches against, wires
 * the FindBar, applies `highlight()` in its cell renderer, and scrolls its list
 * to `scrollIndex` when `scrollTick` changes.
 */
export function useTableFind<T>(rows: T[], getRowText: (row: T) => string): TableFind<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [filterToMatches, setFilterToMatches] = useState(false);
  const [ordinal, setOrdinal] = useState(0); // 0-based index into matches
  const [scrollTick, setScrollTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounced(query, 120);

  const matches = useMemo(() => {
    if (!debouncedQuery) return [];
    const needle = caseSensitive ? debouncedQuery : debouncedQuery.toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const text = getRowText(rows[i]);
      const hay = caseSensitive ? text : text.toLowerCase();
      if (hay.includes(needle)) out.push(i);
    }
    return out;
  }, [rows, debouncedQuery, caseSensitive, getRowText]);

  // Keep the active ordinal in range as the match set changes.
  useEffect(() => {
    setOrdinal((o) => (matches.length === 0 ? 0 : Math.min(o, matches.length - 1)));
  }, [matches]);

  const open = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQueryState('');
  }, []);
  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setOrdinal(0);
  }, []);
  const toggleCase = useCallback(() => setCaseSensitive((c) => !c), []);
  const toggleFilter = useCallback(() => setFilterToMatches((f) => !f), []);

  const next = useCallback(() => {
    setOrdinal((o) => (matches.length === 0 ? 0 : (o + 1) % matches.length));
    setScrollTick((t) => t + 1);
  }, [matches.length]);
  const prev = useCallback(() => {
    setOrdinal((o) => (matches.length === 0 ? 0 : (o - 1 + matches.length) % matches.length));
    setScrollTick((t) => t + 1);
  }, [matches.length]);

  // Cmd/Ctrl+F opens & focuses, Esc closes, F3/Shift+F3 navigate while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        open();
      } else if (e.key === 'Escape' && isOpen) {
        close();
      } else if (e.key === 'F3' && isOpen) {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, next, prev, isOpen]);

  const displayRows = useMemo(
    () => (filterToMatches && debouncedQuery ? matches.map((i) => rows[i]) : rows),
    [filterToMatches, debouncedQuery, matches, rows]
  );

  const scrollIndex = filterToMatches ? ordinal : matches[ordinal] ?? 0;
  const activeRow = matches.length > 0 ? rows[matches[ordinal]] : undefined;

  const highlight = useCallback(
    (text: string) => highlightMatches(text, debouncedQuery, caseSensitive),
    [debouncedQuery, caseSensitive]
  );

  return {
    isOpen,
    open,
    close,
    query,
    setQuery,
    caseSensitive,
    toggleCase,
    filterToMatches,
    toggleFilter,
    matchCount: matches.length,
    activeOrdinal: matches.length ? ordinal + 1 : 0,
    next,
    prev,
    displayRows,
    activeRow,
    scrollIndex,
    scrollTick,
    inputRef,
    highlight,
  };
}
