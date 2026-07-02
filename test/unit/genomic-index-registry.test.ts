// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { GenomicIndexRegistry } from '../../src/services/GenomicIndexRegistry';

interface StubDoc {
  uri: { toString: () => string };
  languageId: string;
  version: number;
  getText: () => string;
}

function doc(uri: string, languageId: string, text: string, version = 1): StubDoc {
  return {
    uri: { toString: () => uri },
    languageId,
    version,
    getText: () => text,
  };
}

describe('GenomicIndexRegistry', () => {
  describe('indexDocument', () => {
    it('indexes a VCF document into sorted regions', () => {
      const registry = new GenomicIndexRegistry();
      const vcf = [
        '##fileformat=VCFv4.2',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        'chr1\t200\t.\tA\tG\t.\tPASS\t.',
        'chr1\t100\tv1\tC\tT\t.\tPASS\t.',
        'chr2\t50\t.\tA\tT\t.\tPASS\t.',
      ].join('\n');

      registry.indexDocument(doc('file:///a.vcf', 'omics-vcf', vcf) as any);

      const hits = registry.findOverlapping('chr1', 0, 1000);
      assert.strictEqual(hits.length, 2);
      assert.strictEqual(hits[0].start, 99);
      assert.strictEqual(hits[1].start, 199);
      assert.ok(hits[0].start < hits[1].start, 'regions should be sorted ascending by start');
    });

    it('skips documents in unsupported languages', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.txt', 'plaintext', 'hello', 1) as any);
      assert.deepStrictEqual(registry.getIndexedUris(), []);
    });

    it('is idempotent for the same document version', () => {
      const registry = new GenomicIndexRegistry();
      const d = doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1);
      registry.indexDocument(d as any);
      registry.indexDocument(d as any);
      assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 1);
    });

    it('re-indexes when document.version changes', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\nchr1\t300\t400\n', 2) as any);
      assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 2);
    });
  });

  describe('findOverlapping', () => {
    it('returns regions that overlap the query interval', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(
        doc('file:///a.bed', 'omics-bed',
            'chr1\t100\t200\n' +
            'chr1\t300\t400\n' +
            'chr1\t500\t600\n',
            1) as any
      );

      const hits = registry.findOverlapping('chr1', 150, 350);
      assert.strictEqual(hits.length, 2);
      assert.deepStrictEqual([hits[0].start, hits[1].start], [100, 300]);
    });

    it('returns empty for non-overlapping query', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);
      assert.deepStrictEqual(registry.findOverlapping('chr1', 300, 400), []);
    });

    it('excludes the query URI when excludeUri is passed', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);
      registry.indexDocument(doc('file:///b.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);
      const hits = registry.findOverlapping('chr1', 100, 200, 'file:///a.bed');
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0].uri, 'file:///b.bed');
    });

    it('finds overlaps when chrom names sort differently under localeCompare vs code units', () => {
      // Regression: indexDocument sorted with String.localeCompare, but findOverlapping's
      // binary search compares chroms with code-unit `<`. 'B' (0x42) < 'a' (0x61) by code
      // unit, but localeCompare orders 'a' before 'B' — so the search landed in the wrong
      // partition and missed a valid overlap.
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(
        doc('file:///a.bed', 'omics-bed', 'a\t100\t200\nB\t100\t200\n', 1) as any
      );
      const hits = registry.findOverlapping('B', 150, 160);
      assert.strictEqual(hits.length, 1, "should find the region on chrom 'B'");
      assert.strictEqual(hits[0].chrom, 'B');
    });

    it('respects chromosome boundaries', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(
        doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\nchr2\t100\t200\n', 1) as any
      );
      const hits = registry.findOverlapping('chr1', 0, 10000);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0].chrom, 'chr1');
    });
  });

  describe('findContig', () => {
    it('finds a FASTA contig by name', () => {
      const registry = new GenomicIndexRegistry();
      const fasta = '>chr1 description\nACGT\n>chr2\nACGT\n';
      registry.indexDocument(doc('file:///a.fa', 'omics-fasta', fasta, 1) as any);

      const hit = registry.findContig('chr1');
      assert.ok(hit);
      assert.strictEqual(hit!.chrom, 'chr1');
      assert.strictEqual(hit!.uri, 'file:///a.fa');
    });

    it('returns null when contig not found', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.fa', 'omics-fasta', '>chr1\nACGT\n', 1) as any);
      assert.strictEqual(registry.findContig('chr99'), null);
    });
  });

  describe('removeDocument', () => {
    it('clears a previously indexed document', () => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);
      assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 1);
      registry.removeDocument('file:///a.bed');
      assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 0);
    });
  });

  describe('scheduleReindex', () => {
    it('debounces re-indexing (2s window)', (done) => {
      const registry = new GenomicIndexRegistry();
      registry.indexDocument(doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\n', 1) as any);

      const d2 = doc('file:///a.bed', 'omics-bed', 'chr1\t100\t200\nchr1\t300\t400\n', 2);
      registry.scheduleReindex(d2 as any);

      // Still showing the old state immediately after schedule
      assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 1);

      setTimeout(() => {
        try {
          assert.strictEqual(registry.findOverlapping('chr1', 0, 1000).length, 2);
          registry.dispose();
          done();
        } catch (e) {
          registry.dispose();
          done(e);
        }
      }, 2200);
    }).timeout(3000);
  });

  describe('SAM CIGAR handling (regression)', () => {
    it('computes end using CIGAR reference length, not 1 bp', () => {
      const registry = new GenomicIndexRegistry();
      const sam = [
        '@HD\tVN:1.6\tSO:coordinate',
        '@SQ\tSN:chr1\tLN:100000',
        'r1\t0\tchr1\t101\t60\t76M\t*\t0\t0\tACGT\t*',
      ].join('\n');
      registry.indexDocument(doc('file:///a.sam', 'omics-sam', sam, 1) as any);

      const hits = registry.findOverlapping('chr1', 0, 10000);
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0].end - hits[0].start, 76);
    });
  });
});
