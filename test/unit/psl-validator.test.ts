// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { validatePsl } from '../../server/src/validators';
import { defaultSettings } from '../../server/src/validators/types';
import type { ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

function ctx(text: string): ValidatorContext {
  return { uri: 'file:///test', lineCount: text.split('\n').length, headerEndLine: 0, bufferLines: 500 };
}
const run = (text: string): Diagnostic[] => validatePsl(text, defaultSettings, ctx(text));
const hasError = (d: Diagnostic[], s: string) =>
  d.some(x => x.severity === DiagnosticSeverity.Error && x.message.includes(s));
const hasWarning = (d: Diagnostic[], s: string) =>
  d.some(x => x.severity === DiagnosticSeverity.Warning && x.message.includes(s));

// A canonical valid 21-column PSL line (tab-separated).
// matches misMatches repMatches nCount qNumInsert qBaseInsert tNumInsert tBaseInsert
// strand qName qSize qStart qEnd tName tSize tStart tEnd blockCount blockSizes qStarts tStarts
function validLine(overrides: Partial<Record<number, string>> = {}): string {
  const cols = [
    '1579', '25', '0', '0', '0', '0', '0', '2',     // 0-7 numeric
    '+',                                              // 8 strand
    'mAM992877',                                      // 9 qName
    '1604', '0', '1604',                             // 10-12 qSize qStart qEnd
    'chr1',                                           // 13 tName
    '248956422', '11873', '14361',                   // 14-16 tSize tStart tEnd
    '3',                                              // 17 blockCount
    '354,109,1141,', '0,354,463,', '11873,12612,13220,', // 18-20 blocks
  ];
  for (const k of Object.keys(overrides)) {
    cols[Number(k)] = overrides[Number(k)] as string;
  }
  return cols.join('\t');
}

describe('validatePsl', () => {
  it('fixture happy-path: real PSL fixture produces no error-severity diagnostics', () => {
    const text = fs.readFileSync(getFixturePath('psl-example'), 'utf8');
    const d = run(text);
    const errors = d.filter(x => x.severity === DiagnosticSeverity.Error);
    assert.deepStrictEqual(
      errors.map(e => `${e.range.start.line}: ${e.message}`),
      [],
      'expected no error diagnostics on the fixture'
    );
  });

  it('valid single line produces no diagnostics', () => {
    const d = run(validLine());
    assert.deepStrictEqual(d, [], `expected no diagnostics, got ${JSON.stringify(d.map(x => x.message))}`);
  });

  it('skips header lines (psLayout / match / ---) and blank lines', () => {
    const text = [
      'psLayout version 3',
      '',
      'match\tmis-\trep.\tN\tQ gap\tQ gap\tT gap\tT gap\tstrand\tQ\tQ\tQ\tQ\tT\tT\tT\tT\tblock\tblockSizes\tqStarts\ttStarts',
      '---------------------------------------------------------------------------------------------------------------------------------------------------------------',
      validLine(),
    ].join('\n');
    const d = run(text);
    assert.deepStrictEqual(d, [], `expected no diagnostics, got ${JSON.stringify(d.map(x => x.message))}`);
  });

  // PSL-001
  it('PSL-001: fewer than 21 columns -> error with count', () => {
    const line = ['1', '2', '3', '4', '5'].join('\t'); // 5 columns
    const d = run(line);
    assert.ok(hasError(d, 'PSL requires 21 columns, found 5'), JSON.stringify(d.map(x => x.message)));
  });

  // PSL-002: NaN numeric value
  it('PSL-002: non-numeric value in a numeric column -> "must be a non-negative integer"', () => {
    const d = run(validLine({ 0: 'abc' })); // matches column
    assert.ok(hasError(d, 'matches must be a non-negative integer'), JSON.stringify(d.map(x => x.message)));
  });

  // PSL-002: negative numeric value
  it('PSL-002: negative value in a numeric column -> "must be a non-negative integer"', () => {
    const d = run(validLine({ 17: '-3' })); // blockCount column
    assert.ok(hasError(d, 'blockCount must be a non-negative integer'), JSON.stringify(d.map(x => x.message)));
  });

  // PSL-003: invalid strand
  it('PSL-003: invalid strand -> Invalid strand error', () => {
    const d = run(validLine({ 8: 'x' }));
    assert.ok(hasError(d, 'Invalid strand "x"'), JSON.stringify(d.map(x => x.message)));
  });

  it('PSL-003: accepts double-character strands like "++", "+-", "-+", "--"', () => {
    for (const s of ['++', '+-', '-+', '--', '+', '-']) {
      const d = run(validLine({ 8: s }));
      assert.ok(!hasError(d, 'Invalid strand'), `strand "${s}" should be valid: ${JSON.stringify(d.map(x => x.message))}`);
    }
  });

  // PSL-004: qStart >= qEnd
  it('PSL-004: query start >= query end -> warning', () => {
    const d = run(validLine({ 11: '100', 12: '50' })); // qStart=100 qEnd=50
    assert.ok(hasWarning(d, 'Query start should be less than query end'), JSON.stringify(d.map(x => x.message)));
  });

  it('PSL-004: query start equal to query end -> warning (>= comparison)', () => {
    const d = run(validLine({ 11: '50', 12: '50' }));
    assert.ok(hasWarning(d, 'Query start should be less than query end'), JSON.stringify(d.map(x => x.message)));
  });

  // PSL-005: tStart >= tEnd
  it('PSL-005: target start >= target end -> warning', () => {
    const d = run(validLine({ 15: '14361', 16: '11873' })); // tStart > tEnd
    assert.ok(hasWarning(d, 'Target start should be less than target end'), JSON.stringify(d.map(x => x.message)));
  });

  it('all diagnostics carry source "biofmt"', () => {
    const d = run(validLine({ 0: 'abc', 8: 'x' }));
    assert.ok(d.length > 0);
    assert.ok(d.every(x => x.source === 'biofmt'), JSON.stringify(d));
  });
});
