// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';

export function validateFasta(
  text: string,
  settings: BioFmtSettings,
  _context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);
  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);
  const validBases = /^[ACGTUNRYSWKMBDHVacgtunryswkmbdhv.*\-\s]+$/;
  let sawHeader = false;
  let inSequence = false;

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith(';')) continue;

    // Strict: blank lines within sequence blocks. A trailing blank line (e.g. a
    // final newline at EOF) is not "within" a block, so only flag a blank line
    // when more content follows it.
    if (!trimmed) {
      if (settings.validation.level === 'strict' && inSequence) {
        const moreContentFollows = lines.slice(i + 1, maxLines).some((l) => l.trim().length > 0);
        if (moreContentFollows) {
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
            message: 'Blank line within sequence block',
            source: 'biofmt',
          }, 'FASTA-S001'));
        }
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      sawHeader = true;
      inSequence = false;
      if (trimmed.length < 2) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'FASTA header is empty (expected >sequence_id)',
          source: 'biofmt',
        }, 'FASTA-002'));
      }
      continue;
    }

    if (!sawHeader && i === 0) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'FASTA file should start with a header line (>)',
        source: 'biofmt',
      }, 'FASTA-001'));
    }

    inSequence = true;

    if (!validBases.test(trimmed)) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
        message: 'Line contains invalid base characters for FASTA',
        source: 'biofmt',
      }, 'FASTA-003'));
    }
  }

  return diagnostics;
}
