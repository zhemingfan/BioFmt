// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { getFixturePath } from '../../fixtures.index';

/**
 * FASTA and FASTQ Validation Tests
 */

interface ValidationDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

// Simplified FASTA validation matching server logic
function validateFastaLines(lines: string[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const validBases = /^[ACGTUNRYSWKMBDHVacgtunryswkmbdhv.*\-\s]+$/;
  let sawHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    if (trimmed.startsWith('>')) {
      sawHeader = true;
      if (trimmed.length < 2) {
        diagnostics.push({ line: i, message: 'FASTA header is empty', severity: 'warning' });
      }
      continue;
    }

    if (!sawHeader && i === 0) {
      diagnostics.push({ line: i, message: 'FASTA file should start with a header line (>)', severity: 'warning' });
    }

    if (!validBases.test(trimmed)) {
      diagnostics.push({ line: i, message: 'Line contains invalid base characters', severity: 'warning' });
    }
  }

  return diagnostics;
}

// Simplified FASTQ validation matching server logic
function validateFastqLines(lines: string[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (let i = 0; i + 3 < lines.length; i += 4) {
    const headerLine = lines[i].trim();
    const seqLine = lines[i + 1]?.trim();
    const plusLine = lines[i + 2]?.trim();
    const qualLine = lines[i + 3]?.trim();

    if (!headerLine) { i -= 3; continue; }

    if (!headerLine.startsWith('@')) {
      diagnostics.push({ line: i, message: 'FASTQ record should start with @', severity: 'error' });
      break;
    }

    if (!plusLine || !plusLine.startsWith('+')) {
      diagnostics.push({ line: i + 2, message: 'Expected + separator', severity: 'error' });
    }

    if (seqLine && qualLine && seqLine.length !== qualLine.length) {
      diagnostics.push({
        line: i + 3,
        message: `Quality length (${qualLine.length}) != sequence length (${seqLine.length})`,
        severity: 'error',
      });
    }
  }

  return diagnostics;
}

// Phred quality helpers (matching webview utils)
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
  describe('validateFastaLines', () => {
    it('should accept valid FASTA with single sequence', () => {
      const lines = ['>seq1 test', 'ATCGATCG', 'GCTAGCTA'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should accept valid FASTA with multiple sequences', () => {
      const lines = ['>seq1', 'ATCG', '>seq2', 'GCTA'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should accept all IUPAC ambiguity codes', () => {
      const lines = ['>seq', 'ATCGURYSWKMBDHVNatcguryswkmbdhvn'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should accept gap characters', () => {
      const lines = ['>seq', 'ATCG-.*GCTA'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should skip comment lines starting with ;', () => {
      const lines = ['; comment', '>seq1', 'ATCG'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should skip empty lines', () => {
      const lines = ['>seq1', 'ATCG', '', 'GCTA'];
      assert.deepStrictEqual(validateFastaLines(lines), []);
    });

    it('should warn if file does not start with > header', () => {
      const lines = ['ATCGATCG', '>seq1', 'GCTA'];
      const diags = validateFastaLines(lines);
      assert.strictEqual(diags.length, 1);
      assert.strictEqual(diags[0].line, 0);
      assert.ok(diags[0].message.includes('should start with'));
    });

    it('should warn on empty header (just >)', () => {
      const lines = ['>', 'ATCG'];
      const diags = validateFastaLines(lines);
      assert.strictEqual(diags.length, 1);
      assert.ok(diags[0].message.includes('empty'));
    });

    it('should warn on invalid base characters', () => {
      const lines = ['>seq1', 'ATCG123GCTA'];
      const diags = validateFastaLines(lines);
      assert.strictEqual(diags.length, 1);
      assert.ok(diags[0].message.includes('invalid base'));
    });
  });

  describe('with fixture file', () => {
    it('should validate FASTA fixture without errors', () => {
      const content = fs.readFileSync(getFixturePath('fasta-example'), 'utf-8');
      const lines = content.split('\n');
      const diags = validateFastaLines(lines);
      assert.strictEqual(diags.length, 0, `Expected no errors but found: ${JSON.stringify(diags)}`);
    });

    it('should find correct number of sequences', () => {
      const content = fs.readFileSync(getFixturePath('fasta-example'), 'utf-8');
      const lines = content.split('\n');
      const headers = lines.filter(l => l.startsWith('>'));
      assert.strictEqual(headers.length, 5);
    });
  });
});

describe('FASTQ Validation', () => {
  describe('validateFastqLines', () => {
    it('should accept valid 4-line FASTQ record', () => {
      const lines = ['@read1', 'ATCG', '+', 'IIII'];
      assert.deepStrictEqual(validateFastqLines(lines), []);
    });

    it('should accept FASTQ record with description', () => {
      const lines = ['@read1 length=36', 'ATCG', '+', 'IIII'];
      assert.deepStrictEqual(validateFastqLines(lines), []);
    });

    it('should accept multiple records', () => {
      const lines = [
        '@read1', 'ATCG', '+', 'IIII',
        '@read2', 'GCTA', '+', 'BBBB',
      ];
      assert.deepStrictEqual(validateFastqLines(lines), []);
    });

    it('should error if record does not start with @', () => {
      const lines = ['read1', 'ATCG', '+', 'IIII'];
      const diags = validateFastqLines(lines);
      assert.strictEqual(diags.length, 1);
      assert.ok(diags[0].message.includes('@'));
    });

    it('should error if + separator is missing', () => {
      const lines = ['@read1', 'ATCG', 'missing', 'IIII'];
      const diags = validateFastqLines(lines);
      assert.ok(diags.length >= 1);
      assert.ok(diags.some(d => d.message.includes('+ separator')));
    });

    it('should error if quality length does not match sequence length', () => {
      const lines = ['@read1', 'ATCGATCG', '+', 'III'];
      const diags = validateFastqLines(lines);
      assert.ok(diags.length >= 1);
      assert.ok(diags.some(d => d.message.includes('length')));
    });

    it('should accept quality line with same length as sequence', () => {
      const lines = ['@read1', 'ATCGATCG', '+', 'IIIIIIII'];
      assert.deepStrictEqual(validateFastqLines(lines), []);
    });
  });

  describe('with fixture file', () => {
    it('should validate FASTQ fixture without errors', () => {
      const content = fs.readFileSync(getFixturePath('fastq-example'), 'utf-8');
      const lines = content.split('\n');
      const diags = validateFastqLines(lines);
      assert.strictEqual(diags.length, 0, `Expected no errors but found: ${JSON.stringify(diags)}`);
    });

    it('should find correct number of reads', () => {
      const content = fs.readFileSync(getFixturePath('fastq-example'), 'utf-8');
      const lines = content.split('\n');
      const headers = lines.filter(l => l.startsWith('@'));
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
