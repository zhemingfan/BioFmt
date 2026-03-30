// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Compare two chromosome names with natural ordering.
 * Standard chromosomes (1-22, X, Y, M/MT) sort first in canonical order,
 * everything else (scaffolds, alts, Un contigs) sorts after by locale.
 */
export function compareChromosomes(a: string, b: string): number {
  const ka = chromSortKey(a);
  const kb = chromSortKey(b);
  if (ka.rank !== kb.rank) return ka.rank - kb.rank;
  return ka.suffix.localeCompare(kb.suffix);
}

function chromSortKey(name: string): { rank: number; suffix: string } {
  const raw = name.startsWith('chr') ? name.slice(3) : name;
  const numMatch = raw.match(/^(\d+)(.*)/);
  if (numMatch) return { rank: parseInt(numMatch[1], 10), suffix: numMatch[2] };
  const upper = raw.toUpperCase();
  if (upper === 'X') return { rank: 100, suffix: '' };
  if (upper === 'Y') return { rank: 101, suffix: '' };
  if (upper === 'M' || upper === 'MT') return { rank: 102, suffix: '' };
  // Everything else sorts after standard chroms
  return { rank: 1000, suffix: raw };
}

/**
 * Sort chromosome names naturally (chr1, chr2, ..., chr22, chrX, chrY, chrM, then others)
 */
export function sortChromosomes(chroms: Iterable<string>): string[] {
  return Array.from(chroms).sort(compareChromosomes);
}

/**
 * Parse SAM/PAF-style tags (KEY:TYPE:VALUE format)
 */
export function parseTags(tagFields: string[]): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const field of tagFields) {
    const parts = field.split(':');
    if (parts.length >= 3) {
      const key = parts[0];
      const value = parts.slice(2).join(':');
      tags[key] = value;
    }
  }
  return tags;
}
