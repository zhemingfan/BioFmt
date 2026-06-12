// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getVcfCompletions, getVcfDefinition } from '../../server/src/validators/vcf';

// getVcfHeader caches by (uri, version); a fresh uri per document avoids cross-test collisions.
let counter = 0;
function makeDoc(text: string): TextDocument {
  return TextDocument.create(`file:///vcf-${counter++}.vcf`, 'omics-vcf', 1, text);
}

function at(line: number, character: number) {
  return { textDocument: { uri: 'x' }, position: { line, character } };
}

// Declared INFO (DP, AF), FILTER (LowQual), FORMAT (GT, DP). Data line is index 7.
// On that line the columns start at: FILTER=18, INFO=26, FORMAT=39.
const VCF = [
  '##fileformat=VCFv4.3',
  '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
  '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
  '##FILTER=<ID=LowQual,Description="Low quality">',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read depth">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1',
  'chr1\t100\t.\tA\tG\t50\tLowQual\tDP=10;AF=0.5\tGT:DP\t0/1:10',
].join('\n');
const DATA = 7;

const labels = (items: { label: string }[]): string[] => items.map((i) => i.label);

describe('VCF completion', () => {
  it('offers declared INFO keys inside the INFO column', () => {
    const ls = labels(getVcfCompletions(makeDoc(VCF), at(DATA, 27)));
    assert.ok(ls.includes('DP'));
    assert.ok(ls.includes('AF'));
  });

  it('offers declared FORMAT keys inside the FORMAT column', () => {
    const ls = labels(getVcfCompletions(makeDoc(VCF), at(DATA, 39)));
    assert.ok(ls.includes('GT'));
    assert.ok(ls.includes('DP'));
  });

  it('offers PASS and declared filters inside the FILTER column', () => {
    const ls = labels(getVcfCompletions(makeDoc(VCF), at(DATA, 18)));
    assert.ok(ls.includes('PASS'));
    assert.ok(ls.includes('LowQual'));
  });

  it('reports INFO completion detail as "Type (Number)"', () => {
    const dp = getVcfCompletions(makeDoc(VCF), at(DATA, 27)).find((i) => i.label === 'DP');
    assert.ok(dp);
    assert.strictEqual(dp.detail, 'Integer (1)');
  });

  it('returns no completions on a header line', () => {
    assert.strictEqual(getVcfCompletions(makeDoc(VCF), at(1, 5)).length, 0);
  });

  it('returns no completions in a non-key column (CHROM)', () => {
    assert.strictEqual(getVcfCompletions(makeDoc(VCF), at(DATA, 0)).length, 0);
  });
});

describe('VCF go-to-definition', () => {
  it('jumps from an INFO key to its ##INFO header line', () => {
    const defs = getVcfDefinition(makeDoc(VCF), at(DATA, 26));
    assert.ok(defs);
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].range.start.line, 1);
  });

  it('jumps from a FORMAT key to its ##FORMAT header line', () => {
    const defs = getVcfDefinition(makeDoc(VCF), at(DATA, 39));
    assert.ok(defs);
    assert.strictEqual(defs[0].range.start.line, 4);
  });

  it('jumps from a FILTER value to its ##FILTER header line', () => {
    const defs = getVcfDefinition(makeDoc(VCF), at(DATA, 18));
    assert.ok(defs);
    assert.strictEqual(defs[0].range.start.line, 3);
  });

  it('returns null on a header line', () => {
    assert.strictEqual(getVcfDefinition(makeDoc(VCF), at(1, 5)), null);
  });

  it('returns null in a non-key column', () => {
    assert.strictEqual(getVcfDefinition(makeDoc(VCF), at(DATA, 0)), null);
  });
});
