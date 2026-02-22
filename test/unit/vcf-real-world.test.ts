// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { getFixturePath } from '../fixtures.index';

/**
 * Real-world VCF fixture tests
 *
 * Validates header parsing, data-line parsing, and structural correctness
 * for six real VCF files covering different callers and variant types:
 *  - FreeBayes SNP/indel (VCF 4.2)
 *  - Strelka somatic indels (VCF 4.1)
 *  - Strelka somatic SNVs  (VCF 4.1)
 *  - Simulated VCF with long REF/ALT sequences (VCF 4.0)
 *  - DELLY structural variants with symbolic alleles (VCF 4.2)
 *  - Manta somatic SVs with BND alleles (VCF 4.1)
 */

// ---------------------------------------------------------------------------
// Inline parsers (mirrors the production implementations without importing
// bundled extension code, keeping tests self-contained and fast)
// ---------------------------------------------------------------------------

interface HeaderField {
  id: string;
  number: string;
  type: string;
  description: string;
}

interface HeaderFilter {
  id: string;
  description: string;
}

interface ParsedHeader {
  fileformat: string;
  infoFields: Map<string, HeaderField>;
  formatFields: Map<string, HeaderField>;
  filterFields: Map<string, HeaderFilter>;
  samples: string[];
  headerEndLine: number;
}

function parseStructuredField(line: string, prefix: string): Record<string, string> | null {
  const content = line.substring(prefix.length);
  const endIdx = content.lastIndexOf('>');
  if (endIdx === -1) return null;
  const inner = content.substring(0, endIdx);
  const result: Record<string, string> = {};
  let current = '', key = '', inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === '=' && !inQuotes && !key) { key = current; current = ''; }
    else if (c === ',' && !inQuotes) { if (key) { result[key] = current; key = ''; current = ''; } }
    else { current += c; }
  }
  if (key) result[key] = current;
  return result;
}

function parseHeader(text: string): ParsedHeader {
  const h: ParsedHeader = {
    fileformat: '',
    infoFields: new Map(),
    formatFields: new Map(),
    filterFields: new Map(),
    samples: [],
    headerEndLine: 0,
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.startsWith('#')) { h.headerEndLine = i; break; }
    if (line.startsWith('##fileformat=')) {
      h.fileformat = line.slice('##fileformat='.length);
    } else if (line.startsWith('##INFO=<')) {
      const f = parseStructuredField(line, '##INFO=<');
      if (f?.ID) h.infoFields.set(f.ID, { id: f.ID, number: f.Number || '.', type: f.Type || 'String', description: f.Description || '' });
    } else if (line.startsWith('##FORMAT=<')) {
      const f = parseStructuredField(line, '##FORMAT=<');
      if (f?.ID) h.formatFields.set(f.ID, { id: f.ID, number: f.Number || '.', type: f.Type || 'String', description: f.Description || '' });
    } else if (line.startsWith('##FILTER=<')) {
      const f = parseStructuredField(line, '##FILTER=<');
      if (f?.ID) h.filterFields.set(f.ID, { id: f.ID, description: f.Description || '' });
    } else if (line.startsWith('#CHROM')) {
      const cols = line.split('\t');
      h.samples = cols.slice(9);
      h.headerEndLine = i + 1;
    }
  }
  return h;
}

interface DataLine {
  chrom: string;
  pos: number;
  id: string;
  ref: string;
  alt: string;
  qual: number | null;
  filter: string;
  info: Record<string, string | boolean>;
  format?: string;
  raw: string;
}

function parseDataLine(line: string): DataLine | null {
  const cols = line.split('\t');
  if (cols.length < 8) return null;
  const pos = parseInt(cols[1], 10);
  if (isNaN(pos)) return null;
  const info: Record<string, string | boolean> = {};
  if (cols[7] !== '.') {
    for (const pair of cols[7].split(';')) {
      if (pair.includes('=')) { const [k, v] = pair.split('=', 2); info[k] = v; }
      else if (pair) { info[pair] = true; }
    }
  }
  return {
    chrom: cols[0], pos,
    id: cols[2], ref: cols[3], alt: cols[4],
    qual: cols[5] === '.' ? null : parseFloat(cols[5]),
    filter: cols[6],
    info,
    format: cols[8],
    raw: line,
  };
}

