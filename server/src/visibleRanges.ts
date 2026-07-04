// SPDX-License-Identifier: GPL-3.0-or-later

// Tracks visible line ranges per document, keyed by source ("editor" or
// "preview"), so viewport-aware validation covers the union of everything the
// user is currently looking at. Without the per-source split, the editor and
// preview viewports would clobber each other (last-writer-wins), causing
// diagnostics to flicker as focus moves between them.

export interface LineRange {
  startLine: number;
  endLine: number;
}

export class VisibleRangeTracker {
  private bySource = new Map<string, Map<string, LineRange[]>>();

  /** Record the visible ranges reported by a given source for a document. */
  set(uri: string, source: string, ranges: LineRange[]): void {
    let sources = this.bySource.get(uri);
    if (!sources) {
      sources = new Map();
      this.bySource.set(uri, sources);
    }
    sources.set(source, ranges);
  }

  /**
   * Union of all sources' ranges for a document, or undefined if none reported.
   * Returned ranges are not merged/normalized — callers only test line
   * membership, for which the flat union is sufficient.
   */
  get(uri: string): LineRange[] | undefined {
    const sources = this.bySource.get(uri);
    if (!sources || sources.size === 0) return undefined;
    const union: LineRange[] = [];
    for (const ranges of sources.values()) {
      for (const r of ranges) union.push(r);
    }
    return union;
  }

  /** Drop all tracked ranges for a document (e.g. on close). */
  delete(uri: string): void {
    this.bySource.delete(uri);
  }
}
