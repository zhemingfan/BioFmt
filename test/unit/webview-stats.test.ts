// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import {
  mean,
  sum,
  groupCount,
  topN,
  percentile,
  nL50,
} from '../../webview/src/utils/stats';

describe('stats helpers', () => {
  describe('sum', () => {
    it('sums an array of numbers', () => {
      assert.strictEqual(sum([1, 2, 3, 4]), 10);
    });

    it('returns 0 for empty', () => {
      assert.strictEqual(sum([]), 0);
    });

    it('handles negatives', () => {
      assert.strictEqual(sum([1, -2, 3]), 2);
    });
  });

  describe('mean', () => {
    it('averages an array', () => {
      assert.strictEqual(mean([1, 2, 3]), 2);
    });

    it('returns 0 for empty (by convention)', () => {
      assert.strictEqual(mean([]), 0);
    });

    it('handles one element', () => {
      assert.strictEqual(mean([5]), 5);
    });
  });

  describe('groupCount', () => {
    it('counts occurrences by key', () => {
      const result = groupCount(['a', 'b', 'a', 'c', 'b', 'a'], (x) => x);
      assert.strictEqual(result.get('a'), 3);
      assert.strictEqual(result.get('b'), 2);
      assert.strictEqual(result.get('c'), 1);
    });

    it('works with object key function', () => {
      const items = [{ ch: 'chr1' }, { ch: 'chr2' }, { ch: 'chr1' }];
      const result = groupCount(items, (x) => x.ch);
      assert.strictEqual(result.get('chr1'), 2);
      assert.strictEqual(result.get('chr2'), 1);
    });

    it('returns empty Map for empty input', () => {
      assert.strictEqual(groupCount([], (x) => x).size, 0);
    });
  });

  describe('topN', () => {
    it('returns the N largest entries sorted desc by value', () => {
      const input = [
        { label: 'a', value: 1 },
        { label: 'b', value: 5 },
        { label: 'c', value: 3 },
      ];
      const result = topN(input, 2);
      assert.deepStrictEqual(result, [
        { label: 'b', value: 5 },
        { label: 'c', value: 3 },
      ]);
    });

    it('returns all when N > length', () => {
      const input = [{ label: 'a', value: 1 }];
      assert.deepStrictEqual(topN(input, 5), input);
    });

    it('does not mutate the input', () => {
      const input = [
        { label: 'a', value: 1 },
        { label: 'b', value: 5 },
      ];
      const copy = JSON.parse(JSON.stringify(input));
      topN(input, 1);
      assert.deepStrictEqual(input, copy);
    });
  });

  describe('percentile', () => {
    it('returns median for 50th percentile', () => {
      assert.strictEqual(percentile([1, 2, 3, 4, 5], 50), 3);
    });

    it('handles 0 and 100 percentiles', () => {
      assert.strictEqual(percentile([10, 20, 30], 0), 10);
      assert.strictEqual(percentile([10, 20, 30], 100), 30);
    });

    it('returns 0 for empty input', () => {
      assert.strictEqual(percentile([], 50), 0);
    });
  });

  describe('nL50', () => {
    it('computes N50 and L50 correctly', () => {
      // lengths [10..1] sorted desc, total 55, half 27.5
      // cumulative 10, 19, 27, 34 -> first >= 27.5 is 34 at index 3
      // n50 = 7, l50 = 4
      const result = nL50([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      assert.strictEqual(result.n50, 7);
      assert.strictEqual(result.l50, 4);
    });

    it('handles single-element input', () => {
      const result = nL50([100]);
      assert.strictEqual(result.n50, 100);
      assert.strictEqual(result.l50, 1);
    });

    it('returns zeros for empty', () => {
      const result = nL50([]);
      assert.strictEqual(result.n50, 0);
      assert.strictEqual(result.l50, 0);
    });
  });
});
