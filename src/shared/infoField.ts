// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Parse a VCF INFO-style `key=value;flag;...` string into an object.
 * Valueless entries become boolean `true` flags. Empty segments are skipped.
 */
export function parseInfoField(value: string): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  const pairs = value.split(';');

  for (const pair of pairs) {
    if (pair.includes('=')) {
      const [key, val] = pair.split('=', 2);
      result[key] = val;
    } else if (pair) {
      result[pair] = true;
    }
  }

  return result;
}
