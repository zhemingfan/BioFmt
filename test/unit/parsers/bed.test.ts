// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { getFixturePath } from '../../fixtures.index';

/**
 * BED and BEDPE Validation Tests
 *
 * Tests the validation logic for BED (Browser Extensible Data) and
 * BEDPE (Paired-End BED) formats.
 */

// Simplified validation functions extracted from server for testing
interface ValidationDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

function validateBedLine(line: string, lineNumber: number): ValidationDiagnostic | null {
  // Skip empty lines, track lines, browser lines, and comments
  if (!line.trim() || line.startsWith('track') || line.startsWith('browser') || line.startsWith('#')) {
    return null;
  }

  const columns = line.split('\t');

  if (columns.length < 3) {
    return {
      line: lineNumber,
      message: 'BED format requires at least 3 columns (chrom, start, end)',
      severity: 'error',
    };
  }

  const start = parseInt(columns[1], 10);
  const end = parseInt(columns[2], 10);

  if (isNaN(start) || isNaN(end)) {
    return {
      line: lineNumber,
      message: 'Start and end positions must be integers',
      severity: 'error',
    };
  }

  if (start < 0) {
    return {
      line: lineNumber,
      message: 'Start position cannot be negative',
      severity: 'error',
    };
  }

  if (start >= end) {
    return {
      line: lineNumber,
      message: 'Start position must be less than end position',
      severity: 'error',
    };
  }

  return null;
}

function validateBedpeLine(line: string, lineNumber: number): ValidationDiagnostic | null {
  // Skip empty lines, comments, and header lines
  if (!line.trim() || line.startsWith('#')) {
    return null;
  }

  const columns = line.split('\t');

  if (columns.length < 6) {
    return {
      line: lineNumber,
      message: 'BEDPE format requires at least 6 columns (chrom1, start1, end1, chrom2, start2, end2)',
      severity: 'error',
    };
  }

  // Validate first coordinate pair
  const start1 = parseInt(columns[1], 10);
  const end1 = parseInt(columns[2], 10);

  if (isNaN(start1) || isNaN(end1)) {
    return {
      line: lineNumber,
      message: 'start1 and end1 positions must be integers',
      severity: 'error',
    };
  }

  // Validate second coordinate pair
  const start2 = parseInt(columns[4], 10);
  const end2 = parseInt(columns[5], 10);

  if (isNaN(start2) || isNaN(end2)) {
    return {
      line: lineNumber,
      message: 'start2 and end2 positions must be integers',
      severity: 'error',
    };
  }

  if (start1 < 0 || start2 < 0) {
    return {
      line: lineNumber,
      message: 'Start positions cannot be negative',
      severity: 'error',
    };
  }

  if (end1 < start1 || end2 < start2) {
    return {
      line: lineNumber,
      message: 'End position must be >= start position',
      severity: 'error',
    };
  }

  // Validate strand fields if present (columns 9 and 10)
  if (columns.length >= 10) {
    const strand1 = columns[8];
    const strand2 = columns[9];
    const validStrands = ['+', '-', '.'];

    if (!validStrands.includes(strand1) || !validStrands.includes(strand2)) {
      return {
        line: lineNumber,
        message: 'Strand fields should be +, -, or .',
        severity: 'warning',
      };
    }
  }

  return null;
}

