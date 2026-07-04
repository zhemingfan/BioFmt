// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDiagnostics } from '../diagnostics/DiagnosticsContext';

/**
 * Header widget summarising diagnostics in the validated viewport and cycling
 * through them. Counts are labelled "in view" because validation is
 * viewport-bounded — we never imply the whole file was validated. Also responds
 * to `navError` messages forwarded from the F8 / Shift+F8 keybindings.
 */
export function DiagnosticNav() {
  const { markerLines, counts, revealLine, scrollToLine, hasDiagnostics } = useDiagnostics();
  const indexRef = useRef(-1);
  const [position, setPosition] = useState(0); // 1-based display; 0 = none selected

  const go = useCallback(
    (dir: 'next' | 'prev') => {
      const n = markerLines.length;
      if (n === 0) return;
      const prev = indexRef.current;
      const next =
        dir === 'next'
          ? prev < 0
            ? 0
            : (prev + 1) % n
          : prev <= 0
            ? n - 1
            : prev - 1;
      indexRef.current = next;
      setPosition(next + 1);
      const line = markerLines[next];
      scrollToLine(line);
      revealLine(line);
    },
    [markerLines, scrollToLine, revealLine]
  );

  // Keep the selected index valid when the marker set changes (e.g. scroll).
  useEffect(() => {
    if (indexRef.current >= markerLines.length) {
      indexRef.current = markerLines.length - 1;
      setPosition(markerLines.length);
    }
  }, [markerLines]);

  // F8 / Shift+F8 are forwarded from the extension as `navError` messages.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.command === 'navError') {
        go(msg.dir === 'prev' ? 'prev' : 'next');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [go]);

  if (!hasDiagnostics) return null;

  const total = markerLines.length;
  const plural = (n: number) => (n === 1 ? '' : 's');

  return (
    <div className="diagnostic-nav">
      <span className="diagnostic-nav-counts">
        {counts.error > 0 && (
          <span className="dn-count dn-error">{counts.error} error{plural(counts.error)}</span>
        )}
        {counts.warning > 0 && (
          <span className="dn-count dn-warning">{counts.warning} warning{plural(counts.warning)}</span>
        )}
        {counts.info > 0 && <span className="dn-count dn-info">{counts.info} info</span>}
        <span className="dn-scope">in view</span>
      </span>
      <span className="diagnostic-nav-controls">
        <button type="button" onClick={() => go('prev')} title="Previous error (Shift+F8)" aria-label="Previous error">
          ‹
        </button>
        <span className="dn-position">{position}/{total}</span>
        <button type="button" onClick={() => go('next')} title="Next error (F8)" aria-label="Next error">
          ›
        </button>
      </span>
    </div>
  );
}
