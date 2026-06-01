// SPDX-License-Identifier: GPL-3.0-or-later

export interface Disposable {
  dispose(): void;
}

export class WorkspaceLintLifecycle<TWatcher extends Disposable = Disposable> {
  private watcher: TWatcher | undefined;
  private pendingTimer: ReturnType<typeof setTimeout> | undefined;

  ensureWatcher(createWatcher: () => TWatcher): TWatcher {
    if (!this.watcher) {
      this.watcher = createWatcher();
    }
    return this.watcher;
  }

  hasWatcher(): boolean {
    return this.watcher !== undefined;
  }

  setPendingTimer(timer: ReturnType<typeof setTimeout> | undefined): void {
    this.pendingTimer = timer;
  }

  getPendingTimer(): ReturnType<typeof setTimeout> | undefined {
    return this.pendingTimer;
  }

  clearPendingTimer(clearTimer: (timer: ReturnType<typeof setTimeout>) => void): void {
    if (this.pendingTimer) {
      clearTimer(this.pendingTimer);
      this.pendingTimer = undefined;
    }
  }

  stop(clearTimer: (timer: ReturnType<typeof setTimeout>) => void): boolean {
    this.clearPendingTimer(clearTimer);

    const hadWatcher = this.watcher !== undefined;
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }

    return hadWatcher;
  }
}