describe('BED Validation', () => {
  describe('validateBedLine', () => {
    it('should accept valid BED3 line', () => {
      const result = validateBedLine('chr1\t100\t200', 0);
      assert.strictEqual(result, null);
    });

    it('should accept valid BED6 line', () => {
      const result = validateBedLine('chr1\t100\t200\tfeature1\t500\t+', 0);
      assert.strictEqual(result, null);
    });

    it('should accept valid BED12 line', () => {
      const result = validateBedLine('chr1\t100\t200\tfeature1\t500\t+\t100\t200\t0\t1\t100\t0', 0);
      assert.strictEqual(result, null);
    });

    it('should skip empty lines', () => {
      const result = validateBedLine('', 0);
      assert.strictEqual(result, null);
    });

    it('should skip comment lines', () => {
      const result = validateBedLine('#chrom\tchromStart\tchromEnd', 0);
      assert.strictEqual(result, null);
    });

    it('should skip track lines', () => {
      const result = validateBedLine('track name="test"', 0);
      assert.strictEqual(result, null);
    });

    it('should skip browser lines', () => {
      const result = validateBedLine('browser position chr1:1-1000', 0);
      assert.strictEqual(result, null);
    });

    it('should reject lines with fewer than 3 columns', () => {
      const result = validateBedLine('chr1\t100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('at least 3 columns'));
    });

    it('should reject non-integer start position', () => {
      const result = validateBedLine('chr1\tabc\t200', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('integers'));
    });

    it('should reject non-integer end position', () => {
      const result = validateBedLine('chr1\t100\txyz', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('integers'));
    });

    it('should reject negative start position', () => {
      const result = validateBedLine('chr1\t-10\t200', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('negative'));
    });

    it('should reject start >= end', () => {
      const result = validateBedLine('chr1\t200\t100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('less than'));
    });

    it('should reject start == end', () => {
      const result = validateBedLine('chr1\t100\t100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
    });
  });

  describe('with fixture file', () => {
    it('should validate BED fixture file without errors on first 10 lines', () => {
      const content = fs.readFileSync(getFixturePath('bed-example'), 'utf-8');
      const lines = content.split('\n').slice(0, 10);

      for (let i = 0; i < lines.length; i++) {
        const result = validateBedLine(lines[i], i);
        assert.strictEqual(result, null, `Line ${i + 1} should be valid: ${lines[i]}`);
      }
    });
  });
});

describe('BEDPE Validation', () => {
  describe('validateBedpeLine', () => {
    it('should accept valid BEDPE line with 10 columns', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000\t1100\tpair1\t50\t+\t-', 0);
      assert.strictEqual(result, null);
    });

    it('should accept valid BEDPE line with 6 columns (minimum)', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr2\t500\t600', 0);
      assert.strictEqual(result, null);
    });

    it('should accept BEDPE with dot placeholders for strand', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000\t1100\tpair\t.\t.\t.', 0);
      assert.strictEqual(result, null);
    });

    it('should skip empty lines', () => {
      const result = validateBedpeLine('', 0);
      assert.strictEqual(result, null);
    });

    it('should skip comment/header lines', () => {
      const result = validateBedpeLine('#chrom1\tstart1\tend1\tchrom2\tstart2\tend2', 0);
      assert.strictEqual(result, null);
    });

    it('should reject lines with fewer than 6 columns', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('at least 6 columns'));
    });

    it('should reject non-integer start1', () => {
      const result = validateBedpeLine('chr1\tabc\t200\tchr1\t1000\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('start1'));
    });

    it('should reject non-integer end1', () => {
      const result = validateBedpeLine('chr1\t100\txyz\tchr1\t1000\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('end1'));
    });

    it('should reject non-integer start2', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\tabc\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('start2'));
    });

    it('should reject non-integer end2', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000\txyz', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('end2'));
    });

    it('should reject negative start1', () => {
      const result = validateBedpeLine('chr1\t-10\t200\tchr1\t1000\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('negative'));
    });

    it('should reject negative start2', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t-10\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('negative'));
    });

    it('should reject end1 < start1', () => {
      const result = validateBedpeLine('chr1\t200\t100\tchr1\t1000\t1100', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('start'));
    });

    it('should reject end2 < start2', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1100\t1000', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'error');
      assert.ok(result!.message.includes('start'));
    });

    it('should accept end == start (point features)', () => {
      // BEDPE allows end == start for point features
      const result = validateBedpeLine('chr1\t100\t100\tchr1\t1000\t1000', 0);
      assert.strictEqual(result, null);
    });

    it('should warn on invalid strand1', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000\t1100\tpair\t50\tX\t-', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'warning');
      assert.ok(result!.message.includes('Strand'));
    });

    it('should warn on invalid strand2', () => {
      const result = validateBedpeLine('chr1\t100\t200\tchr1\t1000\t1100\tpair\t50\t+\tY', 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.severity, 'warning');
      assert.ok(result!.message.includes('Strand'));
    });
  });

  describe('with fixture file', () => {
    it('should validate BEDPE fixture file without errors', () => {
      const content = fs.readFileSync(getFixturePath('bedpe-example'), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const result = validateBedpeLine(lines[i], i);
        assert.strictEqual(result, null, `Line ${i + 1} should be valid: ${lines[i]}`);
      }
    });
  });
});

describe('Edge Cases', () => {
  it('should handle BED with very large coordinates', () => {
    const result = validateBedLine('chr1\t100000000\t200000000', 0);
    assert.strictEqual(result, null);
  });

  it('should handle BEDPE with inter-chromosomal pairs', () => {
    const result = validateBedpeLine('chr1\t100\t200\tchr2\t500\t600\ttranslocation\t100\t+\t-', 0);
    assert.strictEqual(result, null);
  });

  it('should handle BED with tabs and spaces mixed', () => {
    // Only tabs are valid separators - spaces should cause issues
    const result = validateBedLine('chr1\t100 200', 0);
    // This should fail because "100 200" is not a valid integer
    assert.notStrictEqual(result, null);
  });

  it('should handle BEDPE with only required columns', () => {
    const result = validateBedpeLine('chr1\t0\t1\tchr1\t0\t1', 0);
    assert.strictEqual(result, null);
  });
});
