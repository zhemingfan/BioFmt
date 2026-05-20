// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { validateVcf } from '../../server/src/validators/vcf';
import {
  defaultSettings,
  type BioFmtSettings,
  type ValidatorContext,
} from '../../server/src/validators/types';
import { FIXTURES_DIR } from '../fixtures.index';

function validateFixture(filename: string, level: BioFmtSettings['validation']['level'] = 'strict') {
  const text = fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
  const lines = text.split('\n');
  const settings: BioFmtSettings = {
    ...defaultSettings,
    validation: {
      level,
      maxDiagnostics: 2000,
    },
  };
  const context: ValidatorContext = {
    uri: `file:///${filename}`,
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };

  return validateVcf(text, settings, context);
}

describe('VCF Validator', () => {
  it('uses the VCF errors demo fixture to exercise each VCF diagnostic code', () => {
    const expectedCodes = [
      'VCF-001',
      'VCF-002',
      'VCF-003',
      'VCF-004',
      'VCF-005',
      'VCF-006',
      'VCF-S001',
      'VCF-S002',
      'VCF-S003',
      'VCF-S004',
      'VCF-S005',
      'VCF-X001',
      'VCF-X002',
      'VCF-X003',
    ].sort();

    const actualCodes = validateFixture('vcf-errors-demo.vcf')
      .map(diagnostic => String(diagnostic.code))
      .sort();

    assert.deepStrictEqual(actualCodes, expectedCodes);
  });
});
