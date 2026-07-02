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

describe('VCF-X001 sample / FORMAT arity', () => {
  const headerLines = [
    '##fileformat=VCFv4.3',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype Quality">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1',
  ].join('\n');

  function x001CodesFor(sample: string): string[] {
    const text = headerLines + '\n' + `chr1\t100\t.\tA\tT\t30\tPASS\t.\tGT:GQ\t${sample}\n`;
    const lines = text.split('\n');
    const context: ValidatorContext = {
      uri: 'file:///t.vcf',
      lineCount: lines.length,
      headerEndLine: 0,
      bufferLines: lines.length + 10,
    };
    return validateVcf(text, defaultSettings, context)
      .filter(d => d.code === 'VCF-X001')
      .map(d => String(d.code));
  }

  it('does not flag a sample that drops trailing FORMAT sub-fields (spec-legal)', () => {
    assert.deepStrictEqual(x001CodesFor('0/1'), []);
  });

  it('flags a sample with more values than FORMAT keys', () => {
    assert.deepStrictEqual(x001CodesFor('0/1:99:100'), ['VCF-X001']);
  });
});
