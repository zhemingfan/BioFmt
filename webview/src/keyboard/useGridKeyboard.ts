// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useState } from 'react';

export interface GridFocus {
  row: number;
  col: number;
}

export interface UseGridKeyboardOptions {
  rowCount: number;
  colCount: number;
  /** Scroll the virtualized list so `row` is visible. */
  scrollToRow?: (row: number) => void;
  /** Enter on a focused row. */
  onActivate?: (row: number) => void;
  /** Escape handler; return true if it consumed the key (e.g. collapsed a row),
   *  otherwise focus is cleared. */
  onEscape?: () => boolean | void;
  /** Rows moved per PageUp/PageDown. */
  pageSize?: number;
}

export interface GridKeyboard {
  focused: GridFocus | null;
  isFocused(row: number, col: number): boolean;
  isRowFocused(row: number): boolean;
  focus(row: number, col: number): void;
  clear(): void;
  handleKeyDown(e: React.KeyboardEvent): void;
}

/**
 * Keyboard focus/navigation for a virtualized grid. Owns a focused cell and
 * translates arrow / paging / Home-End / Enter / Escape keys into focus moves,
 * scrolling the list to keep the focused row visible. Keys are ignored while an
 * input/textarea/select is focused so it never fights the find box.
 */
export function useGridKeyboard(opts: UseGridKeyboardOptions): GridKeyboard {
  const { rowCount, colCount, scrollToRow, onActivate, onEscape, pageSize = 10 } = opts;
  const [focused, setFocused] = useState<GridFocus | null>(null);

  const clamp = useCallback(
    (row: number, col: number): GridFocus => ({
      row: Math.max(0, Math.min(row, rowCount - 1)),
      col: Math.max(0, Math.min(col, colCount - 1)),
    }),
    [rowCount, colCount]
  );

  // Drop focus if the row set shrank past it (e.g. filter-to-matches).
  useEffect(() => {
    setFocused((f) => (f && f.row >= rowCount ? null : f));
  }, [rowCount]);

  const move = useCallback(
    (nextRow: number, nextCol: number) => {
      if (rowCount === 0) return;
      const f = clamp(nextRow, nextCol);
      setFocused(f);
      scrollToRow?.(f.row);
    },
    [rowCount, clamp, scrollToRow]
  );

  const focus = useCallback(
    (row: number, col: number) => {
      if (rowCount === 0) return;
      setFocused(clamp(row, col));
    },
    [rowCount, clamp]
  );

  const clear = useCallback(() => setFocused(null), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (rowCount === 0) return;

      const cur = focused ?? { row: 0, col: 0 };
      const has = focused !== null;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(has ? cur.row + 1 : 0, cur.col);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(has ? cur.row - 1 : 0, cur.col);
          break;
        case 'ArrowRight':
          e.preventDefault();
          move(cur.row, has ? cur.col + 1 : 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          move(cur.row, has ? cur.col - 1 : 0);
          break;
        case 'Home':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) move(0, cur.col);
          else move(cur.row, 0);
          break;
        case 'End':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) move(rowCount - 1, cur.col);
          else move(cur.row, colCount - 1);
          break;
        case 'PageDown':
          e.preventDefault();
          move((has ? cur.row : 0) + pageSize, cur.col);
          break;
        case 'PageUp':
          e.preventDefault();
          move((has ? cur.row : 0) - pageSize, cur.col);
          break;
        case 'Enter':
          if (has) {
            e.preventDefault();
            onActivate?.(cur.row);
          }
          break;
        case 'Escape': {
          const handled = onEscape?.();
          if (!handled) clear();
          break;
        }
        default:
          break;
      }
    },
    [focused, rowCount, colCount, move, onActivate, onEscape, pageSize, clear]
  );

  const isFocused = useCallback(
    (row: number, col: number) => focused?.row === row && focused?.col === col,
    [focused]
  );
  const isRowFocused = useCallback((row: number) => focused?.row === row, [focused]);

  return { focused, isFocused, isRowFocused, focus, clear, handleKeyDown };
}
