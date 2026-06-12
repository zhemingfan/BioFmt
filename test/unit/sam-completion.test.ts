// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getSamCompletions } from '../../server/src/validators/sam';

let counter = 0;
function makeDoc(text: string): TextDocument {
  return TextDocument.create(`file:///sam-${counter++}.sam`, 'omics-sam', 1, text);
}

function at(line: number, character: number) {
  return { textDocument: { uri: 'x' }, position: { line, character } };
}

// On the data line (index 1) the optional-tag region begins at char 33 (NM:i:0).
const SAM = [
  '@SQ\tSN:ref\tLN:45',
  'r001\t0\tref\t7\t30\t5M\t*\t0\t0\tACGTA\t*\tNM:i:0',
].join('\n');
const TAGS_START = 33;

describe('SAM tag completion', () => {
  it('offers standard tags at the start of the optional-tag region', () => {
    const ls = getSamCompletions(makeDoc(SAM), at(1, TAGS_START)).map((i) => i.label);
    for (const tag of ['NM', 'MD', 'AS', 'RG']) {
      assert.ok(ls.includes(tag), `missing ${tag}`);
    }
  });

  it('includes the type letter in the completion detail', () => {
    const nm = getSamCompletions(makeDoc(SAM), at(1, TAGS_START)).find((i) => i.label === 'NM');
    assert.ok(nm);
    assert.ok(String(nm.detail).startsWith('i'));
  });

  it('returns nothing in a mandatory column', () => {
    assert.strictEqual(getSamCompletions(makeDoc(SAM), at(1, 0)).length, 0);
  });

  it('returns nothing inside a tag value (after the first colon)', () => {
    assert.strictEqual(getSamCompletions(makeDoc(SAM), at(1, TAGS_START + 3)).length, 0);
  });

  it('returns nothing on a header (@) line', () => {
    assert.strictEqual(getSamCompletions(makeDoc(SAM), at(0, 4)).length, 0);
  });

  it('returns nothing on a line with fewer than 11 columns', () => {
    assert.strictEqual(getSamCompletions(makeDoc('r1\t0\tref\t1\t30\t1M'), at(0, 5)).length, 0);
  });
});
