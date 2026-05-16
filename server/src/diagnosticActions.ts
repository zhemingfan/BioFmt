// SPDX-License-Identifier: GPL-3.0-or-later

import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';
import { biofmtRuleHref, formatRuleDetails, getSpecRef } from './specRefs';

export const OPEN_RULE_COMMAND = 'biofmt.openDiagnosticRule';
export const OPEN_SPEC_COMMAND = 'biofmt.openDiagnosticSpec';
export const COPY_RULE_COMMAND = 'biofmt.copyDiagnosticRule';

export interface DiagnosticCodeActionParams {
  textDocument: { uri: string };
  context: { diagnostics: Diagnostic[] };
}

function diagnosticCode(diagnostic: Diagnostic): string | null {
  const code = diagnostic.code;
  if (typeof code === 'string') return code;
  if (typeof code === 'number') return String(code);
  return null;
}

function actionForRule(ruleCode: string, diagnostic: Diagnostic): CodeAction {
  return {
    title: `BioFmt: Explain ${ruleCode}`,
    kind: 'quickfix',
    diagnostics: [diagnostic],
    command: {
      title: `Explain ${ruleCode}`,
      command: OPEN_RULE_COMMAND,
      arguments: [ruleCode, biofmtRuleHref(ruleCode)],
    },
  };
}

function actionForSpec(ruleCode: string, diagnostic: Diagnostic, href: string): CodeAction {
  return {
    title: `BioFmt: Open ${ruleCode} specification`,
    kind: 'quickfix',
    diagnostics: [diagnostic],
    command: {
      title: `Open ${ruleCode} specification`,
      command: OPEN_SPEC_COMMAND,
      arguments: [href],
    },
  };
}

function actionForCopy(ruleCode: string, diagnostic: Diagnostic, details: string): CodeAction {
  return {
    title: `BioFmt: Copy ${ruleCode} details`,
    kind: 'quickfix',
    diagnostics: [diagnostic],
    command: {
      title: `Copy ${ruleCode} details`,
      command: COPY_RULE_COMMAND,
      arguments: [details],
    },
  };
}

function safeFixFor(ruleCode: string, diagnostic: Diagnostic, uri: string): CodeAction | null {
  if (ruleCode !== 'GFF3_MISSING_VERSION') return null;

  return {
    title: 'BioFmt: Insert ##gff-version 3',
    kind: 'quickfix',
    diagnostics: [diagnostic],
    isPreferred: true,
    edit: {
      changes: {
        [uri]: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            newText: '##gff-version 3\n',
          },
        ],
      },
    },
  };
}

export function getDiagnosticCodeActions(params: DiagnosticCodeActionParams): CodeAction[] {
  const actions: CodeAction[] = [];
  const seen = new Set<string>();

  for (const diagnostic of params.context.diagnostics) {
    const ruleCode = diagnosticCode(diagnostic);
    if (!ruleCode || seen.has(ruleCode)) continue;

    const ref = getSpecRef(ruleCode);
    if (!ref) continue;
    seen.add(ruleCode);

    const safeFix = safeFixFor(ruleCode, diagnostic, params.textDocument.uri);
    if (safeFix) actions.push(safeFix);

    actions.push(actionForRule(ruleCode, diagnostic));
    actions.push(actionForSpec(ruleCode, diagnostic, ref.href));

    const details = formatRuleDetails(ruleCode);
    if (details) actions.push(actionForCopy(ruleCode, diagnostic, details));
  }

  return actions;
}
