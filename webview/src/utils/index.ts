// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sort chromosome names naturally (chr1, chr2, ..., chr10, chr11, chrX, chrY)
 */
export function sortChromosomes(chroms: Iterable<string>): string[] {
  return Array.from(chroms).sort((a, b) => {
    const aNum = parseInt(a.replace(/\D/g, ''), 10);
    const bNum = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
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
