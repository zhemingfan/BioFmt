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

    // Strict-mode checks
    if (settings.validation.level === 'strict') {
      // FLAG must be 0-65535
      if (!isNaN(flag) && flag > 65535) {
        const flagStart = columns[0].length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: flagStart }, end: { line: i, character: flagStart + columns[1].length } },
          message: `FLAG must be 0-65535, found ${flag}`,
          source: 'biofmt',
        }, 'SAM-S002'));
      }

      // CIGAR must match valid pattern
      const cigar = columns[5];
      if (cigar !== '*' && !/^([0-9]+[MIDNSHP=X])+$/.test(cigar)) {
        const cigarStart = columns.slice(0, 5).join('\t').length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: cigarStart }, end: { line: i, character: cigarStart + cigar.length } },
          message: 'CIGAR must match pattern [0-9]+[MIDNSHP=X]',
          source: 'biofmt',
        }, 'SAM-S001'));
      }

      // SEQ must contain only valid bases or *
      const seq = columns[9];
      if (seq !== '*' && !/^[ACGTNacgtn=.]+$/.test(seq)) {
        const seqStart = columns.slice(0, 9).join('\t').length + 1;
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: seqStart }, end: { line: i, character: seqStart + seq.length } },
          message: 'SEQ contains non-standard characters',
          source: 'biofmt',
        }, 'SAM-S003'));
      }

      // Cross-field: CIGAR query length must match SEQ length
      if (cigar !== '*' && seq !== '*') {
        const queryLen = sumCigarQueryBases(cigar);
        if (queryLen > 0 && queryLen !== seq.length) {
          const cigarStart = columns.slice(0, 5).join('\t').length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: i, character: cigarStart }, end: { line: i, character: cigarStart + cigar.length } },
            message: `CIGAR query length (${queryLen}) does not match SEQ length (${seq.length})`,
            source: 'biofmt',
          }, 'SAM-X001'));
        }
      }

      // Cross-field: FLAG bit conflicts
      if (!isNaN(flag)) {
        const paired = (flag & 0x1) !== 0;
        const properlyPaired = (flag & 0x2) !== 0;
        const unmapped = (flag & 0x4) !== 0;
        const mateUnmapped = (flag & 0x8) !== 0;
        const mateReversed = (flag & 0x20) !== 0;
        const first = (flag & 0x40) !== 0;
        const second = (flag & 0x80) !== 0;

        // Unmapped + properly paired is contradictory
        if (unmapped && properlyPaired) {
          const flagStart = columns[0].length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: i, character: flagStart }, end: { line: i, character: flagStart + columns[1].length } },
            message: 'FLAG conflict: unmapped (0x4) and properly paired (0x2) are both set',
            source: 'biofmt',
          }, 'SAM-X002'));
        }

        // Paired-end bits require the paired flag
        if (!paired && (mateUnmapped || mateReversed || first || second)) {
          const flagStart = columns[0].length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: i, character: flagStart }, end: { line: i, character: flagStart + columns[1].length } },
            message: 'Paired-end FLAG bits set but paired flag (0x1) is not set',
            source: 'biofmt',
          }, 'SAM-X003'));
        }
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}

function sumCigarQueryBases(cigar: string): number {
  let sum = 0;
  for (const m of cigar.matchAll(/(\d+)([MIDNSHP=X])/g)) {
    if ('MIS=X'.includes(m[2])) sum += parseInt(m[1], 10);
  }
  return sum;
}
