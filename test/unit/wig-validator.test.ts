// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateWig } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validateWig(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

describe('validateWig', () => {
  describe('fixture happy path', () => {
    it('produces no error-severity diagnostics for the real fixture', () => {
      const text = fs.readFileSync(getFixturePath('wig-example'), 'utf8');
      const diags = run(text);
      const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
      assert.deepStrictEqual(errors, [], `unexpected errors: ${JSON.stringify(errors)}`);
    });
  });

  describe('fixedStep declaration rules', () => {
    it('flags missing chrom parameter (WIG-001)', () => {
      const d = run('fixedStep start=1 step=10\n5');
      assert.ok(hasError(d, 'fixedStep requires chrom parameter'));
    });

    it('flags missing start parameter (WIG-002)', () => {
      const d = run('fixedStep chrom=chr1 step=10\n5');
      assert.ok(hasError(d, 'fixedStep requires start parameter'));
    });

    it('flags missing step parameter (WIG-003)', () => {
      const d = run('fixedStep chrom=chr1 start=1\n5');
      assert.ok(hasError(d, 'fixedStep requires step parameter'));
    });

    it('flags non-positive step value (WIG-004)', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=0\n5');
      assert.ok(hasError(d, 'step must be a positive integer'));
    });

    it('warns on non-positive span value (WIG-005)', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=10 span=0\n5');
      assert.ok(hasWarning(d, 'span should be a positive integer'));
    });

    it('accepts a complete fixedStep declaration with positive span', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=10 span=5\n5');
      assert.deepStrictEqual(d, []);
    });
  });

  describe('variableStep declaration rules', () => {
    it('flags missing chrom parameter (WIG-006)', () => {
      const d = run('variableStep span=10\n100 5.0');
      assert.ok(hasError(d, 'variableStep requires chrom parameter'));
    });

    it('accepts a complete variableStep declaration', () => {
      const d = run('variableStep chrom=chr1 span=10\n100 5.0');
      assert.deepStrictEqual(d, []);
    });
  });

  describe('fixedStep data line rules', () => {
    it('warns when a fixedStep data line has more than one value (WIG-007)', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=10\n5 6');
      assert.ok(hasWarning(d, 'fixedStep data lines should have exactly one value'));
    });

    it('flags a non-numeric fixedStep value (WIG-008)', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=10\nabc');
      assert.ok(hasError(d, 'Invalid numeric value'));
    });

    it('accepts a numeric fixedStep data line', () => {
      const d = run('fixedStep chrom=chr1 start=1 step=10\n42.5');
      assert.deepStrictEqual(d, []);
    });
  });

  describe('variableStep data line rules', () => {
    it('flags a variableStep data line missing the value (WIG-009)', () => {
      const d = run('variableStep chrom=chr1\n100');
      assert.ok(hasError(d, 'variableStep data lines require position and value'));
    });

    it('flags a negative position (WIG-010)', () => {
      const d = run('variableStep chrom=chr1\n-5 10.0');
      assert.ok(hasError(d, 'Position must be a non-negative integer'));
    });

    it('flags a non-integer position (WIG-010)', () => {
      const d = run('variableStep chrom=chr1\nxyz 10.0');
      assert.ok(hasError(d, 'Position must be a non-negative integer'));
    });

    it('flags a non-numeric variableStep value (WIG-008)', () => {
      const d = run('variableStep chrom=chr1\n100 notanumber');
      assert.ok(hasError(d, 'Invalid numeric value'));
    });

    it('accepts a valid variableStep data line', () => {
      const d = run('variableStep chrom=chr1\n100 12.5');
      assert.deepStrictEqual(d, []);
    });
  });

  describe('skipped lines', () => {
    it('ignores comments, blank lines, and track lines', () => {
      const d = run('# a comment\n\ntrack type=wiggle_0 name="t"');
      assert.deepStrictEqual(d, []);
    });

    it('does not validate data lines that precede any step declaration', () => {
      // Without a prior fixedStep/variableStep, data lines fall through both
      // branches and produce no diagnostics.
      const d = run('100 5.0\nabc\n-1');
      assert.deepStrictEqual(d, []);
    });
  });
});
