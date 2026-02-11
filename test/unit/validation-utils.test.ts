// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

// Import the validation utilities directly
import {
  getColumnOffset,
  createColumnDiagnostic,
  createLineDiagnostic,
  validateNumericColumns,
  validateCoordinatePair,
  validateStrand,
  shouldSkipLine,
} from '../../server/src/validationUtils';

describe('Validation Utilities', () => {
  describe('getColumnOffset', () => {
    it('should return 0 for first column', () => {
      assert.strictEqual(getColumnOffset(['chr1', '100', '200'], 0), 0);
    });

    it('should return correct offset for second column', () => {
      // "chr1\t" has length 5, so column 1 starts at 5
      assert.strictEqual(getColumnOffset(['chr1', '100', '200'], 1), 5);
    });

    it('should return correct offset for third column', () => {
      // "chr1\t100\t" -> column 2 starts at 9
      assert.strictEqual(getColumnOffset(['chr1', '100', '200'], 2), 9);
    });
  });

  describe('createColumnDiagnostic', () => {
    it('should create diagnostic at correct column position', () => {
      const columns = ['chr1', '100', '200'];
      const diag = createColumnDiagnostic(5, columns, 1, 'test error');

      assert.strictEqual(diag.range.start.line, 5);
      assert.strictEqual(diag.range.start.character, 5); // "chr1\t"
      assert.strictEqual(diag.range.end.character, 8); // "chr1\t100"
      assert.strictEqual(diag.message, 'test error');
      assert.strictEqual(diag.severity, DiagnosticSeverity.Error);
      assert.strictEqual(diag.source, 'biofmt');
    });

    it('should support custom severity', () => {
      const columns = ['a', 'b'];
      const diag = createColumnDiagnostic(0, columns, 0, 'warn', DiagnosticSeverity.Warning);
      assert.strictEqual(diag.severity, DiagnosticSeverity.Warning);
    });
  });

  describe('createLineDiagnostic', () => {
    it('should span the entire line', () => {
      const lineText = 'chr1\t100\t200';
      const diag = createLineDiagnostic(3, lineText, 'line error');

      assert.strictEqual(diag.range.start.line, 3);
      assert.strictEqual(diag.range.start.character, 0);
      assert.strictEqual(diag.range.end.character, lineText.length);
      assert.strictEqual(diag.message, 'line error');
      assert.strictEqual(diag.source, 'biofmt');
    });
  });

  describe('validateNumericColumns', () => {
    it('should accept valid non-negative integers', () => {
      const diagnostics: Diagnostic[] = [];
      const columns = ['chr1', '0', '100', '200'];
      validateNumericColumns(0, columns, [
        { idx: 1, name: 'start' },
        { idx: 2, name: 'end' },
      ], diagnostics);

      assert.strictEqual(diagnostics.length, 0);
    });

    it('should reject negative values', () => {
      const diagnostics: Diagnostic[] = [];
      const columns = ['chr1', '-5', '100'];
      validateNumericColumns(0, columns, [
        { idx: 1, name: 'start' },
      ], diagnostics);

      assert.strictEqual(diagnostics.length, 1);
      assert.ok(diagnostics[0].message.includes('start'));
      assert.ok(diagnostics[0].message.includes('non-negative'));
    });

    it('should reject non-numeric values', () => {
      const diagnostics: Diagnostic[] = [];
      const columns = ['chr1', 'abc', '100'];
      validateNumericColumns(0, columns, [
        { idx: 1, name: 'position' },
      ], diagnostics);

      assert.strictEqual(diagnostics.length, 1);
      assert.ok(diagnostics[0].message.includes('position'));
    });

    it('should skip columns beyond array bounds', () => {
      const diagnostics: Diagnostic[] = [];
      const columns = ['chr1', '100'];
      validateNumericColumns(0, columns, [
        { idx: 5, name: 'missing' },
      ], diagnostics);

      assert.strictEqual(diagnostics.length, 0);
    });

    it('should report multiple invalid columns', () => {
      const diagnostics: Diagnostic[] = [];
      const columns = ['chr1', 'x', 'y'];
      validateNumericColumns(0, columns, [
        { idx: 1, name: 'start' },
        { idx: 2, name: 'end' },
      ], diagnostics);

      assert.strictEqual(diagnostics.length, 2);
    });
  });

  describe('validateCoordinatePair', () => {
    it('should accept valid start < end', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\t100\t200', ['chr1', '100', '200'], 1, 2, 'Start', 'End', diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });

    it('should reject start >= end (strict mode)', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\t200\t100', ['chr1', '200', '100'], 1, 2, 'Start', 'End', diagnostics);
      assert.strictEqual(diagnostics.length, 1);
      assert.ok(diagnostics[0].message.includes('less than'));
    });

    it('should reject start == end in strict mode', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\t100\t100', ['chr1', '100', '100'], 1, 2, 'Start', 'End', diagnostics);
      assert.strictEqual(diagnostics.length, 1);
    });

    it('should accept start == end with allowEqual', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\t100\t100', ['chr1', '100', '100'], 1, 2, 'Start', 'End', diagnostics, true);
      assert.strictEqual(diagnostics.length, 0);
    });

    it('should reject start > end with allowEqual', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\t200\t100', ['chr1', '200', '100'], 1, 2, 'Start', 'End', diagnostics, true);
      assert.strictEqual(diagnostics.length, 1);
      assert.ok(diagnostics[0].message.includes('greater than'));
    });

    it('should skip when values are NaN', () => {
      const diagnostics: Diagnostic[] = [];
      validateCoordinatePair(0, 'chr1\tabc\t100', ['chr1', 'abc', '100'], 1, 2, 'Start', 'End', diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });
  });

  describe('validateStrand', () => {
    const validStrands = new Set(['+', '-', '.']);

    it('should accept valid strand +', () => {
      const diagnostics: Diagnostic[] = [];
      validateStrand(0, ['chr1', '100', '200', '+'], 3, validStrands, diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });

    it('should accept valid strand -', () => {
      const diagnostics: Diagnostic[] = [];
      validateStrand(0, ['chr1', '100', '200', '-'], 3, validStrands, diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });

    it('should accept valid strand .', () => {
      const diagnostics: Diagnostic[] = [];
      validateStrand(0, ['chr1', '100', '200', '.'], 3, validStrands, diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });

    it('should reject invalid strand', () => {
      const diagnostics: Diagnostic[] = [];
      validateStrand(0, ['chr1', '100', '200', 'X'], 3, validStrands, diagnostics);
      assert.strictEqual(diagnostics.length, 1);
      assert.ok(diagnostics[0].message.includes('Invalid strand'));
      assert.ok(diagnostics[0].message.includes('X'));
    });

    it('should skip when column index is out of bounds', () => {
      const diagnostics: Diagnostic[] = [];
      validateStrand(0, ['chr1', '100'], 5, validStrands, diagnostics);
      assert.strictEqual(diagnostics.length, 0);
    });
  });

  describe('shouldSkipLine', () => {
    it('should skip empty lines', () => {
      assert.strictEqual(shouldSkipLine(''), true);
      assert.strictEqual(shouldSkipLine('   '), true);
    });

    it('should skip comment lines', () => {
      assert.strictEqual(shouldSkipLine('# comment'), true);
      assert.strictEqual(shouldSkipLine('#header'), true);
    });

    it('should not skip data lines', () => {
      assert.strictEqual(shouldSkipLine('chr1\t100\t200'), false);
    });

    it('should skip additional prefixes', () => {
      assert.strictEqual(shouldSkipLine('track name="test"', ['track', 'browser']), true);
      assert.strictEqual(shouldSkipLine('browser position chr1:1', ['track', 'browser']), true);
    });

    it('should not skip non-matching prefixes', () => {
      assert.strictEqual(shouldSkipLine('chr1\t100\t200', ['track', 'browser']), false);
    });
  });
});
