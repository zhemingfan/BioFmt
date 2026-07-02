// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateBedGraph(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') ||
        trimmed.startsWith('track') || trimmed.startsWith('browser')) {
      continue;
    }

    const columns = trimmed.split('\t');

    if (columns.length < 4) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `bedGraph requires 4 columns (chrom, start, end, value), found ${columns.length}`,
        source: 'biofmt',
      }, 'BDG-001'));
      continue;
    }

    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);

    if (isNaN(start) || start < 0) {
      const startPos = columns[0].length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: startPos }, end: { line: i, character: startPos + columns[1].length } },
        message: 'Start must be a non-negative integer',
        source: 'biofmt',
      }, 'BDG-002'));
    }

    if (isNaN(end) || end < 0) {
      const endPos = columns[0].length + columns[1].length + 2;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: endPos }, end: { line: i, character: endPos + columns[2].length } },
        message: 'End must be a non-negative integer',
        source: 'biofmt',
      }, 'BDG-003'));
    }

    if (!isNaN(start) && !isNaN(end) && start >= end) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Start must be less than end',
        source: 'biofmt',
      }, 'BDG-004'));
    }

    const value = parseFloat(columns[3]);
    if (isNaN(value)) {
      const valuePos = columns[0].length + columns[1].length + columns[2].length + 3;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: valuePos }, end: { line: i, character: valuePos + columns[3].length } },
        message: 'Value must be a number',
        source: 'biofmt',
      }, 'BDG-005'));
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
