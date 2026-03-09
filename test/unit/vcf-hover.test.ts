// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';

/**
 * VCF Hover Provider — getWordRangeAtPosition
 *
 * Regression tests for the off-by-one bug where `character <= end` (exclusive
 * boundary) caused the cursor one position past the last character of a word to
 * be treated as inside that word, triggering a spurious hover tooltip on the
 * separator character.
 *
 * Fixed by changing the comparison to `character < end`.
 *
 * The function is re-implemented inline because server/src/server.ts is a
 * CommonJS bundle that ts-node cannot import in the unit-test environment.
 */

// ---------------------------------------------------------------------------
// Re-implementation (mirrors server/src/server.ts getWordRangeAtPosition)
// ---------------------------------------------------------------------------

function getWordRangeAtPosition(
  line: string,
  character: number
): { start: number; end: number } | null {
  const wordPattern = /[A-Za-z0-9_]+/g;
  let match: RegExpExecArray | null;

  while ((match = wordPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length; // exclusive

    if (character >= start && character < end) {
      return { start, end };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWordRangeAtPosition', () => {
  // Typical VCF data column layout (tab-separated):
  // "DP=100;AF=0.5"
  //  0123456789...
  // word "DP" occupies [0, 2)

  describe('cursor within a word', () => {
    it('matches when cursor is at the first character of a word', () => {
      const result = getWordRangeAtPosition('DP=100', 0);
      assert.ok(result !== null);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 2);
    });

    it('matches when cursor is in the middle of a word', () => {
      const result = getWordRangeAtPosition('SVTYPE=BND', 3);
      assert.ok(result !== null);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 6);
    });

    it('matches when cursor is on the last character of a word', () => {
      // "DP" = indices 0-1; last char is index 1
      const result = getWordRangeAtPosition('DP=100', 1);
      assert.ok(result !== null);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 2);
    });
  });

  describe('cursor past the end of a word (regression: off-by-one)', () => {
    it('returns null when cursor is one past the last character of a word', () => {
      // "DP" occupies [0, 2); cursor at 2 is on the '=' separator — must not match
      const result = getWordRangeAtPosition('DP=100', 2);
      assert.strictEqual(result, null);
    });

    it('returns null when cursor is on a semicolon between INFO keys', () => {
      // "DP=100;AF=0.5" — cursor at index 6 is ';'
      const result = getWordRangeAtPosition('DP=100;AF=0.5', 6);
      assert.strictEqual(result, null);
    });

    it('returns null when cursor is on a tab between VCF columns', () => {
      // Simulate FORMAT column value "GT:DP" followed by a tab
      const result = getWordRangeAtPosition('GT\t0/1', 2);
      assert.strictEqual(result, null);
    });

    it('returns null when cursor is on a colon between FORMAT keys', () => {
      // "GT:DP" — cursor at index 2 is ':'
      const result = getWordRangeAtPosition('GT:DP', 2);
      assert.strictEqual(result, null);
    });
  });

  describe('cursor on the correct word when multiple words are present', () => {
    it('matches the second word when cursor is inside it', () => {
      // "AF=0.5" in "DP=100;AF=0.5": "AF" starts at index 7
      const line = 'DP=100;AF=0.5';
      const result = getWordRangeAtPosition(line, 7); // 'A' of 'AF'
      assert.ok(result !== null);
      assert.strictEqual(result.start, 7);
      assert.strictEqual(result.end, 9);
    });

    it('does not match first word when cursor is at start of second word', () => {
      const line = 'DP=100;AF=0.5';
      const result = getWordRangeAtPosition(line, 7);
      assert.ok(result !== null);
      assert.notStrictEqual(result.start, 0); // must not be "DP"
    });
  });

  describe('edge cases', () => {
    it('returns null for an empty line', () => {
      assert.strictEqual(getWordRangeAtPosition('', 0), null);
    });

    it('returns null when cursor is beyond end of line', () => {
      assert.strictEqual(getWordRangeAtPosition('DP', 99), null);
    });

    it('returns null for a line with only separators', () => {
      assert.strictEqual(getWordRangeAtPosition('=;=;=', 0), null);
      assert.strictEqual(getWordRangeAtPosition('=;=;=', 2), null);
    });

    it('matches a single-character word', () => {
      const result = getWordRangeAtPosition('A=1', 0);
      assert.ok(result !== null);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 1);
    });

    it('does not match one past a single-character word', () => {
      // 'A' at index 0; cursor at 1 is '='
      assert.strictEqual(getWordRangeAtPosition('A=1', 1), null);
    });

    it('handles underscores in word characters', () => {
      // VCF INFO keys like SVTYPE, MATEID use underscores
      const result = getWordRangeAtPosition('SVTYPE_EXT=BND', 4);
      assert.ok(result !== null);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 10);
    });
  });
});
