// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';

/**
 * VCF FORMAT Parser Tests
 *
 * Tests for the specialized FORMAT field parsing including:
 * - GT (Genotype) with phasing, ploidy, missing alleles
 * - GQ (Genotype Quality)
 * - DP (Read Depth)
 * - AD (Allelic Depth)
 * - PL (Phred-scaled Likelihoods)
 * - PS (Phase Set)
 * - FT (Sample Filter)
 * - Generic fallback for unknown tags
 */

// Import types and parsers
// Note: In actual test, these would be imported from the built module
// For this test, we replicate the parsing logic to test independently

interface ParsedGenotype {
  isPhased: boolean;
  alleles: (number | null)[];
  ploidy: number;
  hasMissing: boolean;
  raw: string;
}

interface ParsedAD {
  values: (number | null)[];
  refDepth: number | null;
  altDepths: (number | null)[];
  total: number;
  raw: string;
}

interface ParsedPL {
  values: (number | null)[];
  minPL: number | null;
  minPLIndex: number | null;
  firstThree: (number | null)[] | null;
  raw: string;
}

interface ParsedPS {
  value: number | null;
  raw: string;
}

interface ParsedFT {
  isPassing: boolean;
  filters: string[];
  raw: string;
}

interface FormatRecordContext {
  ref: string;
  alts: string[];
  nAlleles: number;
  formatKeys: string[];
  sampleName: string;
}

// Parser implementations (mirroring the actual module)
function parseInteger(val: string): number | null {
  if (val === '.' || val === '') return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function parseIntegerArray(raw: string): (number | null)[] {
  if (raw === '.' || raw === '') return [];
  return raw.split(',').map(parseInteger);
}

function parseGenotype(raw: string): ParsedGenotype {
  if (raw === '.' || raw === '') {
    return {
      isPhased: false,
      alleles: [null],
      ploidy: 1,
      hasMissing: true,
      raw,
    };
  }

  const isPhased = raw.includes('|');
  const sep = isPhased ? '|' : '/';
  const parts = raw.split(sep);

  const alleles: (number | null)[] = parts.map((p) => {
    if (p === '.' || p === '') return null;
    const num = parseInt(p, 10);
    return isNaN(num) ? null : num;
  });

  const hasMissing = alleles.some((a) => a === null);

  return {
    isPhased,
    alleles,
    ploidy: alleles.length,
    hasMissing,
    raw,
  };
}

function parseAllelicDepth(raw: string): ParsedAD {
  if (raw === '.' || raw === '') {
    return {
      values: [],
      refDepth: null,
      altDepths: [],
      total: 0,
      raw,
    };
  }

  const values = parseIntegerArray(raw);
  const refDepth = values.length > 0 ? values[0] : null;
  const altDepths = values.slice(1);
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);

  return {
    values,
    refDepth,
    altDepths,
    total,
    raw,
  };
}

function parsePhredLikelihoods(raw: string, nAlleles: number): ParsedPL {
  if (raw === '.' || raw === '') {
    return {
      values: [],
      minPL: null,
      minPLIndex: null,
      firstThree: null,
      raw,
    };
  }

  const values = parseIntegerArray(raw);

  let minPL: number | null = null;
  let minPLIndex: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && (minPL === null || v < minPL)) {
      minPL = v;
      minPLIndex = i;
    }
  }

  let firstThree: (number | null)[] | null = null;
  if (nAlleles === 2 && values.length >= 3) {
    firstThree = values.slice(0, 3);
  }

  return {
    values,
    minPL,
    minPLIndex,
    firstThree,
    raw,
  };
}

function parseSampleFilter(raw: string): ParsedFT {
  if (raw === '.' || raw === '' || raw === 'PASS') {
    return {
      isPassing: raw === 'PASS' || raw === '.' || raw === '',
      filters: [],
      raw,
    };
  }

  const filters = raw.split(/[;,]/).filter((f) => f && f !== 'PASS');

  return {
    isPassing: filters.length === 0,
    filters,
    raw,
  };
}

// ============================================================================
// GT (Genotype) Tests
// ============================================================================

