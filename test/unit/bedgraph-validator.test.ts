// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateBedGraph } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validateBedGraph(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

describe('validateBedGraph', () => {
  describe('fixture happy path', () => {
    it('produces no error-severity diagnostics for the real fixture', () => {
      const text = fs.readFileSync(getFixturePath('bedgraph-example'), 'utf8');
      const diags = run(text);
      const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
      assert.strictEqual(errors.length, 0, `expected no errors, got: ${JSON.stringify(errors)}`);
      // The fixture also produces zero diagnostics total.
      assert.strictEqual(diags.length, 0, `expected zero diagnostics, got: ${JSON.stringify(diags)}`);
    });
  });

  describe('skipped / ignored lines', () => {
    it('ignores blank lines', () => {
      assert.strictEqual(run('\n\n').length, 0);
    });

    it('ignores comment lines starting with #', () => {
      assert.strictEqual(run('# a comment line with only two cols').length, 0);
    });

    it('ignores track lines', () => {
      assert.strictEqual(run('track type=bedGraph name="x"').length, 0);
    });

    it('ignores browser lines', () => {
      assert.strictEqual(run('browser position chr1:1-1000').length, 0);
    });
  });

  describe('BDG-001: column count', () => {
    it('flags a line with fewer than 4 columns', () => {
      const diags = run('chr1\t0\t100');
      assert.ok(hasError(diags, 'bedGraph requires 4 columns (chrom, start, end, value), found 3'));
    });

    it('continues past a short line without running coordinate checks', () => {
      // Short line: only the column-count error fires (validator `continue`s).
      const diags = run('chr1\tabc');
      assert.strictEqual(diags.length, 1);
      assert.ok(hasError(diags, 'bedGraph requires 4 columns'));
    });
  });

  describe('BDG-002: start non-negative integer', () => {
    it('flags a non-numeric start', () => {
      const diags = run('chr1\tabc\t100\t0.5');
      assert.ok(hasError(diags, 'Start must be a non-negative integer'));
    });

    it('flags a negative start', () => {
      const diags = run('chr1\t-5\t100\t0.5');
      assert.ok(hasError(diags, 'Start must be a non-negative integer'));
    });
  });

  describe('BDG-003: end non-negative integer', () => {
    it('flags a non-numeric end', () => {
      const diags = run('chr1\t0\txyz\t0.5');
      assert.ok(hasError(diags, 'End must be a non-negative integer'));
    });

    it('flags a negative end', () => {
      const diags = run('chr1\t0\t-100\t0.5');
      assert.ok(hasError(diags, 'End must be a non-negative integer'));
    });
  });

  describe('BDG-004: start < end', () => {
    it('flags start equal to end', () => {
      const diags = run('chr1\t100\t100\t0.5');
      assert.ok(hasError(diags, 'Start must be less than end'));
    });

    it('flags start greater than end', () => {
      const diags = run('chr1\t200\t100\t0.5');
      assert.ok(hasError(diags, 'Start must be less than end'));
    });
  });

  describe('BDG-005: value must be a number', () => {
    it('flags a non-numeric value', () => {
      const diags = run('chr1\t0\t100\tNaNvalue');
      assert.ok(hasError(diags, 'Value must be a number'));
    });
  });

  describe('valid inputs', () => {
    it('accepts a single valid data line with no diagnostics', () => {
      assert.strictEqual(run('chr1\t0\t100\t0.10').length, 0);
    });

    it('accepts negative and scientific-notation values', () => {
      // parseFloat handles these; they are valid bedGraph values.
      const diags = run('chr1\t0\t100\t-2.5\nchr2\t10\t20\t1e-3');
      assert.strictEqual(diags.length, 0, `expected no diagnostics, got: ${JSON.stringify(diags)}`);
    });

    it('accepts a track header followed by valid data lines', () => {
      const text = [
        'track type=bedGraph name="x"',
        'chr1\t0\t100\t0.10',
        'chr1\t100\t200\t0.23',
      ].join('\n');
      assert.strictEqual(run(text).length, 0);
    });

    it('emits no warning-severity diagnostics (validator only emits errors)', () => {
      const diags = run('chr1\t200\t100\tbad');
      assert.ok(!hasWarning(diags, ''), 'expected no warnings');
    });
  });
});
