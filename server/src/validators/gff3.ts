// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateGff3(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  const validStrands = new Set(['+', '-', '.', '?']);
  const validPhases = new Set(['0', '1', '2', '.']);

  // Strict: first line must be ##gff-version 3
  if (settings.validation.level === 'strict' && lines.length > 0) {
    const firstLine = lines[0].trim();
    if (!firstLine.startsWith('##gff-version')) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: lines[0].length } },
        message: 'GFF3 file should start with ##gff-version 3',
        source: 'biofmt',
      }, 'GFF3-S001'));
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() || line.startsWith('#')) continue;

    const columns = line.split('\t');

    if (columns.length < 9) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `GFF3 requires 9 columns, found ${columns.length}`,
        source: 'biofmt',
      }, 'GFF3-001'));
      continue;
    }

    const start = parseInt(columns[3], 10);
    const end = parseInt(columns[4], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Start and end positions must be integers',
        source: 'biofmt',
      }, 'GFF3-002'));
    } else if (start > end) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Start position cannot be greater than end position',
        source: 'biofmt',
      }, 'GFF3-003'));
    }

    const strand = columns[6];
    if (!validStrands.has(strand)) {
      const strandStart = columns.slice(0, 6).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: strandStart }, end: { line: i, character: strandStart + strand.length } },
        message: `Invalid strand "${strand}" (expected +, -, ., or ?)`,
        source: 'biofmt',
      }, 'GFF3-004'));
    }

    const phase = columns[7];
    if (!validPhases.has(phase)) {
      const phaseStart = columns.slice(0, 7).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: phaseStart }, end: { line: i, character: phaseStart + phase.length } },
        message: `Invalid phase "${phase}" (expected 0, 1, 2, or .)`,
        source: 'biofmt',
      }, 'GFF3-005'));
    }

    const attrs = columns[8];
    if (attrs && attrs !== '.') {
      if (!attrs.includes('=')) {
        const attrsStart = columns.slice(0, 8).join('\t').length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: attrsStart }, end: { line: i, character: attrsStart + attrs.length } },
          message: 'GFF3 attributes should be in format: key=value;key=value',
          source: 'biofmt',
        }, 'GFF3-006'));
      }
    }

    // Strict-mode checks
    if (settings.validation.level === 'strict') {
      // Score (col 6) must be numeric or .
      const score = columns[5];
      if (score !== '.' && isNaN(parseFloat(score))) {
        const scoreStart = columns.slice(0, 5).join('\t').length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: scoreStart }, end: { line: i, character: scoreStart + score.length } },
          message: `Score must be numeric or ".", found "${score}"`,
          source: 'biofmt',
        }, 'GFF3-S002'));
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
