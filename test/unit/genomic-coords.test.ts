// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import {
  parseGenomicCoords,
  parseFastaContigName,
  cigarRefLength,
} from '../../src/shared/genomicCoords';

describe('parseGenomicCoords', () => {
  describe('VCF (1-based inclusive -> 0-based half-open)', () => {
    it('parses a simple SNP', () => {
      const r = parseGenomicCoords('chr1\t100\t.\tA\tG\t30\tPASS\tDP=10', 'omics-vcf');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 99, end: 100 });
    });

    it('parses a 3 bp deletion (REF=CAG, ALT=C)', () => {
      const r = parseGenomicCoords('chr1\t100\t.\tCAG\tC\t.\t.\t.', 'omics-vcf');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 99, end: 102 });
    });

    it('returns null for header lines', () => {
      assert.strictEqual(parseGenomicCoords('#CHROM\tPOS\t...', 'omics-vcf'), null);
      assert.strictEqual(parseGenomicCoords('##fileformat=VCFv4.2', 'omics-vcf'), null);
    });

    it('returns null for too-few-column lines', () => {
      assert.strictEqual(parseGenomicCoords('chr1\t100\t.\tA', 'omics-vcf'), null);
    });

    it('returns null when POS is not numeric', () => {
      assert.strictEqual(parseGenomicCoords('chr1\txx\t.\tA\tG\t.\t.\t.', 'omics-vcf'), null);
    });
  });

  describe('BED and peaks (0-based half-open passthrough)', () => {
    it('parses BED', () => {
      const r = parseGenomicCoords('chr1\t100\t200\tname\t500\t+', 'omics-bed');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 100, end: 200 });
    });

    it('parses narrowPeak', () => {
      const r = parseGenomicCoords('chr1\t50\t150\tpeak1\t100\t.\t5.0\t2.0\t1.5\t50', 'omics-narrowpeak');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 50, end: 150 });
    });

    it('parses broadPeak', () => {
      const r = parseGenomicCoords('chr1\t50\t150\tpeak1\t100\t.\t5.0\t2.0\t1.5', 'omics-broadpeak');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 50, end: 150 });
    });

    it('skips track/browser lines', () => {
      assert.strictEqual(parseGenomicCoords('track name="x"', 'omics-bed'), null);
      assert.strictEqual(parseGenomicCoords('browser position chr1', 'omics-bed'), null);
    });

    it('returns null for comment lines', () => {
      assert.strictEqual(parseGenomicCoords('#comment', 'omics-bed'), null);
    });
  });

  describe('GFF3/GTF (1-based inclusive -> 0-based half-open)', () => {
    it('parses GFF3', () => {
      const r = parseGenomicCoords(
        'chr1\tsrc\tgene\t100\t200\t.\t+\t.\tID=gene1',
        'omics-gff3'
      );
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 99, end: 200 });
    });

    it('parses GTF the same way as GFF3 for coords', () => {
      const r = parseGenomicCoords(
        'chr1\tsrc\texon\t100\t200\t.\t+\t.\tgene_id "g1"',
        'omics-gtf'
      );
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 99, end: 200 });
    });
  });

  describe('SAM (1-based, CIGAR-aware end)', () => {
    it('parses a SAM row with 100M CIGAR', () => {
      const line = 'r1\t0\tchr1\t101\t60\t100M\t*\t0\t0\tACGT\t*';
      const r = parseGenomicCoords(line, 'omics-sam');
      assert.ok(r);
      assert.strictEqual(r!.chrom, 'chr1');
      assert.strictEqual(r!.start, 100);
      assert.strictEqual(r!.end, 200);
    });

    it('parses 50M5D50M (105 ref bases)', () => {
      const line = 'r1\t0\tchr1\t101\t60\t50M5D50M\t*\t0\t0\tACGT\t*';
      const r = parseGenomicCoords(line, 'omics-sam');
      assert.ok(r);
      assert.strictEqual(r!.end, r!.start + 105);
    });

    it('skips SAM header lines', () => {
      assert.strictEqual(parseGenomicCoords('@HD\tVN:1.6', 'omics-sam'), null);
      assert.strictEqual(parseGenomicCoords('@SQ\tSN:chr1\tLN:1000', 'omics-sam'), null);
    });

    it('returns null for unmapped SAM rows (POS=0)', () => {
      const line = 'r1\t4\t*\t0\t0\t*\t*\t0\t0\tACGT\t*';
      assert.strictEqual(parseGenomicCoords(line, 'omics-sam'), null);
    });

    it('falls back to 1 bp when CIGAR is *', () => {
      const line = 'r1\t0\tchr1\t101\t60\t*\t*\t0\t0\tACGT\t*';
      const r = parseGenomicCoords(line, 'omics-sam');
      assert.ok(r);
      assert.strictEqual(r!.start, 100);
      assert.strictEqual(r!.end, 101);
    });

    it('regression: CIGAR length is NOT hardcoded to 1 bp', () => {
      const line = 'r1\t0\tchr1\t101\t60\t76M\t*\t0\t0\tACGT\t*';
      const r = parseGenomicCoords(line, 'omics-sam');
      assert.ok(r);
      assert.strictEqual(r!.end - r!.start, 76,
        'SAM region should span the reference length (76), not 1');
    });
  });

  describe('PAF (0-based target coords)', () => {
    it('parses a PAF row', () => {
      const line = 'q1\t1000\t0\t500\t+\tchr1\t100000\t2000\t2500\t450\t500\t60';
      const r = parseGenomicCoords(line, 'omics-paf');
      assert.deepStrictEqual(r, { chrom: 'chr1', start: 2000, end: 2500 });
    });

    it('returns null for too-few columns', () => {
      assert.strictEqual(parseGenomicCoords('q1\t1000\t0\t500\t+\tchr1', 'omics-paf'), null);
    });
  });

  describe('FASTA', () => {
    it('returns null for FASTA lines (not a coord-producing format)', () => {
      assert.strictEqual(parseGenomicCoords('ACGTACGT', 'omics-fasta'), null);
      assert.strictEqual(parseGenomicCoords('>chr1', 'omics-fasta'), null);
    });
  });

  describe('unknown language', () => {
    it('returns null', () => {
      assert.strictEqual(parseGenomicCoords('anything', 'omics-unknown' as any), null);
    });
  });
});

