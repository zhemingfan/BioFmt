// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

/**
 * Calculate the character offset for a column in a tab-separated line
 */
export function getColumnOffset(columns: string[], columnIndex: number): number {
  if (columnIndex === 0) return 0;
  return columns.slice(0, columnIndex).join('\t').length + 1;
}

/**
 * Create a diagnostic for a specific column
 */
export function createColumnDiagnostic(
  line: number,
  columns: string[],
  columnIndex: number,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): Diagnostic {
  const start = getColumnOffset(columns, columnIndex);
  const end = start + (columns[columnIndex]?.length || 0);

  return {
    severity,
    range: {
      start: { line, character: start },
      end: { line, character: end },
    },
    message,
    source: 'biofmt',
  };
}

/**
 * Create a diagnostic for an entire line
 */
export function createLineDiagnostic(
  line: number,
  lineText: string,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error
): Diagnostic {
  return {
    severity,
    range: {
      start: { line, character: 0 },
      end: { line, character: lineText.length },
    },
    message,
    source: 'biofmt',
  };
}

/**
 * Validate that specified columns contain non-negative integers
 */
export function validateNumericColumns(
  lineNumber: number,
  columns: string[],
  columnDefs: { idx: number; name: string }[],
  diagnostics: Diagnostic[]
): void {
  for (const col of columnDefs) {
    if (col.idx >= columns.length) continue;

    const val = parseInt(columns[col.idx], 10);
    if (isNaN(val) || val < 0) {
      diagnostics.push(
        createColumnDiagnostic(
          lineNumber,
          columns,
          col.idx,
          `${col.name} must be a non-negative integer`
        )
      );
    }
  }
}

/**
 * Validate that start < end for a coordinate pair
 */
export function validateCoordinatePair(
  lineNumber: number,
  lineText: string,
  columns: string[],
  startIdx: number,
  endIdx: number,
  startName: string,
  endName: string,
  diagnostics: Diagnostic[],
  allowEqual = false
): void {
  const start = parseInt(columns[startIdx], 10);
  const end = parseInt(columns[endIdx], 10);

  if (isNaN(start) || isNaN(end)) return;

  const condition = allowEqual ? start > end : start >= end;
  if (condition) {
    const message = allowEqual
      ? `${startName} cannot be greater than ${endName}`
      : `${startName} must be less than ${endName}`;

    diagnostics.push(createLineDiagnostic(lineNumber, lineText, message, DiagnosticSeverity.Error));
  }
}

/**
 * Validate strand value against allowed values
 */
export function validateStrand(
  lineNumber: number,
  columns: string[],
  strandIdx: number,
  validStrands: Set<string>,
  diagnostics: Diagnostic[]
): void {
  if (strandIdx >= columns.length) return;

  const strand = columns[strandIdx];
  if (!validStrands.has(strand)) {
    diagnostics.push(
      createColumnDiagnostic(
        lineNumber,
        columns,
        strandIdx,
        `Invalid strand "${strand}" (expected ${Array.from(validStrands).join(', ')})`
      )
    );
  }
}

/**
 * Check if a line should be skipped during validation (empty, comment, header)
 */
export function shouldSkipLine(line: string, additionalPrefixes: string[] = []): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('#')) return true;

  for (const prefix of additionalPrefixes) {
    if (trimmed.startsWith(prefix)) return true;
  }

  return false;
}
