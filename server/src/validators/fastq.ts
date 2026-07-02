// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';

export function validateFastq(
  text: string,
  settings: BioFmtSettings,
  _context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);
  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i + 3 < maxLines; i += 4) {
    const headerLine = lines[i].trim();
    const seqLine = lines[i + 1]?.trim();
    const plusLine = lines[i + 2]?.trim();
    const qualLine = lines[i + 3]?.trim();

    if (!headerLine) { i -= 3; continue; }

    if (!headerLine.startsWith('@')) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i, character: 0 }, end: { line: i, character: lines[i].length } },
        message: 'FASTQ record should start with @ header line',
        source: 'biofmt',
      }, 'FASTQ-001'));
      break;
    }

    if (!plusLine || !plusLine.startsWith('+')) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i + 2, character: 0 }, end: { line: i + 2, character: (lines[i + 2] || '').length } },
        message: 'Expected + separator on line 3 of FASTQ record',
        source: 'biofmt',
      }, 'FASTQ-002'));
    }

    if (seqLine && qualLine && seqLine.length !== qualLine.length) {
      diagnostics.push(withSpecRef({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: i + 3, character: 0 }, end: { line: i + 3, character: (lines[i + 3] || '').length } },
        message: `Quality line length (${qualLine.length}) does not match sequence length (${seqLine.length})`,
        source: 'biofmt',
      }, 'FASTQ-003'));
    }

    // Strict-mode checks
    if (settings.validation.level === 'strict') {
      // Sequence must contain only valid bases
      if (seqLine && !/^[ACGTNacgtn]+$/.test(seqLine)) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i + 1, character: 0 }, end: { line: i + 1, character: (lines[i + 1] || '').length } },
          message: 'Sequence contains non-standard base characters',
          source: 'biofmt',
        }, 'FASTQ-S002'));
      }

      // Quality scores must be in Phred range (ASCII 33-126)
      if (qualLine) {
        for (let j = 0; j < qualLine.length; j++) {
          const code = qualLine.charCodeAt(j);
          if (code < 33 || code > 126) {
            diagnostics.push(withSpecRef({
              severity: DiagnosticSeverity.Warning,
              range: { start: { line: i + 3, character: j }, end: { line: i + 3, character: j + 1 } },
              message: `Quality character '${qualLine[j]}' (ASCII ${code}) outside Phred range 33-126`,
              source: 'biofmt',
            }, 'FASTQ-S001'));
            break; // One diagnostic per record is enough
          }
        }
      }
    }
  }

  return diagnostics;
}
