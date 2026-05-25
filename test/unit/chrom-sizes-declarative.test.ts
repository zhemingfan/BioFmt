// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as assert from 'assert';
import { DECLARATIVE_VALIDATORS } from '../../server/src/validators/declarative';
import { defaultSettings, type BioFmtSettings, type ValidatorContext } from '../../server/src/validators/types';
import { getFixturePath } from '../fixtures.index';

/**
 * End-to-end parity test for the chrom.sizes declarative format: the real
 * /formats/chrom-sizes.json spec, wired through DECLARATIVE_VALIDATORS, run
 * against real fixtures. Proves a format added with only JSON validates.
 */

function validateFixture(id: string) {
  const validator = DECLARATIVE_VALIDATORS.get('omics-chrom-sizes');
  assert.ok(validator, 'omics-chrom-sizes validator should be registered');
  const text = fs.readFileSync(getFixturePath(id), 'utf8');
  const lines = text.split('\n');
  const settings: BioFmtSettings = { ...defaultSettings, validation: { level: 'strict', maxDiagnostics: 2000 } };
  const context: ValidatorContext = {
    uri: 'file:///chrom.sizes',
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };
  return validator!(text, settings, context);
}

describe('chrom.sizes declarative format', () => {
  it('registers a validator for omics-chrom-sizes', () => {
    assert.ok(DECLARATIVE_VALIDATORS.has('omics-chrom-sizes'));
  });

  it('accepts a valid chrom.sizes file', () => {
    assert.deepStrictEqual(validateFixture('chrom-sizes-example'), []);
  });

  it('flags negative, non-numeric, and zero sizes (CHROMSIZES-002)', () => {
    const codes = validateFixture('chrom-sizes-errors').map((d) => String(d.code));
    assert.ok(codes.includes('CHROMSIZES-002'), `expected CHROMSIZES-002, got ${codes.join(', ')}`);
    // -5, notanumber, and 0 are all invalid sizes
    assert.ok(codes.filter((c) => c === 'CHROMSIZES-002').length >= 3, `expected >=3 size errors, got ${codes.join(', ')}`);
  });

  it('flags a row missing the size column (CHROMSIZES-001)', () => {
    const codes = validateFixture('chrom-sizes-errors').map((d) => String(d.code));
    assert.ok(codes.includes('CHROMSIZES-001'), `expected CHROMSIZES-001, got ${codes.join(', ')}`);
  });
});
