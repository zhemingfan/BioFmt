// SPDX-License-Identifier: GPL-3.0-or-later

// Shared diagnostic types + transform, used by both the extension (to forward
// VS Code diagnostics into the webview) and the webview (to render row markers).
// Kept free of any `vscode` import so it is unit-testable under Mocha and
// importable from the webview bundle.

export type PreviewDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface PreviewDiagnostic {
  /** 0-based start line of the diagnostic. */
  line: number;
  /** 0-based end line (equals `line` for single-line diagnostics). */
  endLine: number;
  severity: PreviewDiagnosticSeverity;
  message: string;
  /** Rule code, e.g. "VCF-S005", when present. */
  code?: string;
}

/** Higher rank = more severe; used to pick the worst diagnostic on a row. */
export const SEVERITY_RANK: Record<PreviewDiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  hint: 0,
};

// Numeric values of vscode.DiagnosticSeverity, inlined so this module needs no
// `vscode` import. (Error=0, Warning=1, Information=2, Hint=3.)
const SEVERITY_BY_NUMBER: Record<number, PreviewDiagnosticSeverity> = {
  0: 'error',
  1: 'warning',
  2: 'info',
  3: 'hint',
};

/**
 * Minimal structural shape of a VS Code diagnostic. `vscode.Diagnostic`
 * satisfies this, so `toPreviewDiagnostics` accepts the real thing at runtime
 * while staying decoupled from the `vscode` module for testing.
 */
export interface RawDiagnostic {
  range: { start: { line: number }; end: { line: number } };
  severity?: number;
  message: string;
  code?: string | number | { value: string | number };
}

function codeToString(
  code: RawDiagnostic['code']
): string | undefined {
  if (code == null) return undefined;
  if (typeof code === 'string') return code;
  if (typeof code === 'number') return String(code);
  if (typeof code.value === 'string') return code.value;
  return String(code.value);
}

/** Convert VS Code diagnostics into the compact form the webview consumes. */
export function toPreviewDiagnostics(
  diagnostics: readonly RawDiagnostic[]
): PreviewDiagnostic[] {
  return diagnostics.map((d) => ({
    line: d.range.start.line,
    endLine: d.range.end.line,
    // Default missing severity to 'error' (VS Code treats undefined as Error).
    severity: d.severity != null ? SEVERITY_BY_NUMBER[d.severity] ?? 'error' : 'error',
    message: d.message,
    code: codeToString(d.code),
  }));
}

/** The most severe severity among a set of diagnostics, or undefined if empty. */
export function worstSeverity(
  diagnostics: readonly PreviewDiagnostic[]
): PreviewDiagnosticSeverity | undefined {
  let worst: PreviewDiagnosticSeverity | undefined;
  for (const d of diagnostics) {
    if (!worst || SEVERITY_RANK[d.severity] > SEVERITY_RANK[worst]) {
      worst = d.severity;
    }
  }
  return worst;
}
