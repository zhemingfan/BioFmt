// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateBedpe(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() || line.startsWith('#')) continue;

    const columns = line.split('\t');

    if (columns.length < 6) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'BEDPE format requires at least 6 columns (chrom1, start1, end1, chrom2, start2, end2)',
        source: 'biofmt',
      }, 'BEDPE-001'));
      continue;
    }

    const start1 = parseInt(columns[1], 10);
    const end1 = parseInt(columns[2], 10);

    if (isNaN(start1) || isNaN(end1)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'start1 and end1 positions must be integers',
        source: 'biofmt',
      }, 'BEDPE-002'));
      continue;
    }

    const start2 = parseInt(columns[4], 10);
    const end2 = parseInt(columns[5], 10);

    if (isNaN(start2) || isNaN(end2)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'start2 and end2 positions must be integers',
        source: 'biofmt',
      }, 'BEDPE-003'));
      continue;
    }

    // BEDPE represents an unknown mate (e.g. a single breakend) with chrom='.',
    // start=-1, end=-1. Exempt that sentinel from the negative/order checks, but
    // still flag a genuinely negative coordinate on a known mate.
    const mate1Known = columns[0] !== '.' && start1 !== -1;
    const mate2Known = columns[3] !== '.' && start2 !== -1;

    if ((mate1Known && start1 < 0) || (mate2Known && start2 < 0)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Start positions cannot be negative',
        source: 'biofmt',
      }, 'BEDPE-004'));
    }

    if ((mate1Known && end1 < start1) || (mate2Known && end2 < start2)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'End position must be >= start position',
        source: 'biofmt',
      }, 'BEDPE-005'));
    }

    if (columns.length >= 10) {
      const strand1 = columns[8];
      const strand2 = columns[9];
      const validStrands = ['+', '-', '.'];

      if (!validStrands.includes(strand1) || !validStrands.includes(strand2)) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'Strand fields should be +, -, or .',
          source: 'biofmt',
        }, 'BEDPE-006'));
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
