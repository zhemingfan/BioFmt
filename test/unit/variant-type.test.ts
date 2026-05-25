// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { classifyVariantType, summarizeVariantTypes } from '../../webview/src/utils/variantType';

describe('classifyVariantType', () => {
  it('classifies SNVs', () => {
    assert.strictEqual(classifyVariantType('A', 'G'), 'SNP');
    assert.strictEqual(classifyVariantType('C', 'T'), 'SNP');
  });

  it('classifies insertions and deletions by length', () => {
    assert.strictEqual(classifyVariantType('A', 'ATG'), 'Insertion');
    assert.strictEqual(classifyVariantType('ATG', 'A'), 'Deletion');
  });

  it('classifies equal-length multi-base substitutions as MNV', () => {
    assert.strictEqual(classifyVariantType('AT', 'GC'), 'MNV');
  });

  it('classifies symbolic alleles as SV', () => {
    assert.strictEqual(classifyVariantType('N', '<DEL>'), 'SV');
    assert.strictEqual(classifyVariantType('N', '<DUP:TANDEM>'), 'SV');
  });

  it('classifies BND breakends (not insertions) — the somatic SV case', () => {
    // Real ALTs from test/fixtures/vcf_somatic_sv.vcf (SVTYPE=BND)
    assert.strictEqual(classifyVariantType('T', ']11:94987872]T'), 'Breakend');
    assert.strictEqual(classifyVariantType('G', 'G]11:94975749]'), 'Breakend');
    assert.strictEqual(classifyVariantType('T', 'T[8:107653411['), 'Breakend');
    // Regression guard: these must never be counted as insertions
    assert.notStrictEqual(classifyVariantType('G', 'G]11:94975749]'), 'Insertion');
  });

  it('classifies single-breakend (telomeric) notation as Breakend', () => {
    assert.strictEqual(classifyVariantType('G', '.G'), 'Breakend');
    assert.strictEqual(classifyVariantType('G', 'G.'), 'Breakend');
  });
});

describe('summarizeVariantTypes', () => {
  it('returns an empty summary for no variants', () => {
    assert.deepStrictEqual(summarizeVariantTypes([]), { total: 0, types: [] });
  });

  it('summarizes the somatic SV case as 6 breakends at 100%', () => {
    const rows = [
      { ref: 'T', alt: ']11:94987872]T' },
      { ref: 'G', alt: 'G]11:94975749]' },
      { ref: 'G', alt: 'G]8:107653520]' },
      { ref: 'T', alt: 'T]11:94987865]' },
      { ref: 'A', alt: 'A]11:94975753]' },
      { ref: 'T', alt: 'T[8:107653411[' },
    ];
    assert.deepStrictEqual(summarizeVariantTypes(rows), {
      total: 6,
      types: [{ label: 'Breakend', count: 6, pct: 100 }],
    });
  });

  it('counts each type, computes % of total, and sorts by count descending', () => {
    const rows = [
      { ref: 'A', alt: 'G' }, // SNP
      { ref: 'C', alt: 'T' }, // SNP
      { ref: 'A', alt: 'G' }, // SNP
      { ref: 'A', alt: 'ATG' }, // Insertion
    ];
    const summary = summarizeVariantTypes(rows);
    assert.strictEqual(summary.total, 4);
    assert.deepStrictEqual(summary.types, [
      { label: 'SNP', count: 3, pct: 75 },
      { label: 'Insertion', count: 1, pct: 25 },
    ]);
  });

  it('counts multi-allelic ALTs per allele and skips "." ALTs', () => {
    const rows = [
      { ref: 'A', alt: 'G,T' }, // two SNP alleles
      { ref: 'A', alt: '.' }, // no ALT — skipped
    ];
    const summary = summarizeVariantTypes(rows);
    assert.strictEqual(summary.total, 2);
    assert.deepStrictEqual(summary.types, [{ label: 'SNP', count: 2, pct: 100 }]);
  });
});
