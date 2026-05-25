// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Generic interpreter for declarative format specs (/formats/*.json).
 *
 * Builds a ValidatorFn from a spec's `validate` block by composing the same
 * primitives the hand-written validators use (validationUtils). Declarative
 * formats are wired into getValidator() as a fallback, so the existing 25
 * hand-written formats are unaffected.
 */

import type { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import {
  createColumnDiagnostic,
  createLineDiagnostic,
  validateCoordinatePair,
  validateStrand,
  shouldSkipLine,
} from '../validationUtils';
import { shouldValidateLine } from './types';
import type { ValidatorFn } from './types';
import type {
  FormatSpec,
  ValidateRule,
  ColumnRule,
} from '../../../src/shared/formatSpec';
import { GENERATED_FORMATS } from '../../../src/shared/generatedFormats';
import { registerSpecRefs, type SpecRef } from '../specRefs';

function severityOf(rule: ValidateRule): DiagnosticSeverity {
  return rule.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
}

function withRef(diagnostic: Diagnostic, rule: ValidateRule): Diagnostic {
  diagnostic.code = rule.code;
  diagnostic.codeDescription = { href: rule.spec.href };
  return diagnostic;
}

function columnPasses(rule: ColumnRule, value: string): boolean {
  switch (rule.type) {
    case 'int': {
      if (!/^[+-]?\d+$/.test(value)) return false;
      const n = parseInt(value, 10);
      if (rule.min !== undefined && n < rule.min) return false;
      if (rule.max !== undefined && n > rule.max) return false;
      return true;
    }
    case 'number': {
      if (value.trim() === '') return false;
      const n = Number(value);
      if (Number.isNaN(n)) return false;
      if (rule.min !== undefined && n < rule.min) return false;
      if (rule.max !== undefined && n > rule.max) return false;
      return true;
    }
    case 'enum':
      return !!rule.values && rule.values.includes(value);
    case 'regex':
      return !!rule.pattern && new RegExp(rule.pattern).test(value);
    default:
      return true;
  }
}

function applyRule(
  rule: ValidateRule,
  lineNumber: number,
  lineText: string,
  columns: string[],
  diagnostics: Diagnostic[],
): void {
  switch (rule.id) {
    case 'minColumns': {
      if (columns.length < rule.min) {
        diagnostics.push(withRef(createLineDiagnostic(lineNumber, lineText, rule.message, severityOf(rule)), rule));
      }
      break;
    }
    case 'column': {
      if (rule.column >= columns.length) break;
      const value = columns[rule.column];
      if (rule.allowDot && value === '.') break;
      if (!columnPasses(rule, value)) {
        diagnostics.push(withRef(createColumnDiagnostic(lineNumber, columns, rule.column, rule.message, severityOf(rule)), rule));
      }
      break;
    }
    case 'coordinatePair': {
      const tmp: Diagnostic[] = [];
      validateCoordinatePair(lineNumber, lineText, columns, rule.startColumn, rule.endColumn, rule.startName, rule.endName, tmp, rule.allowEqual ?? false);
      for (const d of tmp) {
        d.message = rule.message;
        d.severity = severityOf(rule);
        diagnostics.push(withRef(d, rule));
      }
      break;
    }
    case 'strand': {
      const tmp: Diagnostic[] = [];
      validateStrand(lineNumber, columns, rule.column, new Set(rule.values), tmp);
      for (const d of tmp) {
        d.message = rule.message;
        d.severity = severityOf(rule);
        diagnostics.push(withRef(d, rule));
      }
      break;
    }
  }
}

/** Build a viewport-aware ValidatorFn from a declarative format spec. */
export function makeDeclarativeValidator(spec: FormatSpec): ValidatorFn {
  const skipPrefixes = spec.validate.skipPrefixes ?? [];
  const splitByTab = spec.tokenize.delimiter === 'tab';

  return (text, settings, context) => {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (!shouldValidateLine(context, i)) continue;
      const line = lines[i];
      if (shouldSkipLine(line, skipPrefixes)) continue;

      const columns = splitByTab ? line.split('\t') : line.trim().split(/\s+/);

      for (const rule of spec.validate.rules) {
        if (rule.strict && settings.validation.level !== 'strict') continue;
        applyRule(rule, i, line, columns, diagnostics);
        if (diagnostics.length >= settings.validation.maxDiagnostics) break;
      }

      if (diagnostics.length >= settings.validation.maxDiagnostics) break;
    }

    return diagnostics;
  };
}

function collectSpecRefs(specs: FormatSpec[]): SpecRef[] {
  const refs: SpecRef[] = [];
  for (const spec of specs) {
    for (const rule of spec.validate.rules) {
      refs.push({
        code: rule.code,
        href: rule.spec.href,
        summary: rule.spec.summary,
        details: rule.spec.details,
        example: rule.spec.example,
      });
    }
  }
  return refs;
}

/** Make declarative spec refs resolvable by getSpecRef / diagnostic code actions. */
registerSpecRefs(collectSpecRefs(GENERATED_FORMATS));

/** Validators for every declarative format, keyed by languageId. */
export const DECLARATIVE_VALIDATORS: Map<string, ValidatorFn> = new Map(
  GENERATED_FORMATS.map((spec) => [spec.identity.languageId, makeDeclarativeValidator(spec)]),
);
