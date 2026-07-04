// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import { useDiagnostics } from '../diagnostics/DiagnosticsContext';
import type { PreviewDiagnosticSeverity } from '../../../src/shared/diagnostics';

/** Fixed width of the leading status column, shared by header spacer and rows. */
export const STATUS_COL_WIDTH = 24;

// Shape carries severity alongside colour, so the marker is not colour-only.
const GLYPH: Record<PreviewDiagnosticSeverity, string> = {
  error: '●', // ●
  warning: '▲', // ▲
  info: '■', // ■
  hint: '●', // ●
};

/** Row-tint className for a severity (empty string when none). */
export function severityRowClass(sev?: PreviewDiagnosticSeverity): string {
  return sev ? `row-has-${sev}` : '';
}

/**
 * A single leading status cell for a preview row. Renders a severity glyph with
 * a tooltip of the diagnostic message(s) when the row's source `line` has a
 * diagnostic; clicking reveals that line in the text editor. Renders an empty
 * placeholder (to keep columns aligned) when there is nothing to show.
 */
export function RowStatus({ line, width = STATUS_COL_WIDTH }: { line?: number; width?: number }) {
  const { worstFor, forLine, revealLine } = useDiagnostics();
  const sev = line != null ? worstFor(line) : undefined;

  if (line == null || !sev) {
    return <div className="row-status" style={{ width, flexShrink: 0 }} aria-hidden="true" />;
  }

  const diags = forLine(line) || [];
  const title = diags
    .map((d) => (d.code ? `[${d.code}] ` : '') + d.message)
    .join('\n');

  return (
    <div
      className={`row-status row-status-${sev}`}
      style={{ width, flexShrink: 0 }}
      title={title}
      role="button"
      aria-label={`${sev}: ${title}`}
      onClick={(e) => {
        e.stopPropagation();
        revealLine(line);
      }}
    >
      <span className="row-status-glyph">{GLYPH[sev]}</span>
    </div>
  );
}

/** Header spacer that aligns with the leading status column. */
export function RowStatusHeaderSpacer({ width = STATUS_COL_WIDTH }: { width?: number }) {
  return <div className="row-status-header" style={{ width, flexShrink: 0 }} aria-hidden="true" />;
}
