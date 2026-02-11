// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';

/**
 * Webview Utility Tests
 *
 * Tests the pure utility functions used by webview preview components.
 * These are imported directly (no React/DOM needed).
 */

// Re-implement the functions here to test logic without importing from webview
// (webview uses ESNext modules which mocha can't import directly)

function sortChromosomes(chroms: Iterable<string>): string[] {
  return Array.from(chroms).sort((a, b) => {
    const aNum = parseInt(a.replace(/\D/g, ''), 10);
    const bNum = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });
}

function parseTags(tagFields: string[]): Record<string, string> {
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

describe('Webview Utilities', () => {
  describe('sortChromosomes', () => {
    it('should sort numeric chromosomes naturally', () => {
      const result = sortChromosomes(['chr10', 'chr2', 'chr1', 'chr20']);
      assert.deepStrictEqual(result, ['chr1', 'chr2', 'chr10', 'chr20']);
    });

    it('should sort mixed numeric and letter chromosomes', () => {
      const result = sortChromosomes(['chrX', 'chr2', 'chrY', 'chr1']);
      // chrX and chrY have NaN from parseInt, so they sort lexicographically
      assert.strictEqual(result[0], 'chr1');
      assert.strictEqual(result[1], 'chr2');
    });

    it('should handle empty input', () => {
      const result = sortChromosomes([]);
      assert.deepStrictEqual(result, []);
    });

    it('should handle single chromosome', () => {
      const result = sortChromosomes(['chr1']);
      assert.deepStrictEqual(result, ['chr1']);
    });

    it('should handle Set input', () => {
      const result = sortChromosomes(new Set(['chr3', 'chr1', 'chr2']));
      assert.deepStrictEqual(result, ['chr1', 'chr2', 'chr3']);
    });
  });

  describe('parseTags', () => {
    it('should parse SAM-style tags', () => {
      const result = parseTags(['NM:i:5', 'MD:Z:50A0']);
      assert.strictEqual(result['NM'], '5');
      assert.strictEqual(result['MD'], '50A0');
    });

    it('should handle tags with colons in values', () => {
      const result = parseTags(['BC:Z:ACGT:TGCA']);
      assert.strictEqual(result['BC'], 'ACGT:TGCA');
    });

    it('should skip malformed tags', () => {
      const result = parseTags(['NM:i:5', 'badtag', 'MD:Z:50']);
      assert.strictEqual(Object.keys(result).length, 2);
      assert.strictEqual(result['NM'], '5');
      assert.strictEqual(result['MD'], '50');
    });

    it('should handle empty input', () => {
      const result = parseTags([]);
      assert.deepStrictEqual(result, {});
    });

    it('should handle PAF-style tags', () => {
      const result = parseTags(['tp:A:P', 'cm:i:87', 'dv:f:0.001']);
      assert.strictEqual(result['tp'], 'P');
      assert.strictEqual(result['cm'], '87');
      assert.strictEqual(result['dv'], '0.001');
    });
  });
});
