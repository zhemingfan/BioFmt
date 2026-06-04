// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { parseInfoField } from '../../src/shared/infoField';

describe('parseInfoField', () => {
  it('parses key=value pairs', () => {
    assert.deepStrictEqual(parseInfoField('DP=10;AF=0.5'), { DP: '10', AF: '0.5' });
  });

  it('treats valueless entries as boolean flags', () => {
    assert.deepStrictEqual(parseInfoField('DB;H3'), { DB: true, H3: true });
  });

  it('handles a mix of pairs and flags', () => {
    assert.deepStrictEqual(parseInfoField('NS=3;DB;AF=0.1'), { NS: '3', DB: true, AF: '0.1' });
  });

  it('returns an empty object for an empty string', () => {
    assert.deepStrictEqual(parseInfoField(''), {});
  });
});
