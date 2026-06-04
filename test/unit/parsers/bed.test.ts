// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateBed, validateBedpe } from '../../../server/src/validators';
import { defaultSettings } from '../../../server/src/validators/types';
import type { ValidatorContext } from '../../../server/src/validators/types';
import { getFixturePath } from '../../fixtures.index';

/**
 * BED and BEDPE validation tests, exercising the SHIPPED validators
 * (server/src/validators/{bed,bedpe}.ts) directly.
 */

function ctx(text: string): ValidatorContext {
  return {
    uri: 'file:///test',
    lineCount: text.split('\n').length,
    headerEndLine: 0,
    bufferLines: 500,
  };
}

const runBed = (text: string): Diagnostic[] => validateBed(text, defaultSettings, ctx(text));
const runBedpe = (text: string): Diagnostic[] => validateBedpe(text, defaultSettings, ctx(text));

function hasError(diags: Diagnostic[], substr: string): boolean {
  return diags.some((d) => d.severity === DiagnosticSeverity.Error && d.message.includes(substr));
}
function hasWarning(diags: Diagnostic[], substr: string): boolean {
  return diags.some((d) => d.severity === DiagnosticSeverity.Warning && d.message.includes(substr));
}

describe('BED Validation', () => {
  describe('validateBed', () => {
    it('should accept valid BED3 line', () => {
      assert.deepStrictEqual(runBed('chr1\t100\t200'), []);
    });

    it('should accept valid BED6 line', () => {
      assert.deepStrictEqual(runBed('chr1\t100\t200\tfeature1\t500\t+'), []);
    });

    it('should accept valid BED12 line', () => {
      assert.deepStrictEqual(runBed('chr1\t100\t200\tfeature1\t500\t+\t100\t200\t0\t1\t100\t0'), []);
    });

    it('should skip empty lines', () => {
      assert.deepStrictEqual(runBed(''), []);
    });

    it('should skip comment lines', () => {
      assert.deepStrictEqual(runBed('#chrom\tchromStart\tchromEnd'), []);
    });

    it('should skip track lines', () => {
      assert.deepStrictEqual(runBed('track name="test"'), []);
    });

    it('should skip browser lines', () => {
      assert.deepStrictEqual(runBed('browser position chr1:1-1000'), []);
    });

    it('should reject lines with fewer than 3 columns', () => {
      assert.ok(hasError(runBed('chr1\t100'), 'at least 3 columns'));
    });

    it('should reject non-integer start position', () => {
      assert.ok(hasError(runBed('chr1\tabc\t200'), 'integers'));
    });

    it('should reject non-integer end position', () => {
      assert.ok(hasError(runBed('chr1\t100\txyz'), 'integers'));
    });

    it('should reject negative start position', () => {
      assert.ok(hasError(runBed('chr1\t-10\t200'), 'negative'));
    });

    it('should reject start >= end', () => {
      assert.ok(hasError(runBed('chr1\t200\t100'), 'less than'));
    });

    it('should reject start == end', () => {
      const diags = runBed('chr1\t100\t100');
      assert.ok(diags.some((d) => d.severity === DiagnosticSeverity.Error));
    });

    it('should warn on out-of-range score in strict mode', () => {
      assert.ok(hasWarning(runBed('chr1\t100\t200\tfeature\t5000\t+'), 'Score'));
    });

    it('should warn on invalid strand in strict mode', () => {
      assert.ok(hasWarning(runBed('chr1\t100\t200\tfeature\t500\tX'), 'strand'));
    });
  });

  describe('with fixture file', () => {
    it('should validate BED fixture file without errors on first 10 lines', () => {
      const content = fs.readFileSync(getFixturePath('bed-example'), 'utf-8');
      const text = content.split('\n').slice(0, 10).join('\n');
      const errors = runBed(text).filter((d) => d.severity === DiagnosticSeverity.Error);
      assert.deepStrictEqual(errors, [], `Expected no errors but found: ${JSON.stringify(errors)}`);
    });
  });
});