function loadFixture(id: string): { header: ParsedHeader; dataLines: DataLine[] } {
  const content = fs.readFileSync(getFixturePath(id), 'utf8');
  const header = parseHeader(content);
  const lines = content.split('\n');
  const dataLines = lines
    .filter(l => l && !l.startsWith('#'))
    .map(l => parseDataLine(l))
    .filter((l): l is DataLine => l !== null);
  return { header, dataLines };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Real-world VCF fixtures', () => {

  // ── FreeBayes ──────────────────────────────────────────────────────────────
  describe('vcf-freebayes: FreeBayes SNP/indel calls (VCF 4.2)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-freebayes'));
    });

    it('detects VCF 4.2 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.2');
    });

    it('parses core INFO fields', () => {
      assert.ok(header.infoFields.has('DP'), 'missing DP INFO');
      assert.ok(header.infoFields.has('AF'), 'missing AF INFO');
      assert.ok(header.infoFields.has('AC'), 'missing AC INFO');
      assert.strictEqual(header.infoFields.get('DP')!.type, 'Integer');
      assert.strictEqual(header.infoFields.get('AF')!.type, 'Float');
    });

    it('parses FORMAT fields including GT and AD', () => {
      assert.ok(header.formatFields.has('GT'), 'missing GT FORMAT');
      assert.ok(header.formatFields.has('GQ'), 'missing GQ FORMAT');
      assert.ok(header.formatFields.has('DP'), 'missing DP FORMAT');
      assert.ok(header.formatFields.has('AD'), 'missing AD FORMAT');
    });

    it('identifies 1 sample', () => {
      assert.strictEqual(header.samples.length, 1);
      assert.strictEqual(header.samples[0], 'unknown');
    });

    it('parses 3 data lines', () => {
      assert.strictEqual(dataLines.length, 3);
    });

    it('first data line has correct structure', () => {
      const row = dataLines[0];
      assert.strictEqual(row.chrom, 'ACH_TDII_5regions');
      assert.strictEqual(row.pos, 505);
      assert.strictEqual(row.ref, 'C');
      assert.strictEqual(row.alt, 'A');
      assert.ok(row.qual !== null && row.qual > 0, 'QUAL should be a positive number');
    });

    it('INFO fields parse key=value pairs correctly', () => {
      const row = dataLines[0];
      assert.strictEqual(row.info['AC'], '1');
      assert.strictEqual(row.info['AN'], '2');
      assert.strictEqual(row.info['AF'], '0.5');
    });

    it('all data lines have CHROM matching contig', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.chrom, 'ACH_TDII_5regions');
      }
    });
  });

  // ── Strelka somatic indels ─────────────────────────────────────────────────
  describe('vcf-somatic-indels: Strelka somatic indels (VCF 4.1)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-somatic-indels'));
    });

    it('detects VCF 4.1 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.1');
    });

    it('has FILTER definitions', () => {
      assert.ok(header.filterFields.has('Repeat'), 'missing Repeat FILTER');
      assert.ok(header.filterFields.has('iHpol'), 'missing iHpol FILTER');
      assert.ok(header.filterFields.has('BCNoise'), 'missing BCNoise FILTER');
    });

    it('identifies NORMAL and TUMOR samples', () => {
      assert.strictEqual(header.samples.length, 2);
      assert.strictEqual(header.samples[0], 'NORMAL');
      assert.strictEqual(header.samples[1], 'TUMOR');
    });

    it('has SOMATIC flag in INFO', () => {
      assert.ok(header.infoFields.has('QSI'), 'missing QSI INFO');
    });

    it('parses 2 PASS data lines', () => {
      assert.strictEqual(dataLines.length, 2);
      for (const row of dataLines) {
        assert.strictEqual(row.filter, 'PASS');
      }
    });

    it('first indel is a deletion on chr20', () => {
      const row = dataLines[0];
      assert.strictEqual(row.chrom, 'chr20');
      assert.ok(row.ref.length !== row.alt.length || row.alt.includes(','), 'expected indel');
    });

    it('INFO contains SOMATIC flag', () => {
      const row = dataLines[0];
      assert.strictEqual(row.info['SOMATIC'], true);
    });

    it('QUAL is missing (dot) for somatic calls', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.qual, null, 'Strelka somatic calls use . for QUAL');
      }
    });
  });

  // ── Strelka somatic SNVs ───────────────────────────────────────────────────
  describe('vcf-somatic-snvs: Strelka somatic SNVs (VCF 4.1)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-somatic-snvs'));
    });

    it('detects VCF 4.1 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.1');
    });

    it('identifies NORMAL and TUMOR samples', () => {
      assert.deepStrictEqual(header.samples, ['NORMAL', 'TUMOR']);
    });

    it('has SNV-specific FORMAT fields', () => {
      assert.ok(header.formatFields.has('DP'), 'missing DP');
      assert.ok(header.formatFields.has('AU'), 'missing AU (A allele counts)');
      assert.ok(header.formatFields.has('CU'), 'missing CU (C allele counts)');
      assert.ok(header.formatFields.has('GU'), 'missing GU (G allele counts)');
      assert.ok(header.formatFields.has('TU'), 'missing TU (T allele counts)');
    });

    it('parses 14 data lines', () => {
      assert.strictEqual(dataLines.length, 14);
    });

    it('all data lines are on chr20 and PASS', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.chrom, 'chr20');
        assert.strictEqual(row.filter, 'PASS');
      }
    });

    it('all data lines have SOMATIC flag in INFO', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.info['SOMATIC'], true, `Expected SOMATIC flag in line at pos ${row.pos}`);
      }
    });

    it('SNV REF and ALT are single bases', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.ref.length, 1, `REF should be 1 base at pos ${row.pos}`);
        assert.strictEqual(row.alt.length, 1, `ALT should be 1 base at pos ${row.pos}`);
      }
    });
  });

  // ── Simulated VCF with long sequences ────────────────────────────────────
  describe('vcf-simulated: Simulated VCF with long REF/ALT (VCF 4.0)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-simulated'));
    });

    it('detects VCF 4.0 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.0');
    });

    it('identifies 1 sample', () => {
      assert.strictEqual(header.samples.length, 1);
      assert.strictEqual(header.samples[0], 'SIM1CHRVS2');
    });

    it('has FORMAT fields including PL and GT', () => {
      assert.ok(header.formatFields.has('PL'), 'missing PL FORMAT');
      assert.ok(header.formatFields.has('GT'), 'missing GT FORMAT');
    });

    it('parses 37 data lines', () => {
      assert.strictEqual(dataLines.length, 37);
    });

    it('all data lines are on chromosome 1', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.chrom, '1');
      }
    });

    it('positions are in ascending order', () => {
      for (let i = 1; i < dataLines.length; i++) {
        assert.ok(dataLines[i].pos >= dataLines[i - 1].pos,
          `Position out of order at index ${i}: ${dataLines[i].pos} < ${dataLines[i-1].pos}`);
      }
    });

    it('contains at least one long-REF indel (REF length > 10)', () => {
      const longRef = dataLines.find(r => r.ref.length > 10);
      assert.ok(longRef, 'expected at least one long-REF deletion');
    });

    it('contains at least one long-ALT insertion (ALT length > 10)', () => {
      const longAlt = dataLines.find(r => r.alt.length > 10 && !r.alt.startsWith('<'));
      assert.ok(longAlt, 'expected at least one long-ALT insertion');
    });
  });

  // ── DELLY structural variants ─────────────────────────────────────────────
  describe('vcf-sv-delly: DELLY structural variants with symbolic alleles (VCF 4.2)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-sv-delly'));
    });

    it('detects VCF 4.2 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.2');
    });

    it('has SV-specific INFO fields', () => {
      assert.ok(header.infoFields.has('SVTYPE'), 'missing SVTYPE');
      assert.ok(header.infoFields.has('END'), 'missing END');
      assert.ok(header.infoFields.has('CIPOS'), 'missing CIPOS');
      assert.ok(header.infoFields.has('CIEND'), 'missing CIEND');
    });

    it('has DELLY FORMAT fields', () => {
      assert.ok(header.formatFields.has('GT'), 'missing GT');
      assert.ok(header.formatFields.has('DR'), 'missing DR (ref read pairs)');
      assert.ok(header.formatFields.has('DV'), 'missing DV (variant read pairs)');
      assert.ok(header.formatFields.has('GQ'), 'missing GQ');
    });

    it('has PASS and LowQual FILTER definitions', () => {
      assert.ok(header.filterFields.has('PASS'), 'missing PASS FILTER');
      assert.ok(header.filterFields.has('LowQual'), 'missing LowQual FILTER');
    });

    it('identifies NORMAL and TUMOR samples', () => {
      assert.deepStrictEqual(header.samples, ['NORMAL', 'TUMOR']);
    });

    it('parses 8 data lines', () => {
      assert.strictEqual(dataLines.length, 8);
    });

    it('all ALT alleles are symbolic SV types', () => {
      const validSvTypes = ['<DEL>', '<DUP>', '<INV>', '<BND>', '<INS>'];
      for (const row of dataLines) {
        assert.ok(
          validSvTypes.includes(row.alt),
          `Expected symbolic ALT, got "${row.alt}" at pos ${row.pos}`
        );
      }
    });

    it('symbolic ALT alleles start with < and end with >', () => {
      for (const row of dataLines) {
        assert.ok(row.alt.startsWith('<'), `ALT "${row.alt}" should start with <`);
        assert.ok(row.alt.endsWith('>'), `ALT "${row.alt}" should end with >`);
      }
    });

    it('INFO contains SVTYPE for every data line', () => {
      for (const row of dataLines) {
        assert.ok(row.info['SVTYPE'], `Expected SVTYPE in INFO at pos ${row.pos}`);
      }
    });

    it('all PASS lines have QUAL > 0', () => {
      for (const row of dataLines) {
        if (row.filter === 'PASS') {
          assert.ok(row.qual !== null && row.qual > 0,
            `PASS line at pos ${row.pos} should have positive QUAL`);
        }
      }
    });
  });

  // ── Manta somatic SVs ─────────────────────────────────────────────────────
  describe('vcf-somatic-sv: Manta somatic SVs with BND alleles (VCF 4.1)', () => {
    let header: ParsedHeader;
    let dataLines: DataLine[];

    before(() => {
      ({ header, dataLines } = loadFixture('vcf-somatic-sv'));
    });

    it('detects VCF 4.1 fileformat', () => {
      assert.strictEqual(header.fileformat, 'VCFv4.1');
    });

    it('has Manta-specific INFO fields', () => {
      assert.ok(header.infoFields.has('SVTYPE'), 'missing SVTYPE');
      assert.ok(header.infoFields.has('MATEID'), 'missing MATEID (BND mate)');
      assert.ok(header.infoFields.has('SOMATIC'), 'missing SOMATIC flag');
      assert.ok(header.infoFields.has('SOMATICSCORE'), 'missing SOMATICSCORE');
    });

    it('has PR and SR FORMAT fields', () => {
      assert.ok(header.formatFields.has('PR'), 'missing PR (paired-read support)');
      assert.ok(header.formatFields.has('SR'), 'missing SR (split-read support)');
    });

    it('identifies HCC1954_BL and HCC1954 samples', () => {
      assert.deepStrictEqual(header.samples, ['HCC1954_BL', 'HCC1954']);
    });

    it('parses 6 data lines', () => {
      assert.strictEqual(dataLines.length, 6);
    });

    it('all data lines are PASS', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.filter, 'PASS');
      }
    });

    it('all data lines contain SOMATIC flag in INFO', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.info['SOMATIC'], true,
          `Expected SOMATIC flag at pos ${row.pos}`);
      }
    });

    it('SVTYPE is BND for all records (breakend calls)', () => {
      for (const row of dataLines) {
        assert.strictEqual(row.info['SVTYPE'], 'BND',
          `Expected SVTYPE=BND at pos ${row.pos}`);
      }
    });
  });

});
