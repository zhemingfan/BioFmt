// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as assert from 'assert';
import { DECLARATIVE_VALIDATORS } from '../../server/src/validators/declarative';
import { defaultSettings, type BioFmtSettings, type ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

/**
 * Second declarative format, proving the system generalizes beyond chrom.sizes:
 * interval_list exercises @-header skipping, a coordinate pair, and a strand enum
 * — all from /formats/interval-list.json with no format-specific TypeScript.
 */

function validate(text: string, level: BioFmtSettings['validation']['level'] = 'strict') {
  const validator = DECLARATIVE_VALIDATORS.get('omics-interval-list');
  assert.ok(validator, 'omics-interval-list validator should be registered');
  const lines = text.split('\n');
  const settings: BioFmtSettings = { ...defaultSettings, validation: { level, maxDiagnostics: 2000 } };
  const context: ValidatorContext = {
    uri: 'file:///x.interval_list',
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };
  return validator!(text, settings, context);
}

describe('interval_list declarative format', () => {
  it('registers a validator for omics-interval-list', () => {
    assert.ok(DECLARATIVE_VALIDATORS.has('omics-interval-list'));
  });

  it('accepts a valid interval_list and skips the @ header', () => {
    const text = fs.readFileSync(getFixturePath('interval-list-example'), 'utf8');
    assert.deepStrictEqual(validate(text), []);
  });

  it('flags start > end (INTERVALLIST-002) but allows start == end', () => {
    assert.ok(validate('chr1\t100\t50\t+\tt1').map((d) => String(d.code)).includes('INTERVALLIST-002'));
    assert.deepStrictEqual(validate('chr1\t10\t10\t+\tt1'), []);
  });

  it('flags an invalid strand (INTERVALLIST-003)', () => {
    assert.ok(validate('chr1\t1\t10\t?\tt1').map((d) => String(d.code)).includes('INTERVALLIST-003'));
  });
});