describe('BEDPE Validation', () => {
  describe('validateBedpe', () => {
    it('should accept valid BEDPE line with 10 columns', () => {
      assert.deepStrictEqual(runBedpe('chr1\t100\t200\tchr1\t1000\t1100\tpair1\t50\t+\t-'), []);
    });

    it('should accept valid BEDPE line with 6 columns (minimum)', () => {
      assert.deepStrictEqual(runBedpe('chr1\t100\t200\tchr2\t500\t600'), []);
    });

    it('should accept BEDPE with dot placeholders for strand', () => {
      assert.deepStrictEqual(runBedpe('chr1\t100\t200\tchr1\t1000\t1100\tpair\t.\t.\t.'), []);
    });

    it('should skip empty lines', () => {
      assert.deepStrictEqual(runBedpe(''), []);
    });

    it('should skip comment/header lines', () => {
      assert.deepStrictEqual(runBedpe('#chrom1\tstart1\tend1\tchrom2\tstart2\tend2'), []);
    });

    it('should reject lines with fewer than 6 columns', () => {
      assert.ok(hasError(runBedpe('chr1\t100\t200\tchr1\t1000'), 'at least 6 columns'));
    });

    it('should reject non-integer start1', () => {
      assert.ok(hasError(runBedpe('chr1\tabc\t200\tchr1\t1000\t1100'), 'start1'));
    });

    it('should reject non-integer end1', () => {
      assert.ok(hasError(runBedpe('chr1\t100\txyz\tchr1\t1000\t1100'), 'end1'));
    });

    it('should reject non-integer start2', () => {
      assert.ok(hasError(runBedpe('chr1\t100\t200\tchr1\tabc\t1100'), 'start2'));
    });

    it('should reject non-integer end2', () => {
      assert.ok(hasError(runBedpe('chr1\t100\t200\tchr1\t1000\txyz'), 'end2'));
    });

    it('should reject negative start1', () => {
      assert.ok(hasError(runBedpe('chr1\t-10\t200\tchr1\t1000\t1100'), 'negative'));
    });

    it('should reject negative start2', () => {
      assert.ok(hasError(runBedpe('chr1\t100\t200\tchr1\t-10\t1100'), 'negative'));
    });

    it('should reject end1 < start1', () => {
      assert.ok(hasError(runBedpe('chr1\t200\t100\tchr1\t1000\t1100'), 'start'));
    });

    it('should reject end2 < start2', () => {
      assert.ok(hasError(runBedpe('chr1\t100\t200\tchr1\t1100\t1000'), 'start'));
    });

    it('should accept end == start (point features)', () => {
      assert.deepStrictEqual(runBedpe('chr1\t100\t100\tchr1\t1000\t1000'), []);
    });

    it('should warn on invalid strand1', () => {
      assert.ok(hasWarning(runBedpe('chr1\t100\t200\tchr1\t1000\t1100\tpair\t50\tX\t-'), 'Strand'));
    });

    it('should warn on invalid strand2', () => {
      assert.ok(hasWarning(runBedpe('chr1\t100\t200\tchr1\t1000\t1100\tpair\t50\t+\tY'), 'Strand'));
    });
  });

  describe('with fixture file', () => {
    it('should validate BEDPE fixture file without errors', () => {
      const content = fs.readFileSync(getFixturePath('bedpe-example'), 'utf-8');
      const errors = runBedpe(content).filter((d) => d.severity === DiagnosticSeverity.Error);
      assert.deepStrictEqual(errors, [], `Expected no errors but found: ${JSON.stringify(errors)}`);
    });
  });
});

describe('BED/BEDPE Edge Cases', () => {
  it('should handle BED with very large coordinates', () => {
    assert.deepStrictEqual(runBed('chr1\t100000000\t200000000'), []);
  });

  it('should handle BEDPE with inter-chromosomal pairs', () => {
    assert.deepStrictEqual(runBedpe('chr1\t100\t200\tchr2\t500\t600\ttranslocation\t100\t+\t-'), []);
  });

  it('should reject BED with a space instead of a tab separator', () => {
    // "chr1\t100 200" splits into two columns, which is below the 3-column minimum.
    assert.ok(runBed('chr1\t100 200').length >= 1);
  });

  it('should handle BEDPE with only required columns', () => {
    assert.deepStrictEqual(runBedpe('chr1\t0\t1\tchr1\t0\t1'), []);
  });
});
