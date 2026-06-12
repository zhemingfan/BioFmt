// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  getGff3Index,
  getGff3Completions,
  getGff3Definition,
  RESERVED_ATTRIBUTES,
} from '../../server/src/validators/gff3';

let counter = 0;
function makeDoc(text: string): TextDocument {
  return TextDocument.create(`file:///gff-${counter++}.gff3`, 'omics-gff3', 1, text);
}

function at(line: number, character: number) {
  return { textDocument: { uri: 'x' }, position: { line, character } };
}

// exon1 is shared across two feature lines (multi-exon pattern).
// On every feature line here the attributes column starts at char 27.
const GFF = [
  '##gff-version 3',
  'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=gene1',
  'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=mrna1;Parent=gene1',
  'chr1\tsrc\texon\t1\t50\t.\t+\t.\tID=exon1;Parent=mrna1',
  'chr1\tsrc\texon\t60\t100\t.\t+\t.\tID=exon1;Parent=mrna1',
].join('\n');
const ATTR_START = 27;

describe('GFF3 index', () => {
  it('maps feature IDs to their line numbers', () => {
    const index = getGff3Index(makeDoc(GFF));
    assert.deepStrictEqual(index.idToLine.get('gene1'), [1]);
    assert.deepStrictEqual(index.idToLine.get('mrna1'), [2]);
  });

  it('records every line for an ID shared across features', () => {
    const index = getGff3Index(makeDoc(GFF));
    assert.deepStrictEqual(index.idToLine.get('exon1'), [3, 4]);
  });

  it('collects attribute keys', () => {
    const index = getGff3Index(makeDoc(GFF));
    assert.ok(index.attributeKeys.has('ID'));
    assert.ok(index.attributeKeys.has('Parent'));
  });
});

describe('GFF3 completion', () => {
  it('offers reserved attribute keys at a tag position', () => {
    const ls = getGff3Completions(makeDoc(GFF), at(2, ATTR_START)).map((i) => i.label);
    for (const tag of RESERVED_ATTRIBUTES) {
      assert.ok(ls.includes(tag), `missing ${tag}`);
    }
  });

  it('offers known feature IDs inside a Parent= value', () => {
    const ls = getGff3Completions(makeDoc(GFF), at(2, 43)).map((i) => i.label);
    assert.ok(ls.includes('gene1'));
    assert.ok(ls.includes('mrna1'));
  });

  it('returns nothing in the seqid column', () => {
    assert.strictEqual(getGff3Completions(makeDoc(GFF), at(2, 0)).length, 0);
  });

  it('returns nothing on a directive line', () => {
    assert.strictEqual(getGff3Completions(makeDoc(GFF), at(0, 5)).length, 0);
  });
});

describe('GFF3 go-to-definition', () => {
  it('jumps from a Parent value to the defining feature line', () => {
    const defs = getGff3Definition(makeDoc(GFF), at(2, 43)); // "gene1" in Parent=gene1
    assert.ok(defs);
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].range.start.line, 1);
  });

  it('returns all lines when the referenced ID is shared', () => {
    const doc = makeDoc([
      '##gff-version 3',
      'chr1\tsrc\texon\t1\t50\t.\t+\t.\tID=shared',
      'chr1\tsrc\texon\t60\t100\t.\t+\t.\tID=shared',
      'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=m;Parent=shared',
    ].join('\n'));
    // On line 3, attrs start at 27; the "shared" value starts at 27 + len("ID=m;Parent=") = 39.
    const defs = getGff3Definition(doc, at(3, 39));
    assert.ok(defs);
    assert.strictEqual(defs.length, 2);
    assert.deepStrictEqual(defs.map((d) => d.range.start.line).sort(), [1, 2]);
  });

  it('returns null for an unresolved Parent reference', () => {
    const doc = makeDoc([
      '##gff-version 3',
      'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=m;Parent=ghost',
    ].join('\n'));
    assert.strictEqual(getGff3Definition(doc, at(1, 39)), null);
  });

  it('returns null on a non-reference attribute', () => {
    assert.strictEqual(getGff3Definition(makeDoc(GFF), at(1, ATTR_START + 1)), null);
  });
});
