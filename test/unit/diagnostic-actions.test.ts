// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import type { Diagnostic } from 'vscode-languageserver-types';
import {
  COPY_RULE_COMMAND,
  type DiagnosticCodeActionParams,
  OPEN_RULE_COMMAND,
  OPEN_SPEC_COMMAND,
  getDiagnosticCodeActions,
} from '../../server/src/diagnosticActions';
import { SPEC_REFS } from '../../server/src/specRefs';

function paramsFor(diagnostic: Diagnostic): DiagnosticCodeActionParams {
  return {
    textDocument: { uri: 'file:///example.gff3' },
    context: { diagnostics: [diagnostic] },
  };
}

function diagnostic(code: string): Diagnostic {
  return {
    source: 'biofmt',
    code,
    message: 'Example diagnostic',
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
  };
}

describe('Diagnostic Code Actions', () => {
  it('creates explain, spec, and copy actions for known BioFmt rules', () => {
    const actions = getDiagnosticCodeActions(paramsFor(diagnostic('VCF-005')));
    const commands = actions.map(action => action.command?.command);

    assert.deepStrictEqual(commands, [
      OPEN_RULE_COMMAND,
      OPEN_SPEC_COMMAND,
      COPY_RULE_COMMAND,
    ]);

    assert.strictEqual(actions[0].command?.arguments?.[0], 'VCF-005');
    assert.strictEqual(actions[1].command?.arguments?.[0], SPEC_REFS.get('VCF-005')?.href);
    assert.ok(String(actions[2].command?.arguments?.[0]).includes('VCF-005'));
  });

  it('adds a deterministic safe fix for missing GFF3 version directives', () => {
    const actions = getDiagnosticCodeActions(paramsFor(diagnostic('GFF3_MISSING_VERSION')));
    const fix = actions[0];

    assert.strictEqual(fix.title, 'BioFmt: Insert ##gff-version 3');
    assert.strictEqual(fix.isPreferred, true);
    assert.deepStrictEqual(fix.edit?.changes?.['file:///example.gff3'], [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        newText: '##gff-version 3\n',
      },
    ]);
  });

  it('does not offer actions for unknown diagnostic codes', () => {
    const actions = getDiagnosticCodeActions(paramsFor(diagnostic('UNKNOWN-001')));
    assert.deepStrictEqual(actions, []);
  });
});
