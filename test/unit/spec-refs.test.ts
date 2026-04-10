// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { SPEC_REFS } from '../../server/src/specRefs';

describe('Spec References', () => {
  it('should have no duplicate codes', () => {
    const codes = new Set<string>();
    for (const [key, ref] of SPEC_REFS) {
      assert.ok(!codes.has(key), `Duplicate code: ${key}`);
      assert.strictEqual(ref.code, key);
      codes.add(key);
    }
  });

  it('should have valid hrefs for all entries', () => {
    for (const [code, ref] of SPEC_REFS) {
      assert.ok(ref.href && ref.href.length > 0, `${code} missing href`);
      assert.ok(ref.href.startsWith('http'), `${code} href should be a URL`);
    }
  });

  it('should have non-empty summaries for all entries', () => {
    for (const [code, ref] of SPEC_REFS) {
      assert.ok(ref.summary && ref.summary.length > 0, `${code} missing summary`);
    }
  });

  it('should cover all major formats', () => {
    const formats = ['VCF', 'BED', 'BEDPE', 'SAM', 'GTF', 'GFF3', 'PAF', 'PSL', 'WIG', 'BDG', 'FASTA', 'FASTQ'];
    for (const format of formats) {
      const hasFormat = Array.from(SPEC_REFS.keys()).some(k => k.startsWith(format + '-'));
      assert.ok(hasFormat, `Missing spec refs for ${format}`);
    }
  });

  it('should have at least 50 rules', () => {
    assert.ok(SPEC_REFS.size >= 50, `Expected at least 50 rules, got ${SPEC_REFS.size}`);
  });
});
