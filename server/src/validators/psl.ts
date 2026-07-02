// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validatePsl(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() ||
        line.startsWith('psLayout') ||
        line.startsWith('match') ||
        line.startsWith('---')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 21) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `PSL requires 21 columns, found ${columns.length}`,
        source: 'biofmt',
      }, 'PSL-001'));
      continue;
    }

    const numericCols = [
      { idx: 0, name: 'matches' },
      { idx: 1, name: 'misMatches' },
      { idx: 2, name: 'repMatches' },
      { idx: 3, name: 'nCount' },
      { idx: 4, name: 'qNumInsert' },
      { idx: 5, name: 'qBaseInsert' },
      { idx: 6, name: 'tNumInsert' },
      { idx: 7, name: 'tBaseInsert' },
      { idx: 10, name: 'qSize' },
      { idx: 11, name: 'qStart' },
      { idx: 12, name: 'qEnd' },
      { idx: 14, name: 'tSize' },
      { idx: 15, name: 'tStart' },
      { idx: 16, name: 'tEnd' },
      { idx: 17, name: 'blockCount' },
    ];

    for (const col of numericCols) {
      const val = parseInt(columns[col.idx], 10);
      if (isNaN(val) || val < 0) {
        const colStart = columns.slice(0, col.idx).join('\t').length + (col.idx > 0 ? 1 : 0);
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: colStart }, end: { line: i, character: colStart + columns[col.idx].length } },
          message: `${col.name} must be a non-negative integer`,
          source: 'biofmt',
        }, 'PSL-002'));
      }
    }

    const strand = columns[8];
    if (strand !== '+' && strand !== '-' && strand !== '++' && strand !== '+-' && strand !== '-+' && strand !== '--') {
      const strandStart = columns.slice(0, 8).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: strandStart }, end: { line: i, character: strandStart + strand.length } },
        message: `Invalid strand "${strand}"`,
        source: 'biofmt',
      }, 'PSL-003'));
    }

    const qStart = parseInt(columns[11], 10);
    const qEnd = parseInt(columns[12], 10);
    if (!isNaN(qStart) && !isNaN(qEnd) && qStart >= qEnd) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Query start should be less than query end',
        source: 'biofmt',
      }, 'PSL-004'));
    }

    const tStart = parseInt(columns[15], 10);
    const tEnd = parseInt(columns[16], 10);
    if (!isNaN(tStart) && !isNaN(tEnd) && tStart >= tEnd) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Target start should be less than target end',
        source: 'biofmt',
      }, 'PSL-005'));
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
