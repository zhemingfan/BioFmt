// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  getGff3Index,
  getGff3References,
  getGff3PrepareRename,
  getGff3Rename,
} from '../../server/src/validators/gff3';

let counter = 0;
function makeDoc(text: string): TextDocument {
  return TextDocument.create(`file:///gff-rr-${counter++}.gff3`, 'omics-gff3', 1, text);
}

// gene1 is declared on line 1 and referenced (Parent=gene1) on line 2.
// mrna1 is declared on line 2 and referenced on lines 3 and 4.
// exon1 is declared twice (lines 3 and 4) — the multi-exon pattern.
const LINES = [
  '##gff-version 3',
  'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=gene1',
  'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=mrna1;Parent=gene1',
  'chr1\tsrc\texon\t1\t50\t.\t+\t.\tID=exon1;Parent=mrna1',
  'chr1\tsrc\texon\t60\t100\t.\t+\t.\tID=exon1;Parent=mrna1',
];
const GFF = LINES.join('\n');

// Absolute column of the first character of `value` where it appears right
// after `prefix` (e.g. the gene1 inside "Parent=gene1").
function charOf(line: number, prefix: string, value: string): number {
  return LINES[line].indexOf(prefix + value) + prefix.length;
}

function refParams(line: number, character: number, includeDeclaration: boolean) {
  return {
    textDocument: { uri: 'x' },
    position: { line, character },
    context: { includeDeclaration },
  };
}

function renameParams(line: number, character: number, newName: string) {
  return { textDocument: { uri: 'x' }, position: { line, character }, newName };
}

function posParams(line: number, character: number) {
  return { textDocument: { uri: 'x' }, position: { line, character } };
}

describe('GFF3 index occurrences', () => {
  it('records both the declaration and the reference of an ID', () => {
    const occ = getGff3Index(makeDoc(GFF)).occurrences.get('gene1');
    assert.ok(occ, 'expected occurrences for gene1');
    assert.deepStrictEqual(occ!.map((o) => o.line).sort(), [1, 2]);
    assert.strictEqual(occ!.find((o) => o.isDeclaration)?.line, 1);
    assert.strictEqual(occ!.find((o) => !o.isDeclaration)?.line, 2);
  });

  it('records precise character ranges for each occurrence', () => {
    const occ = getGff3Index(makeDoc(GFF)).occurrences.get('gene1')!;
    const decl = occ.find((o) => o.isDeclaration)!;
    const start = charOf(1, 'ID=', 'gene1');
    assert.strictEqual(decl.startChar, start);
    assert.strictEqual(decl.endChar, start + 'gene1'.length);
  });

  it('treats repeated ID declarations as multiple declarations', () => {
    const occ = getGff3Index(makeDoc(GFF)).occurrences.get('exon1')!;
    assert.strictEqual(occ.length, 2);
    assert.ok(occ.every((o) => o.isDeclaration));
  });
});

describe('GFF3 find references', () => {
  it('returns declaration and references when includeDeclaration is true', () => {
    const c = charOf(2, 'Parent=', 'gene1');
    const refs = getGff3References(makeDoc(GFF), refParams(2, c, true));
    assert.ok(refs);
    assert.deepStrictEqual(refs!.map((r) => r.range.start.line).sort(), [1, 2]);
  });

  it('excludes the declaration when includeDeclaration is false', () => {
    const c = charOf(1, 'ID=', 'gene1');
    const refs = getGff3References(makeDoc(GFF), refParams(1, c, false));
    assert.ok(refs);
    assert.deepStrictEqual(refs!.map((r) => r.range.start.line), [2]);
  });

  it('finds every reference to a shared parent ID', () => {
    const c = charOf(2, 'ID=', 'mrna1');
    const refs = getGff3References(makeDoc(GFF), refParams(2, c, false));
    assert.ok(refs);
    assert.deepStrictEqual(refs!.map((r) => r.range.start.line).sort(), [3, 4]);
  });

  it('returns reference ranges covering only the identifier', () => {
    const c = charOf(2, 'Parent=', 'gene1');
    const refs = getGff3References(makeDoc(GFF), refParams(2, c, false))!;
    assert.strictEqual(refs[0].range.start.character, c);
    assert.strictEqual(refs[0].range.end.character, c + 'gene1'.length);
  });

  it('returns null when the cursor is not on an identifier', () => {
    assert.strictEqual(getGff3References(makeDoc(GFF), refParams(2, 0, true)), null);
    assert.strictEqual(getGff3References(makeDoc(GFF), refParams(0, 5, true)), null);
  });
});

describe('GFF3 prepare rename', () => {
  it('returns the identifier range and placeholder', () => {
    const c = charOf(1, 'ID=', 'gene1');
    const prep = getGff3PrepareRename(makeDoc(GFF), posParams(1, c));
    assert.ok(prep);
    assert.strictEqual(prep!.placeholder, 'gene1');
    assert.strictEqual(prep!.range.start.line, 1);
    assert.strictEqual(prep!.range.start.character, c);
    assert.strictEqual(prep!.range.end.character, c + 'gene1'.length);
  });

  it('returns null when the cursor is not on an identifier', () => {
    assert.strictEqual(getGff3PrepareRename(makeDoc(GFF), posParams(1, 0)), null);
  });
});

describe('GFF3 rename', () => {
  it('rewrites the declaration and every reference', () => {
    const doc = makeDoc(GFF);
    const edit = getGff3Rename(doc, renameParams(1, charOf(1, 'ID=', 'gene1'), 'geneX'));
    assert.ok(edit);
    const edits = edit!.changes![doc.uri];
    assert.strictEqual(edits.length, 2);
    assert.ok(edits.every((e) => e.newText === 'geneX'));
    assert.deepStrictEqual(edits.map((e) => e.range.start.line).sort(), [1, 2]);
  });

  it('replaces only the identifier span, not the whole attribute', () => {
    const doc = makeDoc(GFF);
    const edit = getGff3Rename(doc, renameParams(1, charOf(1, 'ID=', 'gene1'), 'geneX'))!;
    const declEdit = edit.changes![doc.uri].find((e) => e.range.start.line === 1)!;
    const start = charOf(1, 'ID=', 'gene1');
    assert.strictEqual(declEdit.range.start.character, start);
    assert.strictEqual(declEdit.range.end.character, start + 'gene1'.length);
  });

  it('throws on an identifier containing reserved characters or whitespace', () => {
    const doc = makeDoc(GFF);
    const at = () => charOf(1, 'ID=', 'gene1');
    assert.throws(() => getGff3Rename(doc, renameParams(1, at(), 'a;b')));
    assert.throws(() => getGff3Rename(doc, renameParams(1, at(), 'a b')));
    assert.throws(() => getGff3Rename(doc, renameParams(1, at(), '')));
  });

  it('returns null when the cursor is not on an identifier', () => {
    assert.strictEqual(getGff3Rename(makeDoc(GFF), renameParams(2, 0, 'x')), null);
  });
});
