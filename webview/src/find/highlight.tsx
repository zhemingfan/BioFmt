// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';

/**
 * Split `text` on occurrences of `query` and wrap each match in a
 * `<mark className="find-match">`. Returns the original string unchanged when
 * there is no query or no match, so non-matching cells stay cheap plain text.
 */
export function highlightMatches(
  text: string,
  query: string,
  caseSensitive: boolean
): React.ReactNode {
  if (!query) return text;
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!hay.includes(needle)) return text;

  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = hay.indexOf(needle, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="find-match">
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    i = idx + needle.length;
  }
  return parts;
}
