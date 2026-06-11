// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateSam } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validateSam(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

// A minimal valid 11-column SAM data line. SEQ length 3 matches CIGAR 3M query length.
// FLAG 0 means unpaired/mapped so no cross-field flag conflicts fire.
const VALID = 'r1\t0\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';

describe('validateSam', () => {
  describe('fixture happy path (sam-toy)', () => {
    it('produces no error-severity diagnostics on the real fixture', () => {
      const text = fs.readFileSync(getFixturePath('sam-toy'), 'utf8');
      const diags = run(text);
      const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
      assert.strictEqual(errors.length, 0, `expected no errors, got: ${JSON.stringify(errors.map(e => e.message))}`);
    });
  });

  describe('valid inputs', () => {
    it('a minimal valid alignment line yields no diagnostics', () => {
      const diags = run(VALID);
      assert.strictEqual(diags.length, 0, `expected zero diagnostics, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    it('header (@) and blank lines are skipped', () => {
      const text = '@HD\tVN:1.6\n@SQ\tSN:ref\tLN:45\n\n' + VALID;
      const diags = run(text);
      assert.strictEqual(diags.length, 0, `expected zero diagnostics, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });

    it('CIGAR of "*" and SEQ of "*" are accepted', () => {
      const line = 'r1\t0\tref\t7\t30\t*\t*\t0\t0\t*\t*';
      const diags = run(line);
      assert.strictEqual(diags.length, 0, `expected zero diagnostics, got: ${JSON.stringify(diags.map(d => d.message))}`);
    });
  });

  describe('SAM-001: column count', () => {
    it('errors when fewer than 11 columns', () => {
      const line = 'r1\t0\tref\t7\t30\t3M\t*\t0\t0\tACG'; // only 10 columns
      const diags = run(line);
      assert.ok(hasError(diags, 'SAM format requires at least 11 columns'));
      assert.ok(hasError(diags, 'found 10'));
    });
  });

  describe('SAM-002: FLAG non-negative integer', () => {
    it('errors when FLAG is non-numeric', () => {
      const line = 'r1\tNOTANUM\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'FLAG must be a non-negative integer'));
    });

    it('errors when FLAG is negative', () => {
      const line = 'r1\t-1\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'FLAG must be a non-negative integer'));
    });
  });

  describe('SAM-003: POS non-negative integer', () => {
    it('errors when POS is negative', () => {
      const line = 'r1\t0\tref\t-5\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'POS must be a non-negative integer'));
    });

    it('errors when POS is non-numeric', () => {
      const line = 'r1\t0\tref\tABC\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'POS must be a non-negative integer'));
    });
  });

  describe('SAM-004: MAPQ range (warning)', () => {
    it('warns when MAPQ exceeds 255', () => {
      const line = 'r1\t0\tref\t7\t999\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasWarning(diags, 'MAPQ should be between 0 and 255'));
    });

    it('warns when MAPQ is negative', () => {
      const line = 'r1\t0\tref\t7\t-1\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasWarning(diags, 'MAPQ should be between 0 and 255'));
    });
  });

  describe('SAM-S002: strict FLAG upper bound', () => {
    it('errors when FLAG exceeds 65535', () => {
      const line = 'r1\t70000\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'FLAG must be 0-65535'));
      assert.ok(hasError(diags, 'found 70000'));
    });
  });

  describe('SAM-S001: strict CIGAR pattern', () => {
    it('errors when CIGAR does not match the operation pattern', () => {
      const line = 'r1\t0\tref\t7\t30\tZZZ\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'CIGAR must match pattern'));
    });
  });

  describe('SAM-S003: strict SEQ characters (warning)', () => {
    it('warns when SEQ contains non-standard characters', () => {
      // SEQ length 3 (matches 3M) but contains an illegal '!' character.
      const line = 'r1\t0\tref\t7\t30\t3M\t*\t0\t0\tA!G\t*';
      const diags = run(line);
      assert.ok(hasWarning(diags, 'SEQ contains non-standard characters'));
    });
  });

  describe('SAM-X001: strict CIGAR/SEQ length cross-field', () => {
    it('errors when CIGAR query length does not match SEQ length', () => {
      // CIGAR 5M => query length 5, but SEQ ACG is length 3.
      const line = 'r1\t0\tref\t7\t30\t5M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasError(diags, 'CIGAR query length (5) does not match SEQ length (3)'));
    });
  });

  describe('SAM-X002: strict FLAG conflict unmapped + properly paired (warning)', () => {
    it('warns when 0x4 (unmapped) and 0x2 (properly paired) are both set', () => {
      // FLAG 0x4 | 0x2 = 6. Also set 0x1 paired so X003 does not fire.
      // 0x1 | 0x2 | 0x4 = 7.
      const line = 'r1\t7\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasWarning(diags, 'FLAG conflict: unmapped (0x4) and properly paired (0x2) are both set'));
    });
  });

  describe('SAM-X003: strict paired-end bits without paired flag (warning)', () => {
    it('warns when a paired-end bit is set but 0x1 (paired) is not', () => {
      // FLAG 0x40 = 64 (first in pair) without 0x1.
      const line = 'r1\t64\tref\t7\t30\t3M\t*\t0\t0\tACG\t*';
      const diags = run(line);
      assert.ok(hasWarning(diags, 'Paired-end FLAG bits set but paired flag (0x1) is not set'));
    });
  });
});
