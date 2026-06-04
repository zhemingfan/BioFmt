// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateFasta, validateFastq } from '../../../server/src/validators';
import { defaultSettings } from '../../../server/src/validators/types';
import type { ValidatorContext } from '../../../server/src/validators/types';
import { getFixturePath } from '../../fixtures.index';

/**
 * FASTA and FASTQ validation tests, exercising the SHIPPED validators
 * (server/src/validators/{fasta,fastq}.ts) directly.
 */

function ctx(text: string): ValidatorContext {
  return {
    uri: 'file:///test',
    lineCount: text.split('\n').length,
    headerEndLine: 0,
    bufferLines: 500,
  };
}

const runFasta = (lines: string[]): Diagnostic[] =>
  validateFasta(lines.join('\n'), defaultSettings, ctx(lines.join('\n')));
const runFastq = (lines: string[]): Diagnostic[] =>
  validateFastq(lines.join('\n'), defaultSettings, ctx(lines.join('\n')));

const hasWarning = (diags: Diagnostic[], substr: string): boolean =>
  diags.some((d) => d.severity === DiagnosticSeverity.Warning && d.message.includes(substr));
const hasError = (diags: Diagnostic[], substr: string): boolean =>
  diags.some((d) => d.severity === DiagnosticSeverity.Error && d.message.includes(substr));

// Phred quality helpers (mirroring the webview heatmap display math).
function asciiToPhred(char: string): number {
  return char.charCodeAt(0) - 33;
}
function phredToColor(phred: number): string {
  if (phred >= 30) return '#4caf50';
  if (phred >= 20) return '#ffeb3b';
  if (phred >= 10) return '#ff9800';
  return '#f44336';
}

describe('FASTA Validation', () => {
  describe('validateFasta', () => {
    it('should accept valid FASTA with single sequence', () => {
      assert.deepStrictEqual(runFasta(['>seq1 test', 'ATCGATCG', 'GCTAGCTA']), []);
    });

    it('should accept valid FASTA with multiple sequences', () => {
      assert.deepStrictEqual(runFasta(['>seq1', 'ATCG', '>seq2', 'GCTA']), []);
    });

    it('should accept all IUPAC ambiguity codes', () => {
      assert.deepStrictEqual(runFasta(['>seq', 'ATCGURYSWKMBDHVNatcguryswkmbdhvn']), []);
    });

    it('should accept gap characters', () => {
      assert.deepStrictEqual(runFasta(['>seq', 'ATCG-.*GCTA']), []);
    });

    it('should skip comment lines starting with ;', () => {
      assert.deepStrictEqual(runFasta(['; comment', '>seq1', 'ATCG']), []);
    });

    it('should not flag a blank line before the first sequence', () => {
      assert.deepStrictEqual(runFasta(['', '>seq1', 'ATCG']), []);
    });

    it('should warn on a blank line within a sequence block (strict)', () => {
      assert.ok(hasWarning(runFasta(['>seq1', 'ATCG', '', 'GCTA']), 'Blank line'));
    });

    it('should not flag a trailing blank line (final newline at EOF)', () => {
      assert.deepStrictEqual(runFasta(['>seq1', 'ATCG', '']), []);
    });

    it('should warn if file does not start with > header', () => {
      const diags = runFasta(['ATCGATCG', '>seq1', 'GCTA']);
      assert.ok(hasWarning(diags, 'should start with'));
      assert.ok(diags.some((d) => d.range.start.line === 0));
    });

    it('should warn on empty header (just >)', () => {
      assert.ok(hasWarning(runFasta(['>', 'ATCG']), 'empty'));
    });

    it('should warn on invalid base characters', () => {
      assert.ok(hasWarning(runFasta(['>seq1', 'ATCG123GCTA']), 'invalid base'));
    });
  });

  describe('with fixture file', () => {
    it('should validate FASTA fixture without diagnostics', () => {
      const content = fs.readFileSync(getFixturePath('fasta-example'), 'utf-8');
      const diags = validateFasta(content, defaultSettings, ctx(content));
      assert.deepStrictEqual(diags, [], `Expected none but found: ${JSON.stringify(diags)}`);
    });

    it('should find correct number of sequences', () => {
      const content = fs.readFileSync(getFixturePath('fasta-example'), 'utf-8');
      const headers = content.split('\n').filter((l) => l.startsWith('>'));
      assert.strictEqual(headers.length, 5);
    });
  });
});