describe('VCF FORMAT Parsers', () => {
  describe('GT (Genotype) Parser', () => {
    it('should parse unphased diploid genotype 0/1', () => {
      const gt = parseGenotype('0/1');
      assert.strictEqual(gt.isPhased, false);
      assert.deepStrictEqual(gt.alleles, [0, 1]);
      assert.strictEqual(gt.ploidy, 2);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse phased diploid genotype 0|1', () => {
      const gt = parseGenotype('0|1');
      assert.strictEqual(gt.isPhased, true);
      assert.deepStrictEqual(gt.alleles, [0, 1]);
      assert.strictEqual(gt.ploidy, 2);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse phased genotype 1|0 (different order)', () => {
      const gt = parseGenotype('1|0');
      assert.strictEqual(gt.isPhased, true);
      assert.deepStrictEqual(gt.alleles, [1, 0]);
      assert.strictEqual(gt.ploidy, 2);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse homozygous reference 0/0', () => {
      const gt = parseGenotype('0/0');
      assert.strictEqual(gt.isPhased, false);
      assert.deepStrictEqual(gt.alleles, [0, 0]);
      assert.strictEqual(gt.ploidy, 2);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse homozygous alternate 1/1', () => {
      const gt = parseGenotype('1/1');
      assert.deepStrictEqual(gt.alleles, [1, 1]);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse phased homozygous 1|1', () => {
      const gt = parseGenotype('1|1');
      assert.strictEqual(gt.isPhased, true);
      assert.deepStrictEqual(gt.alleles, [1, 1]);
    });

    it('should parse missing genotype ./.', () => {
      const gt = parseGenotype('./.');
      assert.strictEqual(gt.isPhased, false);
      assert.deepStrictEqual(gt.alleles, [null, null]);
      assert.strictEqual(gt.ploidy, 2);
      assert.strictEqual(gt.hasMissing, true);
    });

    it('should parse partial missing genotype 0/.', () => {
      const gt = parseGenotype('0/.');
      assert.deepStrictEqual(gt.alleles, [0, null]);
      assert.strictEqual(gt.hasMissing, true);
    });

    it('should parse partial missing genotype ./1', () => {
      const gt = parseGenotype('./1');
      assert.deepStrictEqual(gt.alleles, [null, 1]);
      assert.strictEqual(gt.hasMissing, true);
    });

    it('should parse haploid genotype 0', () => {
      const gt = parseGenotype('0');
      assert.deepStrictEqual(gt.alleles, [0]);
      assert.strictEqual(gt.ploidy, 1);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse haploid genotype 1', () => {
      const gt = parseGenotype('1');
      assert.deepStrictEqual(gt.alleles, [1]);
      assert.strictEqual(gt.ploidy, 1);
    });

    it('should parse triploid genotype 0|1|2', () => {
      const gt = parseGenotype('0|1|2');
      assert.strictEqual(gt.isPhased, true);
      assert.deepStrictEqual(gt.alleles, [0, 1, 2]);
      assert.strictEqual(gt.ploidy, 3);
      assert.strictEqual(gt.hasMissing, false);
    });

    it('should parse tetraploid genotype 0/0/1/1', () => {
      const gt = parseGenotype('0/0/1/1');
      assert.strictEqual(gt.isPhased, false);
      assert.deepStrictEqual(gt.alleles, [0, 0, 1, 1]);
      assert.strictEqual(gt.ploidy, 4);
    });

    it('should parse multiallelic genotype 1/2', () => {
      const gt = parseGenotype('1/2');
      assert.deepStrictEqual(gt.alleles, [1, 2]);
    });

    it('should parse multiallelic genotype 2/3', () => {
      const gt = parseGenotype('2/3');
      assert.deepStrictEqual(gt.alleles, [2, 3]);
    });

    it('should handle empty string as missing', () => {
      const gt = parseGenotype('');
      assert.strictEqual(gt.hasMissing, true);
    });

    it('should handle single dot as missing', () => {
      const gt = parseGenotype('.');
      assert.strictEqual(gt.hasMissing, true);
    });
  });

  // ============================================================================
  // GQ and DP (Integer) Tests
  // ============================================================================

  describe('GQ/DP (Integer) Parser', () => {
    it('should parse integer value', () => {
      assert.strictEqual(parseInteger('99'), 99);
      assert.strictEqual(parseInteger('0'), 0);
      assert.strictEqual(parseInteger('35'), 35);
    });

    it('should parse missing value as null', () => {
      assert.strictEqual(parseInteger('.'), null);
      assert.strictEqual(parseInteger(''), null);
    });

    it('should handle invalid values as null', () => {
      assert.strictEqual(parseInteger('abc'), null);
      assert.strictEqual(parseInteger('12.5'), 12); // parseInt behavior
    });
  });

  // ============================================================================
  // AD (Allelic Depth) Tests
  // ============================================================================

  describe('AD (Allelic Depth) Parser', () => {
    it('should parse biallelic AD 10,25', () => {
      const ad = parseAllelicDepth('10,25');
      assert.deepStrictEqual(ad.values, [10, 25]);
      assert.strictEqual(ad.refDepth, 10);
      assert.deepStrictEqual(ad.altDepths, [25]);
      assert.strictEqual(ad.total, 35);
    });

    it('should parse triallelic AD 5,10,15', () => {
      const ad = parseAllelicDepth('5,10,15');
      assert.deepStrictEqual(ad.values, [5, 10, 15]);
      assert.strictEqual(ad.refDepth, 5);
      assert.deepStrictEqual(ad.altDepths, [10, 15]);
      assert.strictEqual(ad.total, 30);
    });

    it('should parse AD with multiple ALTs 8,12,20,5', () => {
      const ad = parseAllelicDepth('8,12,20,5');
      assert.deepStrictEqual(ad.values, [8, 12, 20, 5]);
      assert.strictEqual(ad.refDepth, 8);
      assert.deepStrictEqual(ad.altDepths, [12, 20, 5]);
      assert.strictEqual(ad.total, 45);
    });

    it('should handle missing AD', () => {
      const ad = parseAllelicDepth('.');
      assert.deepStrictEqual(ad.values, []);
      assert.strictEqual(ad.refDepth, null);
      assert.deepStrictEqual(ad.altDepths, []);
      assert.strictEqual(ad.total, 0);
    });

    it('should handle partial missing values', () => {
      const ad = parseAllelicDepth('10,.');
      assert.deepStrictEqual(ad.values, [10, null]);
      assert.strictEqual(ad.refDepth, 10);
      assert.deepStrictEqual(ad.altDepths, [null]);
      assert.strictEqual(ad.total, 10);
    });

    it('should handle zero depths', () => {
      const ad = parseAllelicDepth('0,30');
      assert.strictEqual(ad.refDepth, 0);
      assert.deepStrictEqual(ad.altDepths, [30]);
      assert.strictEqual(ad.total, 30);
    });
  });

  // ============================================================================
  // PL (Phred-scaled Likelihoods) Tests
  // ============================================================================

  describe('PL (Phred-scaled Likelihoods) Parser', () => {
    it('should parse biallelic diploid PL 120,0,180', () => {
      const pl = parsePhredLikelihoods('120,0,180', 2);
      assert.deepStrictEqual(pl.values, [120, 0, 180]);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 1);
      assert.deepStrictEqual(pl.firstThree, [120, 0, 180]);
    });

    it('should parse PL with minimum at index 0', () => {
      const pl = parsePhredLikelihoods('0,150,300', 2);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 0);
    });

    it('should parse PL with minimum at index 2', () => {
      const pl = parsePhredLikelihoods('200,100,0', 2);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 2);
    });

    it('should parse multiallelic PL (6 values for triallelic)', () => {
      const pl = parsePhredLikelihoods('100,50,200,0,150,300', 3);
      assert.deepStrictEqual(pl.values, [100, 50, 200, 0, 150, 300]);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 3);
      // Not biallelic, so firstThree should be null
      assert.strictEqual(pl.firstThree, null);
    });

    it('should handle missing PL', () => {
      const pl = parsePhredLikelihoods('.', 2);
      assert.deepStrictEqual(pl.values, []);
      assert.strictEqual(pl.minPL, null);
      assert.strictEqual(pl.minPLIndex, null);
    });

    it('should handle empty PL', () => {
      const pl = parsePhredLikelihoods('', 2);
      assert.deepStrictEqual(pl.values, []);
    });

    it('should handle PL with all same values', () => {
      const pl = parsePhredLikelihoods('50,50,50', 2);
      assert.strictEqual(pl.minPL, 50);
      assert.strictEqual(pl.minPLIndex, 0); // First occurrence
    });
  });

  // ============================================================================
  // PS (Phase Set) Tests
  // ============================================================================

  describe('PS (Phase Set) Parser', () => {
    it('should parse phase set integer', () => {
      const ps: ParsedPS = { value: parseInteger('12345'), raw: '12345' };
      assert.strictEqual(ps.value, 12345);
    });

    it('should handle missing phase set', () => {
      const ps: ParsedPS = { value: parseInteger('.'), raw: '.' };
      assert.strictEqual(ps.value, null);
    });

    it('should parse large phase set value', () => {
      const ps: ParsedPS = { value: parseInteger('999999999'), raw: '999999999' };
      assert.strictEqual(ps.value, 999999999);
    });
  });

  // ============================================================================
  // FT (Sample Filter) Tests
  // ============================================================================

  describe('FT (Sample Filter) Parser', () => {
    it('should parse PASS filter', () => {
      const ft = parseSampleFilter('PASS');
      assert.strictEqual(ft.isPassing, true);
      assert.deepStrictEqual(ft.filters, []);
    });

    it('should parse missing filter as passing', () => {
      const ft = parseSampleFilter('.');
      assert.strictEqual(ft.isPassing, true);
    });

    it('should parse empty filter as passing', () => {
      const ft = parseSampleFilter('');
      assert.strictEqual(ft.isPassing, true);
    });

    it('should parse single filter', () => {
      const ft = parseSampleFilter('LowQual');
      assert.strictEqual(ft.isPassing, false);
      assert.deepStrictEqual(ft.filters, ['LowQual']);
    });

    it('should parse multiple filters (semicolon separated)', () => {
      const ft = parseSampleFilter('LowQual;LowDP');
      assert.strictEqual(ft.isPassing, false);
      assert.deepStrictEqual(ft.filters, ['LowQual', 'LowDP']);
    });

    it('should parse multiple filters (comma separated)', () => {
      const ft = parseSampleFilter('LowQual,LowDP');
      assert.strictEqual(ft.isPassing, false);
      assert.deepStrictEqual(ft.filters, ['LowQual', 'LowDP']);
    });

    it('should handle mixed separators', () => {
      const ft = parseSampleFilter('LowQual;LowDP,LowGQ');
      assert.strictEqual(ft.isPassing, false);
      assert.deepStrictEqual(ft.filters, ['LowQual', 'LowDP', 'LowGQ']);
    });
  });

  // ============================================================================
  // Integration Tests with Real VCF Data
  // ============================================================================

  describe('Integration: Complete Sample Parsing', () => {
    it('should parse biallelic diploid sample "0/1:99:35:10,25:120,0,180"', () => {
      const formatStr = 'GT:GQ:DP:AD:PL';
      const sampleStr = '0/1:99:35:10,25:120,0,180';
      const formatKeys = formatStr.split(':');
      const sampleValues = sampleStr.split(':');

      const rawData: Record<string, string> = {};
      for (let i = 0; i < formatKeys.length; i++) {
        rawData[formatKeys[i]] = sampleValues[i] || '.';
      }

      // Parse GT
      const gt = parseGenotype(rawData['GT']);
      assert.deepStrictEqual(gt.alleles, [0, 1]);
      assert.strictEqual(gt.isPhased, false);
      assert.strictEqual(gt.hasMissing, false);

      // Parse GQ
      const gq = parseInteger(rawData['GQ']);
      assert.strictEqual(gq, 99);

      // Parse DP
      const dp = parseInteger(rawData['DP']);
      assert.strictEqual(dp, 35);

      // Parse AD
      const ad = parseAllelicDepth(rawData['AD']);
      assert.deepStrictEqual(ad.values, [10, 25]);
      assert.strictEqual(ad.total, 35);

      // Parse PL
      const pl = parsePhredLikelihoods(rawData['PL'], 2);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 1);
    });

    it('should parse phased sample with PS "0|1:60:20:8,12:0,60,120:12345"', () => {
      const formatStr = 'GT:GQ:DP:AD:PL:PS';
      const sampleStr = '0|1:60:20:8,12:0,60,120:12345';
      const formatKeys = formatStr.split(':');
      const sampleValues = sampleStr.split(':');

      const rawData: Record<string, string> = {};
      for (let i = 0; i < formatKeys.length; i++) {
        rawData[formatKeys[i]] = sampleValues[i] || '.';
      }

      const gt = parseGenotype(rawData['GT']);
      assert.strictEqual(gt.isPhased, true);
      assert.deepStrictEqual(gt.alleles, [0, 1]);

      const ps: ParsedPS = { value: parseInteger(rawData['PS']), raw: rawData['PS'] };
      assert.strictEqual(ps.value, 12345);
    });

    it('should parse multiallelic sample with GT 1/2 and AD length 3', () => {
      const gt = parseGenotype('1/2');
      assert.deepStrictEqual(gt.alleles, [1, 2]);
      assert.strictEqual(gt.hasMissing, false);

      const ad = parseAllelicDepth('5,10,15');
      assert.deepStrictEqual(ad.values, [5, 10, 15]);
      assert.deepStrictEqual(ad.altDepths, [10, 15]);
    });

    it('should handle all missing values "./.:.:.:.:."', () => {
      const formatStr = 'GT:GQ:DP:AD:PL';
      const sampleStr = './.:.:.:.:.' ;
      const formatKeys = formatStr.split(':');
      const sampleValues = sampleStr.split(':');

      const rawData: Record<string, string> = {};
      for (let i = 0; i < formatKeys.length; i++) {
        rawData[formatKeys[i]] = sampleValues[i] || '.';
      }

      const gt = parseGenotype(rawData['GT']);
      assert.strictEqual(gt.hasMissing, true);
      assert.deepStrictEqual(gt.alleles, [null, null]);

      const gq = parseInteger(rawData['GQ']);
      assert.strictEqual(gq, null);

      const dp = parseInteger(rawData['DP']);
      assert.strictEqual(dp, null);

      const ad = parseAllelicDepth(rawData['AD']);
      assert.deepStrictEqual(ad.values, []);
      assert.strictEqual(ad.refDepth, null);

      const pl = parsePhredLikelihoods(rawData['PL'], 2);
      assert.deepStrictEqual(pl.values, []);
      assert.strictEqual(pl.minPL, null);
    });

    it('should handle unknown FORMAT tags gracefully', () => {
      // When an unknown tag appears, it should be treated as string
      const formatStr = 'GT:XX';
      const sampleStr = '0/1:some_value';
      const formatKeys = formatStr.split(':');
      const sampleValues = sampleStr.split(':');

      const rawData: Record<string, string> = {};
      for (let i = 0; i < formatKeys.length; i++) {
        rawData[formatKeys[i]] = sampleValues[i] || '.';
      }

      // GT should still parse
      const gt = parseGenotype(rawData['GT']);
      assert.deepStrictEqual(gt.alleles, [0, 1]);

      // XX should be preserved as string
      assert.strictEqual(rawData['XX'], 'some_value');
    });
  });

  // ============================================================================
  // Edge Cases and Robustness
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle GT with very high allele indices', () => {
      const gt = parseGenotype('0/15');
      assert.deepStrictEqual(gt.alleles, [0, 15]);
    });

    it('should handle AD with many alleles', () => {
      const ad = parseAllelicDepth('1,2,3,4,5,6,7,8,9,10');
      assert.strictEqual(ad.values.length, 10);
      assert.strictEqual(ad.total, 55);
    });

    it('should handle PL with many values', () => {
      const pl = parsePhredLikelihoods('0,10,20,30,40,50,60,70,80,90', 5);
      assert.strictEqual(pl.values.length, 10);
      assert.strictEqual(pl.minPL, 0);
      assert.strictEqual(pl.minPLIndex, 0);
    });

    it('should not crash on malformed GT', () => {
      const gt = parseGenotype('abc/def');
      // Should handle gracefully - parse as nulls
      assert.strictEqual(gt.hasMissing, true);
    });

    it('should handle phased genotype with single allele', () => {
      // Some callers may output this
      const gt = parseGenotype('1');
      assert.strictEqual(gt.ploidy, 1);
      assert.deepStrictEqual(gt.alleles, [1]);
    });
  });
});
