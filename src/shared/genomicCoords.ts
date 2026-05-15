// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared genomic coordinate parser. Returns 0-based half-open coordinates
 * regardless of the source format's native convention. No VS Code or Node
 * dependencies -- usable from the node extension, the browser extension,
 * and mocha tests alike.
 */

export interface GenomicCoords {
  chrom: string;
  start: number;
  end: number;
}

export function parseGenomicCoords(line: string, languageId: string): GenomicCoords | null {
  if (!line || !line.trim()) return null;
  if (line.startsWith('#')) return null;

  switch (languageId) {
    case 'omics-vcf': {
      const cols = line.split('\t');
      if (cols.length < 8) return null;
      const pos = parseInt(cols[1], 10);
      if (isNaN(pos)) return null;
      const ref = cols[3];
      const refLen = ref && ref !== '.' ? ref.length : 1;
      return { chrom: cols[0], start: pos - 1, end: pos - 1 + refLen };
    }

    case 'omics-bed':
    case 'omics-bedpe':
    case 'omics-narrowpeak':
    case 'omics-broadpeak': {
      if (line.startsWith('track') || line.startsWith('browser')) return null;
      const cols = line.split('\t');
      if (cols.length < 3) return null;
      const start = parseInt(cols[1], 10);
      const end = parseInt(cols[2], 10);
      if (isNaN(start) || isNaN(end)) return null;
      return { chrom: cols[0], start, end };
    }

    case 'omics-gff3':
    case 'omics-gtf': {
      const cols = line.split('\t');
      if (cols.length < 9) return null;
      const start = parseInt(cols[3], 10);
      const end = parseInt(cols[4], 10);
      if (isNaN(start) || isNaN(end)) return null;
      return { chrom: cols[0], start: start - 1, end };
    }

    case 'omics-sam': {
      if (line.startsWith('@')) return null;
      const cols = line.split('\t');
      if (cols.length < 11) return null;
      const pos = parseInt(cols[3], 10);
      if (isNaN(pos) || pos === 0) return null;
      const cigar = cols[5];
      const refLen = cigar && cigar !== '*' ? cigarRefLength(cigar) : 1;
      return { chrom: cols[2], start: pos - 1, end: pos - 1 + refLen };
    }

    case 'omics-paf': {
      const cols = line.split('\t');
      if (cols.length < 12) return null;
      const start = parseInt(cols[7], 10);
      const end = parseInt(cols[8], 10);
      if (isNaN(start) || isNaN(end)) return null;
      return { chrom: cols[5], start, end };
    }

    default:
      return null;
  }
}

export function parseFastaContigName(line: string): string | null {
  if (!line || !line.startsWith('>')) return null;
  const spaceIdx = line.indexOf(' ', 1);
  const name = spaceIdx > 0 ? line.substring(1, spaceIdx) : line.substring(1);
  return name.trim() || null;
}

export function cigarRefLength(cigar: string): number {
  if (!cigar || cigar === '*') return 1;
  let len = 0;
  for (const m of cigar.matchAll(/(\d+)([MIDNSHP=X])/g)) {
    if ('MDN=X'.includes(m[2])) len += parseInt(m[1], 10);
  }
  return len || 1;
}
