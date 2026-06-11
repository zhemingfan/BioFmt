// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { capRegionRows, DEFAULT_MAX_REGION_ROWS } from '../../src/providers/regionLimit';

describe('capRegionRows', () => {
  it('caps rows exceeding the limit and reports hasMore', () => {
    const rows = Array.from({ length: 15 }, (_, i) => i);
    const result = capRegionRows(rows, 10);
    assert.strictEqual(result.rows.length, 10);
    assert.strictEqual(result.hasMore, true);
    assert.deepStrictEqual(result.rows, rows.slice(0, 10));
  });

  it('returns all rows with hasMore=false when at or under the limit', () => {
    const rows = [1, 2, 3];
    const result = capRegionRows(rows, 10);
    assert.strictEqual(result.rows.length, 3);
    assert.strictEqual(result.hasMore, false);
  });

  it('treats a count exactly at the limit as not truncated', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const result = capRegionRows(rows, 10);
    assert.strictEqual(result.rows.length, 10);
    assert.strictEqual(result.hasMore, false);
  });

  it('falls back to the default cap when the limit is not positive', () => {
    const rows = Array.from({ length: DEFAULT_MAX_REGION_ROWS + 5 }, (_, i) => i);
    const result = capRegionRows(rows, 0);
    assert.strictEqual(result.rows.length, DEFAULT_MAX_REGION_ROWS);
    assert.strictEqual(result.hasMore, true);
  });
});
