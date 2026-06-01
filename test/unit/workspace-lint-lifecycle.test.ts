// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { WorkspaceLintLifecycle } from '../../src/shared/workspaceLintLifecycle';

describe('WorkspaceLintLifecycle', () => {
  it('creates only one watcher until stopped', () => {
    let created = 0;
    const lifecycle = new WorkspaceLintLifecycle();

    const first = lifecycle.ensureWatcher(() => ({
      dispose: () => {},
      id: ++created,
    }));
    const second = lifecycle.ensureWatcher(() => ({
      dispose: () => {},
      id: ++created,
    }));

    assert.strictEqual(first, second);
    assert.strictEqual(created, 1);
  });

  it('disposes the active watcher and clears pending rescan timers', () => {
    let disposed = 0;
    let clearedTimer: ReturnType<typeof setTimeout> | undefined;
    const lifecycle = new WorkspaceLintLifecycle();
    lifecycle.ensureWatcher(() => ({ dispose: () => { disposed++; } }));
    const timer = setTimeout(() => {}, 1000);
    lifecycle.setPendingTimer(timer);

    const hadWatcher = lifecycle.stop((t) => {
      clearedTimer = t;
      clearTimeout(t);
    });

    assert.strictEqual(hadWatcher, true);
    assert.strictEqual(disposed, 1);
    assert.strictEqual(clearedTimer, timer);
    assert.strictEqual(lifecycle.hasWatcher(), false);
  });
});
