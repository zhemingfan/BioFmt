// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Regression: the bulk validators split on '\n', leaving a trailing '\r' on the
 * last column of every CRLF (Windows) line. That produced spurious diagnostics —
 * most severely, GFF3 flagged a control-character error on every feature line.
 *
 * Invariant under test: a file validated with CRLF line endings must produce the
 * exact same diagnostics (codes + ranges) as the same file with LF line endings.
 */

import * as assert from 'assert';
import { validateGff3 } from '../../server/src/validators/gff3';
import { validateBed } from '../../server/src/validators/bed';
import { validateBedpe } from '../../server/src/validators/bedpe';
import { validateSam } from '../../server/src/validators/sam';
import { validateVcf } from '../../server/src/validators/vcf';
import { getValidator } from '../../server/src/validators';
import { defaultSettings, type ValidatorFn } from '../../server/src/validators/types';

function ctxFor(text: string) {
  const lines = text.split(/\r?\n/);
  return { uri: 'file:///t', lineCount: lines.length, headerEndLine: 0, bufferLines: lines.length + 10 };
}

function serialize(fn: ValidatorFn, text: string): string[] {
  return fn(text, defaultSettings, ctxFor(text))
    .map(d => `${d.code}@${d.range.start.line}:${d.range.start.character}-${d.range.end.character}`)
    .sort();
}

/** Assert LF and CRLF forms of `lf` validate identically, and (optionally) that LF is clean. */
function assertCrlfEquivalent(fn: ValidatorFn, lf: string, expectCleanLf = true) {
  const crlf = lf.replace(/\n/g, '\r\n');
  const lfDiags = serialize(fn, lf);
  const crlfDiags = serialize(fn, crlf);
  if (expectCleanLf) {
    assert.deepStrictEqual(lfDiags, [], `fixture should be valid under LF, got: ${lfDiags.join(', ')}`);
  }
  assert.deepStrictEqual(crlfDiags, lfDiags, 'CRLF and LF must produce identical diagnostics');
}

describe('CRLF line-ending handling', () => {
  it('GFF3: no control-character (or any) spurious diagnostics on CRLF feature lines', () => {
    assertCrlfEquivalent(
      validateGff3,
      '##gff-version 3\nchr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=g1;Name=x\n'
    );
  });

  it('BED: valid strand on the last column is not flagged under CRLF', () => {
    assertCrlfEquivalent(
      validateBed,
      'chr1\t100\t200\tname\t0\t+\nchr1\t300\t400\tname2\t0\t-\n'
    );
  });

  it('BEDPE: valid trailing strand columns are not flagged under CRLF', () => {
    assertCrlfEquivalent(
      validateBedpe,
      'chr1\t100\t200\tchr2\t300\t400\tpair1\t50\t+\t-\n'
    );
  });

  it('SAM: valid record is not flagged under CRLF', () => {
    assertCrlfEquivalent(
      validateSam,
      '@HD\tVN:1.6\tSO:coordinate\nr1\t0\tchr1\t100\t60\t4M\t*\t0\t0\tACGT\tIIII\n'
    );
  });

  it('VCF: sites-only INFO column is not flagged as an unknown key under CRLF', () => {
    assertCrlfEquivalent(
      validateVcf,
      [
        '##fileformat=VCFv4.3',
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="d">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
        'chr1\t100\t.\tA\tG\t50\tPASS\t.',
      ].join('\n') + '\n'
    );
  });

  it('chrom.sizes (declarative): valid size is not flagged as non-integer under CRLF', () => {
    const v = getValidator('omics-chrom-sizes');
    assert.ok(v, 'declarative chrom.sizes validator should be registered');
    assertCrlfEquivalent(v!, 'chr1\t248956422\nchr2\t242193529\n');
  });
});
