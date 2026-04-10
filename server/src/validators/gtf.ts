// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import { validateStrand } from '../validationUtils';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateGtf(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  const validStrands = new Set(['+', '-', '.']);
  const validFrames = new Set(['0', '1', '2', '.']);

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];

    if (!line.trim() || line.startsWith('#')) continue;

    const columns = line.split('\t');

    if (columns.length < 9) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: `GTF requires 9 columns, found ${columns.length}`,
        source: 'biofmt',
      }, 'GTF-001'));
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
      }, 'GTF-002'));
    } else if (start > end) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Start position cannot be greater than end position',
        source: 'biofmt',
      }, 'GTF-003'));
    }

    validateStrand(i, columns, 6, validStrands, diagnostics);

    const frame = columns[7];
    if (!validFrames.has(frame)) {
      const frameStart = columns.slice(0, 7).join('\t').length + 1;
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: frameStart }, end: { line: i, character: frameStart + frame.length } },
        message: `Invalid frame "${frame}" (expected 0, 1, 2, or .)`,
        source: 'biofmt',
      }, 'GTF-005'));
    }

    const attrs = columns[8];
    if (attrs && attrs !== '.') {
      if (!attrs.includes('"') && attrs !== '.') {
        const attrsStart = columns.slice(0, 8).join('\t').length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: attrsStart }, end: { line: i, character: attrsStart + attrs.length } },
          message: 'GTF attributes should be in format: key "value";',
          source: 'biofmt',
        }, 'GTF-006'));
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
