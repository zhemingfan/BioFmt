// SPDX-License-Identifier: GPL-3.0-or-later

import type { Diagnostic } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import { shouldSkipLine, createLineDiagnostic, createColumnDiagnostic, validateCoordinatePair } from '../validationUtils';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateBed(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];
    if (shouldSkipLine(line, ['track', 'browser'])) continue;

    const columns = line.split('\t');

    if (columns.length < 3) {
      diagnostics.push(withSpecRef(
        createLineDiagnostic(i, line, 'BED format requires at least 3 columns (chrom, start, end)'),
        'BED-001'
      ));
      continue;
    }

    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnostics.push(withSpecRef(
        createLineDiagnostic(i, line, 'Start and end positions must be integers'),
        'BED-002'
      ));
      continue;
    }

    if (start < 0) {
      diagnostics.push(withSpecRef(
        createColumnDiagnostic(i, columns, 1, 'Start position cannot be negative'),
        'BED-003'
      ));
    }

    validateCoordinatePair(i, line, columns, 1, 2, 'Start', 'End', diagnostics);

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
