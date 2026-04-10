// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import { validateNumericColumns, validateStrand } from '../validationUtils';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validatePaf(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');
  const pafValidStrands = new Set(['+', '-']);

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() || line.startsWith('#')) continue;

    const columns = line.split('\t');

    if (columns.length < 12) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `PAF requires at least 12 columns, found ${columns.length}`,
        source: 'biofmt',
      }, 'PAF-001'));
      continue;
    }

    const numericCols = [
      { idx: 1, name: 'query length' },
      { idx: 2, name: 'query start' },
      { idx: 3, name: 'query end' },
      { idx: 6, name: 'target length' },
      { idx: 7, name: 'target start' },
      { idx: 8, name: 'target end' },
      { idx: 9, name: 'matches' },
      { idx: 10, name: 'alignment length' },
      { idx: 11, name: 'mapping quality' },
    ];

    validateNumericColumns(i, columns, numericCols, diagnostics);
    validateStrand(i, columns, 4, pafValidStrands, diagnostics);

    const qStart = parseInt(columns[2], 10);
    const qEnd = parseInt(columns[3], 10);
    if (!isNaN(qStart) && !isNaN(qEnd) && qStart >= qEnd) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Query start should be less than query end',
        source: 'biofmt',
      }, 'PAF-004'));
    }

    const tStart = parseInt(columns[7], 10);
    const tEnd = parseInt(columns[8], 10);
    if (!isNaN(tStart) && !isNaN(tEnd) && tStart >= tEnd) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Target start should be less than target end',
        source: 'biofmt',
      }, 'PAF-005'));
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
