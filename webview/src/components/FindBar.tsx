// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import type { TableFind } from '../find/useTableFind';

/**
 * Presentational find bar driven by a `useTableFind` instance. Rendered only
 * while find is open. Enter / Shift+Enter navigate; Esc closes.
 */
export function FindBar<T>({ find }: { find: TableFind<T> }) {
  if (!find.isOpen) return null;

  const { query, matchCount, activeOrdinal, caseSensitive, filterToMatches } = find;
  const countLabel = query
    ? matchCount > 0
      ? `${activeOrdinal} / ${matchCount}`
      : 'No results'
    : '';

  return (
    <div className="find-bar">
      <input
        ref={find.inputRef}
        className="find-input"
        type="text"
        placeholder="Find in preview…"
        aria-label="Find in preview"
        value={query}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) find.prev();
            else find.next();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            find.close();
          }
        }}
      />
      <span className={`find-count${query && matchCount === 0 ? ' find-count-empty' : ''}`}>
        {countLabel}
      </span>
      <button
        type="button"
        className={`find-toggle${caseSensitive ? ' active' : ''}`}
        title="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        onClick={find.toggleCase}
      >
        Aa
      </button>
      <button
        type="button"
        className={`find-toggle${filterToMatches ? ' active' : ''}`}
        title="Filter to matching rows"
        aria-label="Filter to matching rows"
        aria-pressed={filterToMatches}
        onClick={find.toggleFilter}
      >
        ≡
      </button>
      <button
        type="button"
        className="find-nav"
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled={matchCount === 0}
        onClick={find.prev}
      >
        ‹
      </button>
      <button
        type="button"
        className="find-nav"
        title="Next match (Enter)"
        aria-label="Next match"
        disabled={matchCount === 0}
        onClick={find.next}
      >
        ›
      </button>
      <button
        type="button"
        className="find-close"
        title="Close (Esc)"
        aria-label="Close find"
        onClick={find.close}
      >
        ✕
      </button>
    </div>
  );
}