describe('FASTQ Validation', () => {
  describe('validateFastq', () => {
    it('should accept valid 4-line FASTQ record', () => {
      assert.deepStrictEqual(runFastq(['@read1', 'ATCG', '+', 'IIII']), []);
    });

    it('should accept FASTQ record with description', () => {
      assert.deepStrictEqual(runFastq(['@read1 length=36', 'ATCG', '+', 'IIII']), []);
    });

    it('should accept multiple records', () => {
      assert.deepStrictEqual(
        runFastq(['@read1', 'ATCG', '+', 'IIII', '@read2', 'GCTA', '+', 'BBBB']),
        []
      );
    });

    it('should error if record does not start with @', () => {
      assert.ok(hasError(runFastq(['read1', 'ATCG', '+', 'IIII']), '@'));
    });

    it('should error if + separator is missing', () => {
      assert.ok(hasError(runFastq(['@read1', 'ATCG', 'missing', 'IIII']), '+ separator'));
    });

    it('should error if quality length does not match sequence length', () => {
      assert.ok(hasError(runFastq(['@read1', 'ATCGATCG', '+', 'III']), 'length'));
    });

    it('should accept quality line with same length as sequence', () => {
      assert.deepStrictEqual(runFastq(['@read1', 'ATCGATCG', '+', 'IIIIIIII']), []);
    });

    it('should warn on quality characters outside the Phred range (strict)', () => {
      // A space (ASCII 32) is below the Phred+33 floor of 33.
      assert.ok(hasWarning(runFastq(['@read1', 'ATCG', '+', 'II I']), 'Phred range'));
    });
  });

  describe('with fixture file', () => {
    it('should validate FASTQ fixture without diagnostics', () => {
      const content = fs.readFileSync(getFixturePath('fastq-example'), 'utf-8');
      const diags = validateFastq(content, defaultSettings, ctx(content));
      assert.deepStrictEqual(diags, [], `Expected none but found: ${JSON.stringify(diags)}`);
    });

    it('should find correct number of reads', () => {
      const content = fs.readFileSync(getFixturePath('fastq-example'), 'utf-8');
      const headers = content.split('\n').filter((l) => l.startsWith('@'));
      assert.strictEqual(headers.length, 8);
    });
  });
});

describe('Phred Quality Utilities', () => {
  describe('asciiToPhred', () => {
    it('should convert ! to 0', () => {
      assert.strictEqual(asciiToPhred('!'), 0);
    });

    it('should convert I to 40', () => {
      assert.strictEqual(asciiToPhred('I'), 40);
    });

    it('should convert ~ to 93 (max Phred+33)', () => {
      assert.strictEqual(asciiToPhred('~'), 93);
    });

    it('should convert 5 to 20', () => {
      assert.strictEqual(asciiToPhred('5'), 20);
    });

    it('should convert # to 2', () => {
      assert.strictEqual(asciiToPhred('#'), 2);
    });
  });

  describe('phredToColor', () => {
    it('should return green for high quality (>=30)', () => {
      assert.strictEqual(phredToColor(30), '#4caf50');
      assert.strictEqual(phredToColor(40), '#4caf50');
    });

    it('should return yellow for good quality (20-29)', () => {
      assert.strictEqual(phredToColor(20), '#ffeb3b');
      assert.strictEqual(phredToColor(29), '#ffeb3b');
    });

    it('should return orange for poor quality (10-19)', () => {
      assert.strictEqual(phredToColor(10), '#ff9800');
      assert.strictEqual(phredToColor(19), '#ff9800');
    });

    it('should return red for very poor quality (<10)', () => {
      assert.strictEqual(phredToColor(0), '#f44336');
      assert.strictEqual(phredToColor(9), '#f44336');
    });
  });
});
