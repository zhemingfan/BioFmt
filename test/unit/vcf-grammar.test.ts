// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Regression: the VCF data-line begin pattern ended with a REQUIRED trailing tab
 * after INFO, so 8-column sites-only rows (dbSNP, gnomAD, ClinVar, 1000G) never
 * matched and received no syntax highlighting. The trailing tab is now optional.
 *
 * The grammar targets Oniguruma, but this begin pattern uses only features JS
 * RegExp shares (char classes, +, ?, non-capturing group, ^/$), so a structural
 * match check is a faithful guard for this specific fix.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Resolve from cwd (mocha runs from the repo root) to stay agnostic to whether the
// test module is loaded as CommonJS or ESM under the current Node/ts-node combo.
const grammar = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'syntaxes/vcf.tmLanguage.json'), 'utf8')
);
const beginRe = new RegExp(grammar.repository['data-line'].begin);

describe('VCF grammar data-line begin', () => {
  it('matches an 8-column sites-only data row and captures INFO', () => {
    const m = beginRe.exec('chr1\t100\trs1\tA\tG\t50\tPASS\tNS=3;DP=14');
    assert.ok(m, 'sites-only row should match');
    assert.strictEqual(m![1], 'chr1');
    assert.strictEqual(m![8], 'NS=3;DP=14');
  });

  it('still matches a row with FORMAT + samples, stopping INFO at the tab', () => {
    const m = beginRe.exec('chr1\t100\trs1\tA\tG\t50\tPASS\tNS=3\tGT:DP\t0/1:5');
    assert.ok(m);
    assert.strictEqual(m![8], 'NS=3');
  });

  it('matches a row with an IUPAC-ambiguity REF base', () => {
    assert.ok(beginRe.exec('chr1\t100\t.\tR\tG\t50\tPASS\t.'), 'IUPAC REF should match');
  });
});
