// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validatePaf } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validatePaf(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) => d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

// A valid 12-column PAF line (tab-separated):
// qname qlen qstart qend strand tname tlen tstart tend matches alnlen mapq
const validLine = ['query1', '1000', '0', '900', '+', 'targetA', '2000', '100', '1000', '800', '900', '60'].join('\t');

describe('validatePaf', () => {
  it('produces no error diagnostics on the real fixture', () => {
    const text = fs.readFileSync(getFixturePath('paf-example'), 'utf8');
    const diags = run(text);
    const errors = diags.filter(d => d.severity === DiagnosticSeverity.Error);
    assert.deepStrictEqual(errors, [], 'fixture should produce no error-severity diagnostics');
    // The fixture also happens to produce zero diagnostics total.
    assert.strictEqual(diags.length, 0, 'fixture should produce zero diagnostics total');
  });

  it('accepts a valid 12-column line with no diagnostics', () => {
    const diags = run(validLine);
    assert.strictEqual(diags.length, 0);
  });

  it('flags lines with fewer than 12 columns (PAF-001)', () => {
    const line = ['query1', '1000', '0', '900', '+', 'targetA', '2000', '100', '1000', '800', '900'].join('\t');
    const diags = run(line);
    assert.ok(hasError(diags, 'PAF requires at least 12 columns, found 11'));
  });

  it('reports the actual column count in the < 12 column message', () => {
    const line = ['query1', '1000', '0'].join('\t');
    const diags = run(line);
    assert.ok(hasError(diags, 'PAF requires at least 12 columns, found 3'));
  });

  it('skips comment lines starting with #', () => {
    const diags = run('# this is a comment line with too few columns');
    assert.strictEqual(diags.length, 0);
  });

  it('skips blank lines', () => {
    const diags = run('   ');
    assert.strictEqual(diags.length, 0);
  });

  it('flags a non-numeric query length (numeric column rule)', () => {
    const cols = validLine.split('\t');
    cols[1] = 'abc';
    const diags = run(cols.join('\t'));
    assert.ok(hasError(diags, 'query length must be a non-negative integer'));
  });

  it('flags a negative query start (numeric column rule)', () => {
    const cols = validLine.split('\t');
    cols[2] = '-5';
    const diags = run(cols.join('\t'));
    assert.ok(hasError(diags, 'query start must be a non-negative integer'));
  });

  it('flags a non-numeric mapping quality (last numeric column)', () => {
    const cols = validLine.split('\t');
    cols[11] = 'NA';
    const diags = run(cols.join('\t'));
    assert.ok(hasError(diags, 'mapping quality must be a non-negative integer'));
  });

  it('flags a non-numeric target length', () => {
    const cols = validLine.split('\t');
    cols[6] = 'x';
    const diags = run(cols.join('\t'));
    assert.ok(hasError(diags, 'target length must be a non-negative integer'));
  });

  it('flags an invalid strand value', () => {
    const cols = validLine.split('\t');
    cols[4] = '*';
    const diags = run(cols.join('\t'));
    assert.ok(hasError(diags, 'Invalid strand "*" (expected +, -)'));
  });

  it('accepts both + and - strands', () => {
    const cols = validLine.split('\t');
    cols[4] = '-';
    const diags = run(cols.join('\t'));
    assert.strictEqual(diags.length, 0);
  });

  it('warns when query start >= query end (PAF-004)', () => {
    const cols = validLine.split('\t');
    cols[2] = '900';
    cols[3] = '900';
    const diags = run(cols.join('\t'));
    assert.ok(hasWarning(diags, 'Query start should be less than query end'));
  });

  it('warns when query start > query end (PAF-004)', () => {
    const cols = validLine.split('\t');
    cols[2] = '950';
    cols[3] = '900';
    const diags = run(cols.join('\t'));
    assert.ok(hasWarning(diags, 'Query start should be less than query end'));
  });

  it('warns when target start >= target end (PAF-005)', () => {
    const cols = validLine.split('\t');
    cols[7] = '1000';
    cols[8] = '1000';
    const diags = run(cols.join('\t'));
    assert.ok(hasWarning(diags, 'Target start should be less than target end'));
  });

  it('does not warn on coordinate ordering when valid', () => {
    const diags = run(validLine);
    assert.ok(!hasWarning(diags, 'Query start should be less than query end'));
    assert.ok(!hasWarning(diags, 'Target start should be less than target end'));
  });

  it('decimal-looking numeric values are accepted because parseInt truncates', () => {
    // parseInt('900.5') === 900, so this is treated as a valid non-negative integer.
    const cols = validLine.split('\t');
    cols[1] = '1000.5';
    const diags = run(cols.join('\t'));
    assert.ok(!hasError(diags, 'query length must be a non-negative integer'));
  });
});
