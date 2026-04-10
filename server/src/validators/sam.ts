// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateSam(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() || line.startsWith('@')) continue;

    const columns = line.split('\t');

    if (columns.length < 11) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `SAM format requires at least 11 columns, found ${columns.length}`,
        source: 'biofmt',
      }, 'SAM-001'));
      continue;
    }

    // FLAG (column 2)
    const flag = parseInt(columns[1], 10);
    if (isNaN(flag) || flag < 0) {
      const flagStart = columns[0].length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: flagStart }, end: { line: i, character: flagStart + columns[1].length } },
        message: 'FLAG must be a non-negative integer',
        source: 'biofmt',
      }, 'SAM-002'));
    }

    // POS (column 4)
    const pos = parseInt(columns[3], 10);
    if (isNaN(pos) || pos < 0) {
      const posStart = columns.slice(0, 3).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: posStart }, end: { line: i, character: posStart + columns[3].length } },
        message: 'POS must be a non-negative integer',
        source: 'biofmt',
      }, 'SAM-003'));
    }

    // MAPQ (column 5)
    const mapq = parseInt(columns[4], 10);
    if (isNaN(mapq) || mapq < 0 || mapq > 255) {
      const mapqStart = columns.slice(0, 4).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: mapqStart }, end: { line: i, character: mapqStart + columns[4].length } },
        message: 'MAPQ should be between 0 and 255',
        source: 'biofmt',
      }, 'SAM-004'));
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
