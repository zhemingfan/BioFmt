// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';

/**
 * VCF Preview Feature Tests
 *
 * Tests the pure logic functions for the three new VCF preview features:
 *   1. Sort by CHROM / POS
 *   2. Global full-text search (across raw line)
 *   3. VCF export (header reconstruction + filtered rows)
 *
 * Also covers the NaN-POS guard added to parseVcfLine.
 *
 * Functions are re-implemented inline because the webview bundle uses ESNext
 * modules that Mocha/ts-node cannot import directly.
 */

// ---------------------------------------------------------------------------
// Shared types (mirrors webview/src/types.ts)
// ---------------------------------------------------------------------------

interface ParsedVcfRow {
  lineNumber: number;
  chrom: string;
  pos: number;
  id: string;
  ref: string;
  alt: string;
  qual: number | null;
  filter: string;
  info: Record<string, string | boolean>;
  format?: string;
  samples?: Record<string, Record<string, string>>;
  raw: string;
}

interface FilterConfig {
  chrom?: string;
  id?: string;
  filter?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Re-implementations of the logic under test (mirrors VcfPreview.tsx)
// ---------------------------------------------------------------------------

function parseVcfLine(line: string, lineNumber = 0): ParsedVcfRow | null {
  const columns = line.split('\t');
  if (columns.length < 8) return null;

  const pos = parseInt(columns[1], 10);
  if (isNaN(pos)) return null;

  const info: Record<string, string | boolean> = {};
  if (columns[7] !== '.') {
    for (const pair of columns[7].split(';')) {
      if (pair.includes('=')) {
        const [key, val] = pair.split('=', 2);
        info[key] = val;
      } else if (pair) {
        info[pair] = true;
      }
    }
  }

  return {
    lineNumber,
    chrom: columns[0],
    pos,
    id: columns[2],
    ref: columns[3],
    alt: columns[4],
    qual: columns[5] === '.' ? null : parseFloat(columns[5]),
    filter: columns[6],
    info,
    format: columns[8],
    raw: line,
  };
}

function filterRows(rows: ParsedVcfRow[], filter: FilterConfig): ParsedVcfRow[] {
  if (!filter.chrom && !filter.id && !filter.filter && !filter.search) {
    return rows;
  }
  const idQuery = filter.id?.toLowerCase();
  const searchQuery = filter.search?.toLowerCase();
  return rows.filter((row) => {
    if (filter.chrom && row.chrom !== filter.chrom) return false;
    if (filter.filter && row.filter !== filter.filter) return false;
    if (idQuery && !row.id.toLowerCase().includes(idQuery)) return false;
    if (searchQuery && !row.raw.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}

function sortRows(
  rows: ParsedVcfRow[],
  col: 'chrom' | 'pos' | null,
  dir: 'asc' | 'desc'
): ParsedVcfRow[] {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (col === 'pos') {
      cmp = a.pos - b.pos;
    } else {
      const aNum = parseInt(a.chrom.replace(/\D/g, ''), 10);
      const bNum = parseInt(b.chrom.replace(/\D/g, ''), 10);
      cmp = (!isNaN(aNum) && !isNaN(bNum))
        ? aNum - bNum
        : a.chrom.localeCompare(b.chrom);
      if (cmp === 0) cmp = a.pos - b.pos;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function buildVcfExport(headerLines: string[], dataRows: ParsedVcfRow[]): string {
  const headerBlock = headerLines.join('\n');
  const dataBlock = dataRows.map((r) => r.raw).join('\n');
  return headerBlock + (headerBlock && dataBlock ? '\n' : '') + dataBlock;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(
  chrom: string,
  pos: number,
  id = '.',
  filter = 'PASS',
  info = 'DP=20',
  lineNumber = 0
): ParsedVcfRow {
  const raw = [chrom, String(pos), id, 'A', 'T', '60', filter, info].join('\t');
  return {
    lineNumber,
    chrom,
    pos,
    id,
    ref: 'A',
    alt: 'T',
    qual: 60,
    filter,
    info: { DP: '20' },
    raw,
  };
}

// ---------------------------------------------------------------------------
// 1. parseVcfLine (NaN-POS guard)
// ---------------------------------------------------------------------------

describe('parseVcfLine', () => {
  it('parses a well-formed VCF line', () => {
    const line = 'chr1\t100\trs1\tA\tT\t60\tPASS\tDP=20\tGT\t0/1';
    const row = parseVcfLine(line);
    assert.ok(row !== null);
    assert.strictEqual(row.chrom, 'chr1');
    assert.strictEqual(row.pos, 100);
    assert.strictEqual(row.id, 'rs1');
    assert.strictEqual(row.qual, 60);
    assert.strictEqual(row.filter, 'PASS');
    assert.strictEqual(row.info['DP'], '20');
    assert.strictEqual(row.raw, line);
  });

  it('returns null for lines with fewer than 8 columns', () => {
    assert.strictEqual(parseVcfLine('chr1\t100\trs1\tA\tT\t60\tPASS'), null);
    assert.strictEqual(parseVcfLine('chr1\t100'), null);
    assert.strictEqual(parseVcfLine(''), null);
  });

  it('returns null when POS is not a valid integer', () => {
    const badPos = 'chr1\t.\trs1\tA\tT\t60\tPASS\tDP=20';
    assert.strictEqual(parseVcfLine(badPos), null);

    const nanPos = 'chr1\tNA\trs1\tA\tT\t60\tPASS\tDP=20';
    assert.strictEqual(parseVcfLine(nanPos), null);

    const floatPos = 'chr1\t1.5\trs1\tA\tT\t60\tPASS\tDP=20';
    // parseInt('1.5') === 1, so this IS valid
    const row = parseVcfLine(floatPos);
    assert.ok(row !== null);
    assert.strictEqual(row.pos, 1);
  });

  it('parses flag INFO fields (no value)', () => {
    const line = 'chr1\t100\t.\tA\tT\t.\tPASS\tSOMATIC;DP=30';
    const row = parseVcfLine(line);
    assert.ok(row !== null);
    assert.strictEqual(row.info['SOMATIC'], true);
    assert.strictEqual(row.info['DP'], '30');
  });

  it('handles QUAL of "." as null', () => {
    const line = 'chr1\t100\t.\tA\tT\t.\tPASS\t.';
    const row = parseVcfLine(line);
    assert.ok(row !== null);
    assert.strictEqual(row.qual, null);
  });

  it('assigns the lineNumber parameter', () => {
    const line = 'chr1\t100\t.\tA\tT\t.\tPASS\t.';
    const row = parseVcfLine(line, 42);
    assert.ok(row !== null);
    assert.strictEqual(row.lineNumber, 42);
  });
});

// ---------------------------------------------------------------------------
// 2. Filter (CHROM, ID, FILTER, and global search)
// ---------------------------------------------------------------------------

describe('filterRows', () => {
  const rows: ParsedVcfRow[] = [
    makeRow('chr1', 100, 'rs1',    'PASS', 'DP=50;AF=0.3'),
    makeRow('chr1', 200, 'rs2',    'LowQ', 'DP=10;AF=0.1'),
    makeRow('chr2', 300, 'rs3',    'PASS', 'DP=80;AF=0.9'),
    makeRow('chr10', 50, '.',      'PASS', 'DP=20'),
    makeRow('chrX', 400, 'rsX',   'PASS', 'DP=60;SOMATIC'),
  ];

  it('returns all rows when filter is empty', () => {
    assert.strictEqual(filterRows(rows, {}).length, rows.length);
  });

  describe('CHROM filter', () => {
    it('filters to a single chromosome', () => {
      const result = filterRows(rows, { chrom: 'chr1' });
      assert.strictEqual(result.length, 2);
      assert.ok(result.every((r) => r.chrom === 'chr1'));
    });

    it('returns empty when chromosome not present', () => {
      assert.strictEqual(filterRows(rows, { chrom: 'chr3' }).length, 0);
    });

    it('matches exact chromosome string (chr1 ≠ chr10)', () => {
      const result = filterRows(rows, { chrom: 'chr1' });
      assert.ok(result.every((r) => r.chrom === 'chr1'));
      assert.strictEqual(result.find((r) => r.chrom === 'chr10'), undefined);
    });
  });

  describe('FILTER filter', () => {
    it('filters to PASS rows only', () => {
      const result = filterRows(rows, { filter: 'PASS' });
      assert.strictEqual(result.length, 4);
      assert.ok(result.every((r) => r.filter === 'PASS'));
    });

    it('filters to non-PASS rows', () => {
      const result = filterRows(rows, { filter: 'LowQ' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs2');
    });
  });

  describe('ID filter', () => {
    it('matches exact ID', () => {
      const result = filterRows(rows, { id: 'rs1' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs1');
    });

    it('matches partial ID substring', () => {
      const result = filterRows(rows, { id: 'rs' });
      assert.strictEqual(result.length, 4); // rs1, rs2, rs3, rsX
    });

    it('is case-insensitive', () => {
      const result = filterRows(rows, { id: 'RS1' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs1');
    });

    it('returns empty for no match', () => {
      assert.strictEqual(filterRows(rows, { id: 'rs999' }).length, 0);
    });

    it('treats "." as a searchable ID value', () => {
      // row with id='.' should match search for '.'
      const result = filterRows(rows, { id: '.' });
      assert.ok(result.length > 0);
    });
  });

  describe('Global search', () => {
    it('matches INFO field values', () => {
      // Only chr1:100 and chrX:400 have AF= in INFO... let's check AF=0.9
      const result = filterRows(rows, { search: 'AF=0.9' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].chrom, 'chr2');
    });

    it('matches INFO flag fields', () => {
      const result = filterRows(rows, { search: 'SOMATIC' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].chrom, 'chrX');
    });

    it('matches chromosome name', () => {
      const result = filterRows(rows, { search: 'chrX' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].chrom, 'chrX');
    });

    it('is case-insensitive', () => {
      const result = filterRows(rows, { search: 'somatic' });
      assert.strictEqual(result.length, 1);
    });

    it('returns empty when no row matches', () => {
      assert.strictEqual(filterRows(rows, { search: 'NOPE_XYZ' }).length, 0);
    });

    it('matches DP values across multiple rows', () => {
      const result = filterRows(rows, { search: 'DP=50' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs1');
    });
  });

  describe('Combined filters', () => {
    it('applies CHROM and FILTER together', () => {
      const result = filterRows(rows, { chrom: 'chr1', filter: 'PASS' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs1');
    });

    it('applies CHROM and search together', () => {
      const result = filterRows(rows, { chrom: 'chr1', search: 'DP=10' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 'rs2');
    });

    it('returns empty when filters are contradictory', () => {
      const result = filterRows(rows, { chrom: 'chr2', filter: 'LowQ' });
      assert.strictEqual(result.length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Sort by CHROM / POS
// ---------------------------------------------------------------------------

describe('sortRows', () => {
  const rows: ParsedVcfRow[] = [
    makeRow('chr10', 50,  'r3', 'PASS', '.', 2),
    makeRow('chr2',  200, 'r2', 'PASS', '.', 1),
    makeRow('chr1',  100, 'r1', 'PASS', '.', 0),
    makeRow('chrX',  400, 'rX', 'PASS', '.', 3),
    makeRow('chrY',  300, 'rY', 'PASS', '.', 4),
  ];

  it('returns original order when col is null', () => {
    const result = sortRows(rows, null, 'asc');
    assert.deepStrictEqual(result.map((r) => r.lineNumber), [2, 1, 0, 3, 4]);
  });

  describe('Sort by CHROM', () => {
    it('sorts numerically ascending: chr1 < chr2 < chr10', () => {
      const result = sortRows(rows, 'chrom', 'asc');
      const chroms = result.map((r) => r.chrom);
      assert.strictEqual(chroms[0], 'chr1');
      assert.strictEqual(chroms[1], 'chr2');
      assert.strictEqual(chroms[2], 'chr10');
    });

    it('sorts descending: chr10 > chr2 > chr1', () => {
      const result = sortRows(rows, 'chrom', 'desc');
      const numeric = result.filter((r) => /^chr\d+$/.test(r.chrom));
      assert.strictEqual(numeric[0].chrom, 'chr10');
    });

    it('does not mutate the original array', () => {
      const original = [...rows];
      sortRows(rows, 'chrom', 'asc');
      assert.deepStrictEqual(rows.map((r) => r.lineNumber), original.map((r) => r.lineNumber));
    });

    it('uses POS as tiebreaker when CHROM is equal', () => {
      const tied: ParsedVcfRow[] = [
        makeRow('chr1', 300, 'rC', 'PASS', '.', 2),
        makeRow('chr1', 100, 'rA', 'PASS', '.', 0),
        makeRow('chr1', 200, 'rB', 'PASS', '.', 1),
      ];
      const result = sortRows(tied, 'chrom', 'asc');
      assert.strictEqual(result[0].pos, 100);
      assert.strictEqual(result[1].pos, 200);
      assert.strictEqual(result[2].pos, 300);
    });
  });

  describe('Sort by POS', () => {
    const posRows: ParsedVcfRow[] = [
      makeRow('chr1', 500, 'rC', 'PASS', '.', 2),
      makeRow('chr1', 100, 'rA', 'PASS', '.', 0),
      makeRow('chr1', 300, 'rB', 'PASS', '.', 1),
    ];

    it('sorts ascending by position', () => {
      const result = sortRows(posRows, 'pos', 'asc');
      assert.strictEqual(result[0].pos, 100);
      assert.strictEqual(result[1].pos, 300);
      assert.strictEqual(result[2].pos, 500);
    });

    it('sorts descending by position', () => {
      const result = sortRows(posRows, 'pos', 'desc');
      assert.strictEqual(result[0].pos, 500);
      assert.strictEqual(result[1].pos, 300);
      assert.strictEqual(result[2].pos, 100);
    });

    it('handles already-sorted input', () => {
      const sorted = sortRows(posRows, 'pos', 'asc');
      const again = sortRows(sorted, 'pos', 'asc');
      assert.deepStrictEqual(again.map((r) => r.pos), [100, 300, 500]);
    });
  });

  it('handles empty array', () => {
    assert.deepStrictEqual(sortRows([], 'chrom', 'asc'), []);
    assert.deepStrictEqual(sortRows([], 'pos', 'desc'), []);
  });

  it('handles single row', () => {
    const single = [makeRow('chr1', 100)];
    assert.strictEqual(sortRows(single, 'chrom', 'asc').length, 1);
    assert.strictEqual(sortRows(single, 'pos', 'desc').length, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. VCF Export
// ---------------------------------------------------------------------------

describe('buildVcfExport', () => {
  const HEADER_LINES = [
    '##fileformat=VCFv4.2',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  ];

  const rows: ParsedVcfRow[] = [
    makeRow('chr1', 100, 'rs1', 'PASS', 'DP=50'),
    makeRow('chr2', 200, 'rs2', 'PASS', 'DP=80'),
  ];

  it('produces a string starting with the header block', () => {
    const output = buildVcfExport(HEADER_LINES, rows);
    assert.ok(output.startsWith('##fileformat=VCFv4.2'));
  });

  it('includes all header lines separated by newlines', () => {
    const output = buildVcfExport(HEADER_LINES, rows);
    assert.ok(output.includes('##INFO=<ID=DP'));
    assert.ok(output.includes('#CHROM\tPOS'));
  });

  it('includes all data row raw strings', () => {
    const output = buildVcfExport(HEADER_LINES, rows);
    assert.ok(output.includes(rows[0].raw));
    assert.ok(output.includes(rows[1].raw));
  });

  it('header and data are separated by exactly one newline', () => {
    const output = buildVcfExport(HEADER_LINES, rows);
    const lastHeaderLine = HEADER_LINES[HEADER_LINES.length - 1];
    const firstDataLine = rows[0].raw;
    assert.ok(output.includes(lastHeaderLine + '\n' + firstDataLine));
  });

  it('data rows are separated by newlines', () => {
    const output = buildVcfExport(HEADER_LINES, rows);
    assert.ok(output.includes(rows[0].raw + '\n' + rows[1].raw));
  });

  it('handles empty header lines gracefully', () => {
    const output = buildVcfExport([], rows);
    assert.ok(output.startsWith(rows[0].raw));
    assert.ok(output.includes(rows[1].raw));
  });

  it('handles empty data rows gracefully', () => {
    const output = buildVcfExport(HEADER_LINES, []);
    assert.ok(output.startsWith('##fileformat=VCFv4.2'));
    // No trailing newline from data
    assert.ok(output.endsWith(HEADER_LINES[HEADER_LINES.length - 1]));
  });

  it('handles both empty header and empty data', () => {
    const output = buildVcfExport([], []);
    assert.strictEqual(output, '');
  });

  it('preserves raw line content exactly (no re-formatting)', () => {
    const rawLine = 'chr1\t999\trs_test\tG\tA\t99\tPASS\tDP=100;AF=0.5\tGT:DP\t0/1:100';
    const specialRow: ParsedVcfRow = {
      lineNumber: 0, chrom: 'chr1', pos: 999, id: 'rs_test',
      ref: 'G', alt: 'A', qual: 99, filter: 'PASS',
      info: { DP: '100', AF: '0.5' }, format: 'GT:DP', raw: rawLine,
    };
    const output = buildVcfExport(HEADER_LINES, [specialRow]);
    assert.ok(output.includes(rawLine));
  });

  it('exports only the filtered subset when given a subset of rows', () => {
    const subset = [rows[0]];
    const output = buildVcfExport(HEADER_LINES, subset);
    assert.ok(output.includes(rows[0].raw));
    assert.ok(!output.includes(rows[1].raw));
  });
});
