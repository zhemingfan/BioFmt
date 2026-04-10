// SPDX-License-Identifier: GPL-3.0-or-later

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';
import { shouldValidateLine } from './types';

export function validateWig(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split('\n');

  let inFixedStep = false;
  let inVariableStep = false;

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(context, i)) continue;
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('track')) continue;

    if (trimmed.startsWith('fixedStep')) {
      inFixedStep = true;
      inVariableStep = false;

      if (!trimmed.includes('chrom=')) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'fixedStep requires chrom parameter',
          source: 'biofmt',
        }, 'WIG-001'));
      }

      if (!trimmed.includes('start=')) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'fixedStep requires start parameter',
          source: 'biofmt',
        }, 'WIG-002'));
      }

      const stepMatch = trimmed.match(/step=(\d+)/);
      if (!stepMatch) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'fixedStep requires step parameter',
          source: 'biofmt',
        }, 'WIG-003'));
      } else {
        const currentStep = parseInt(stepMatch[1], 10);
        if (currentStep <= 0) {
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
            message: 'step must be a positive integer',
            source: 'biofmt',
          }, 'WIG-004'));
        }
      }

      const spanMatch = trimmed.match(/span=(\d+)/);
      if (spanMatch) {
        const currentSpan = parseInt(spanMatch[1], 10);
        if (currentSpan <= 0) {
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
            message: 'span should be a positive integer',
            source: 'biofmt',
          }, 'WIG-005'));
        }
      }
      continue;
    }

    if (trimmed.startsWith('variableStep')) {
      inVariableStep = true;
      inFixedStep = false;

      if (!trimmed.includes('chrom=')) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'variableStep requires chrom parameter',
          source: 'biofmt',
        }, 'WIG-006'));
      }
      continue;
    }

    // Data lines
    const parts = trimmed.split(/\s+/);

    if (inFixedStep) {
      if (parts.length !== 1) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'fixedStep data lines should have exactly one value',
          source: 'biofmt',
        }, 'WIG-007'));
      }
      const value = parseFloat(parts[0]);
      if (isNaN(value)) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'Invalid numeric value',
          source: 'biofmt',
        }, 'WIG-008'));
      }
    } else if (inVariableStep) {
      if (parts.length < 2) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'variableStep data lines require position and value',
          source: 'biofmt',
        }, 'WIG-009'));
        continue;
      }

      const pos = parseInt(parts[0], 10);
      const value = parseFloat(parts[1]);

      if (isNaN(pos) || pos < 0) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: parts[0].length } },
          message: 'Position must be a non-negative integer',
          source: 'biofmt',
        }, 'WIG-010'));
      }

      if (isNaN(value)) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: parts[0].length + 1 }, end: { line: i, character: line.length } },
          message: 'Invalid numeric value',
          source: 'biofmt',
        }, 'WIG-008'));
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}
