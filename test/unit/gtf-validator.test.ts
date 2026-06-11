// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateGtf } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validateGtf(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) =>
  d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) =>
  d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

// A fully valid GTF data line: 9 tab-separated columns with gene_id and transcript_id.
const VALID_LINE =
  'chr19\tensembl_havana\texon\t44905796\t44905841\t.\t+\t.\tgene_id "ENSG00000130203.10"; transcript_id "ENST00000252486.9";';

describe('validateGtf', () => {
  it('fixture happy-path: produces no error-severity diagnostics', () => {
    const text = fs.readFileSync(getFixturePath('gtf-example'), 'utf8');
    const diagnostics = run(text);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no error-severity diagnostics, got: ${JSON.stringify(errors.map(e => e.message))}`
    );
  });

  it('accepts a fully valid GTF line with no diagnostics', () => {
    const diagnostics = run(VALID_LINE);
    assert.strictEqual(
      diagnostics.length,
      0,
      `Expected no diagnostics, got: ${JSON.stringify(diagnostics.map(e => e.message))}`
    );
  });

  it('skips empty lines and comment (#) lines', () => {
    const text = '# this is a comment\n\n' + VALID_LINE;
    const diagnostics = run(text);
    assert.strictEqual(diagnostics.length, 0);
  });

  // GTF-001: fewer than 9 columns -> Error
  it('flags lines with fewer than 9 columns (GTF-001)', () => {
    const line = 'chr19\tsrc\texon\t100\t200\t.\t+\t.'; // only 8 columns
    const diagnostics = run(line);
    assert.ok(hasError(diagnostics, 'GTF requires 9 columns, found 8'));
  });

  // GTF-002: non-integer start/end -> Error
  it('flags non-integer start/end positions (GTF-002)', () => {
    const line =
      'chr19\tsrc\texon\tABC\t200\t.\t+\t.\tgene_id "g"; transcript_id "t";';
    const diagnostics = run(line);
    assert.ok(hasError(diagnostics, 'Start and end positions must be integers'));
  });

  // GTF-003: start > end -> Error
  it('flags start greater than end (GTF-003)', () => {
    const line =
      'chr19\tsrc\texon\t500\t200\t.\t+\t.\tgene_id "g"; transcript_id "t";';
    const diagnostics = run(line);
    assert.ok(hasError(diagnostics, 'Start position cannot be greater than end position'));
  });

  // GTF-004 (validateStrand): invalid strand -> Error
  it('flags an invalid strand value (validateStrand)', () => {
    const line =
      'chr19\tsrc\texon\t100\t200\t.\tX\t.\tgene_id "g"; transcript_id "t";';
    const diagnostics = run(line);
    assert.ok(hasError(diagnostics, 'Invalid strand "X"'));
  });

  // GTF-005: invalid frame -> Error
  it('flags an invalid frame value (GTF-005)', () => {
    const line =
      'chr19\tsrc\tCDS\t100\t200\t.\t+\t9\tgene_id "g"; transcript_id "t";';
    const diagnostics = run(line);
    assert.ok(hasError(diagnostics, 'Invalid frame "9" (expected 0, 1, 2, or .)'));
  });

  // GTF-006: attributes without quotes -> Warning
  it('warns when attributes are not in key "value" format (GTF-006)', () => {
    const line =
      'chr19\tsrc\texon\t100\t200\t.\t+\t.\tgene_id ENSG; transcript_id ENST;';
    const diagnostics = run(line);
    assert.ok(hasWarning(diagnostics, 'GTF attributes should be in format: key "value";'));
  });

  // GTF-S001 (strict): non-numeric score -> Warning
  it('warns on non-numeric score in strict mode (GTF-S001)', () => {
    const line =
      'chr19\tsrc\texon\t100\t200\tbad\t+\t.\tgene_id "g"; transcript_id "t";';
    const diagnostics = run(line);
    assert.ok(hasWarning(diagnostics, 'Score must be numeric or "."'));
  });

  it('accepts "." score without a score warning in strict mode', () => {
    const diagnostics = run(VALID_LINE);
    assert.ok(!hasWarning(diagnostics, 'Score must be numeric'));
  });

  // GTF-S002 (strict): attributes missing gene_id -> Warning
  it('warns when attributes are missing gene_id in strict mode (GTF-S002)', () => {
    const line =
      'chr19\tsrc\texon\t100\t200\t.\t+\t.\ttranscript_id "t"; other_key "v";';
    const diagnostics = run(line);
    assert.ok(hasWarning(diagnostics, 'GTF attributes must contain gene_id'));
  });

  // GTF-S003 (strict): attributes missing transcript_id -> Warning
  it('warns when attributes are missing transcript_id in strict mode (GTF-S003)', () => {
    const line =
      'chr19\tsrc\tgene\t100\t200\t.\t+\t.\tgene_id "g"; gene_name "n";';
    const diagnostics = run(line);
    assert.ok(hasWarning(diagnostics, 'GTF attributes must contain transcript_id'));
  });

  it('does not emit strict-mode score/attribute warnings when level is basic', () => {
    const line =
      'chr19\tsrc\texon\t100\t200\tbad\t+\t.\tgene_id "g";'; // bad score, missing transcript_id
    const basicSettings = {
      ...defaultSettings,
      validation: { ...defaultSettings.validation, level: 'basic' as const },
    };
    const diagnostics = validateGtf(line, basicSettings, ctx(line));
    assert.ok(!hasWarning(diagnostics, 'Score must be numeric'));
    assert.ok(!hasWarning(diagnostics, 'GTF attributes must contain transcript_id'));
  });

  it('treats "." attributes column as valid (no attribute warnings)', () => {
    const line = 'chr19\tsrc\texon\t100\t200\t.\t+\t.\t.';
    const diagnostics = run(line);
    assert.ok(!hasWarning(diagnostics, 'GTF attributes should be in format'));
    assert.ok(!hasWarning(diagnostics, 'GTF attributes must contain gene_id'));
    assert.ok(!hasWarning(diagnostics, 'GTF attributes must contain transcript_id'));
  });
});
