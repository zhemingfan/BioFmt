// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { makeDeclarativeValidator } from '../../server/src/validators/declarative';
import { defaultSettings, type BioFmtSettings, type ValidatorContext } from '../../server/src/validators/types';
import type { FormatSpec } from '../../src/shared/formatSpec';

const HREF = 'https://example.com/spec';

function testSpec(): FormatSpec {
  return {
    specVersion: 1,
    identity: {
      languageId: 'omics-test',
      displayName: 'Test',
      aliases: ['Test'],
      extensions: ['.test'],
      scopeName: 'source.test',
    },
    tokenize: {
      delimiter: 'tab',
      lineKinds: [
        {
          name: 'data',
          kind: 'columns',
          columns: [
            { name: 'name', type: 'string', scope: 'string.unquoted.name' },
            { name: 'start', type: 'int', scope: 'constant.numeric.start' },
            { name: 'end', type: 'int', scope: 'constant.numeric.end' },
            { name: 'strand', type: 'string', scope: 'keyword.operator.strand' },
            { name: 'category', type: 'string', scope: 'string.unquoted.category' },
            { name: 'ref', type: 'string', scope: 'string.unquoted.ref' },
            { name: 'depth', type: 'int', scope: 'constant.numeric.depth' },
          ],
        },
      ],
    },
    validate: {
      skipPrefixes: ['track'],
      rules: [
        { id: 'minColumns', code: 'TEST-001', min: 3, message: 'needs 3 columns', spec: { href: HREF, summary: 'min cols' } },
        { id: 'column', code: 'TEST-002', column: 1, name: 'start', type: 'int', min: 0, message: 'start must be a non-negative integer', spec: { href: HREF, summary: 'int' } },
        { id: 'coordinatePair', code: 'TEST-005', startColumn: 1, endColumn: 2, startName: 'start', endName: 'end', message: 'start must be < end', spec: { href: HREF, summary: 'coords' } },
        { id: 'strand', code: 'TEST-006', column: 3, values: ['+', '-'], message: 'strand must be + or -', spec: { href: HREF, summary: 'strand' } },
        { id: 'column', code: 'TEST-003', column: 4, name: 'category', type: 'enum', values: ['A', 'B'], allowDot: true, severity: 'warning', message: 'category must be A or B', spec: { href: HREF, summary: 'enum' } },
        { id: 'column', code: 'TEST-004', column: 5, name: 'ref', type: 'regex', pattern: '^chr', message: 'ref must start with chr', spec: { href: HREF, summary: 'regex' } },
        { id: 'column', code: 'TEST-007', column: 6, name: 'depth', type: 'int', strict: true, message: 'depth must be an integer', spec: { href: HREF, summary: 'strict int' } },
      ],
    },
    render: { renderer: 'table', columns: [{ key: 'name', label: 'name' }] },
  };
}

function run(text: string, level: BioFmtSettings['validation']['level'] = 'strict', spec: FormatSpec = testSpec()) {
  const lines = text.split('\n');
  const settings: BioFmtSettings = { ...defaultSettings, validation: { level, maxDiagnostics: 2000 } };
  const context: ValidatorContext = {
    uri: 'file:///test.test',
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };
  return makeDeclarativeValidator(spec)(text, settings, context);
}

function codes(text: string, level: BioFmtSettings['validation']['level'] = 'strict'): string[] {
  return run(text, level).map((d) => String(d.code));
}

describe('declarative interpreter', () => {
  it('accepts a fully valid line', () => {
    assert.deepStrictEqual(run('a\t1\t10\t+\tA\tchr1\t5'), []);
  });

  it('enforces minColumns', () => {
    assert.ok(codes('a\t1').includes('TEST-001'));
  });

  it('flags a non-integer int column', () => {
    assert.ok(codes('a\tx\t10\t+\tA\tchr1\t5').includes('TEST-002'));
  });

  it('flags an int column below its min', () => {
    assert.ok(codes('a\t-1\t10\t+\tA\tchr1\t5').includes('TEST-002'));
  });

  it('flags start >= end via coordinatePair', () => {
    assert.ok(codes('a\t10\t5\t+\tA\tchr1\t5').includes('TEST-005'));
  });

  it('flags an invalid strand', () => {
    assert.ok(codes('a\t1\t10\t?\tA\tchr1\t5').includes('TEST-006'));
  });

  it('flags an out-of-set enum but allows a dot placeholder', () => {
    assert.ok(codes('a\t1\t10\t+\tZ\tchr1\t5').includes('TEST-003'));
    assert.ok(!codes('a\t1\t10\t+\t.\tchr1\t5').includes('TEST-003'));
  });

  it('flags a value that fails a regex column', () => {
    assert.ok(codes('a\t1\t10\t+\tA\tscaf1\t5').includes('TEST-004'));
  });

  it('honors per-rule severity', () => {
    const diag = run('a\t1\t10\t+\tZ\tchr1\t5').find((d) => d.code === 'TEST-003');
    assert.ok(diag);
    assert.strictEqual(diag!.severity, DiagnosticSeverity.Warning);
  });

  it('attaches the spec href as codeDescription', () => {
    const diag = run('a\t1').find((d) => d.code === 'TEST-001');
    assert.ok(diag);
    assert.deepStrictEqual(diag!.codeDescription, { href: HREF });
  });

  it('gates strict-only rules to the strict level', () => {
    assert.ok(!codes('a\t1\t10\t+\tA\tchr1\tx', 'basic').includes('TEST-007'));
    assert.ok(codes('a\t1\t10\t+\tA\tchr1\tx', 'strict').includes('TEST-007'));
  });

  it('skips comment and skip-prefix lines', () => {
    assert.deepStrictEqual(run('# a comment\ntrack name=x'), []);
  });

  it('sets source to biofmt on diagnostics', () => {
    const diag = run('a\t1')[0];
    assert.strictEqual(diag.source, 'biofmt');
  });
});
