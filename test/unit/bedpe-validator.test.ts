// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { validateBedpe } from '../../server/src/validators/bedpe';
import { defaultSettings, type ValidatorContext } from '../../server/src/validators/types';

function validate(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const context: ValidatorContext = {
    uri: 'file:///t.bedpe',
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };
  return validateBedpe(text, defaultSettings, context).map(d => String(d.code));
}

describe('BEDPE validator', () => {
  it('accepts a valid paired record', () => {
    assert.deepStrictEqual(validate('chr1\t100\t200\tchr2\t300\t400\tpair1\t50\t+\t-\n'), []);
  });

  it('accepts an unknown mate (chrom=".", start/end=-1) without false errors', () => {
    // Single-breakend / translocation with an unknown mate — BEDPE spec sentinel.
    assert.deepStrictEqual(validate('chr1\t100\t200\t.\t-1\t-1\n'), []);
  });

  it('still flags a genuinely negative coordinate on a known mate', () => {
    assert.deepStrictEqual(validate('chr1\t100\t200\tchr2\t-5\t400\n'), ['BEDPE-004']);
  });

  it('flags fewer than 6 columns', () => {
    assert.deepStrictEqual(validate('chr1\t100\t200\n'), ['BEDPE-001']);
  });
});