describe('parseFastaContigName', () => {
  it('extracts contig name from header line', () => {
    assert.strictEqual(parseFastaContigName('>chr1'), 'chr1');
    assert.strictEqual(parseFastaContigName('>chr1 description text'), 'chr1');
    assert.strictEqual(parseFastaContigName('>seq001|genus|species'), 'seq001|genus|species');
  });

  it('returns null for non-header lines', () => {
    assert.strictEqual(parseFastaContigName('ACGT'), null);
    assert.strictEqual(parseFastaContigName(''), null);
    assert.strictEqual(parseFastaContigName(';comment'), null);
  });
});

describe('cigarRefLength', () => {
  it('counts M/D/N/=/X', () => {
    assert.strictEqual(cigarRefLength('100M'), 100);
    assert.strictEqual(cigarRefLength('50M5D50M'), 105);
    assert.strictEqual(cigarRefLength('10M5N10M'), 25);
    assert.strictEqual(cigarRefLength('10=5X5='), 20);
  });

  it('ignores I/S/H/P', () => {
    assert.strictEqual(cigarRefLength('5S100M5S'), 100);
    assert.strictEqual(cigarRefLength('10M5I10M'), 20);
    assert.strictEqual(cigarRefLength('10H100M10H'), 100);
  });

  it('returns 1 as fallback for empty/invalid CIGAR', () => {
    assert.strictEqual(cigarRefLength(''), 1);
    assert.strictEqual(cigarRefLength('*'), 1);
  });

  it('handles multi-digit counts', () => {
    assert.strictEqual(cigarRefLength('1000M'), 1000);
  });
});
