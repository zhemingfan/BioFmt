// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { VisibleRangeTracker } from '../../server/src/visibleRanges';

describe('VisibleRangeTracker', () => {
  it('returns undefined when nothing is tracked', () => {
    const t = new VisibleRangeTracker();
    assert.strictEqual(t.get('u'), undefined);
  });

  it('unions ranges across sources for a document', () => {
    const t = new VisibleRangeTracker();
    t.set('u', 'editor', [{ startLine: 0, endLine: 10 }]);
    t.set('u', 'preview', [{ startLine: 100, endLine: 110 }]);
    assert.deepStrictEqual(t.get('u'), [
      { startLine: 0, endLine: 10 },
      { startLine: 100, endLine: 110 },
    ]);
  });

  it('replaces one source without disturbing the others', () => {
    const t = new VisibleRangeTracker();
    t.set('u', 'editor', [{ startLine: 0, endLine: 10 }]);
    t.set('u', 'preview', [{ startLine: 100, endLine: 110 }]);
    t.set('u', 'preview', [{ startLine: 200, endLine: 210 }]);
    assert.deepStrictEqual(t.get('u'), [
      { startLine: 0, endLine: 10 },
      { startLine: 200, endLine: 210 },
    ]);
  });

  it('deletes all sources for a document', () => {
    const t = new VisibleRangeTracker();
    t.set('u', 'editor', [{ startLine: 0, endLine: 10 }]);
    t.set('u', 'preview', [{ startLine: 5, endLine: 6 }]);
    t.delete('u');
    assert.strictEqual(t.get('u'), undefined);
  });

  it('isolates documents from each other', () => {
    const t = new VisibleRangeTracker();
    t.set('a', 'editor', [{ startLine: 1, endLine: 2 }]);
    t.set('b', 'editor', [{ startLine: 3, endLine: 4 }]);
    assert.deepStrictEqual(t.get('a'), [{ startLine: 1, endLine: 2 }]);
    assert.deepStrictEqual(t.get('b'), [{ startLine: 3, endLine: 4 }]);
  });
});
