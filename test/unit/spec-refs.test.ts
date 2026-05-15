// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { SPEC_REFS } from '../../server/src/specRefs';
import { validateGff3 } from '../../server/src/validators/gff3';
import { defaultSettings, type ValidatorContext } from '../../server/src/validators/types';

const GFF3_SPEC_BASE = 'https://github.com/The-Sequence-Ontology/Specifications/blob/fe73505276dd324bf6a55773f3413fe2bed47af4/gff3.md?plain=1';

const EXPECTED_GFF3_HREFS = new Map([
  ['GFF3_MISSING_VERSION', `${GFF3_SPEC_BASE}#L138-L140`],
  ['GFF3_VERSION_NOT_FIRST', `${GFF3_SPEC_BASE}#L138-L140`],
  ['GFF3_DUPLICATE_VERSION', `${GFF3_SPEC_BASE}#L138-L140`],
  ['GFF3_MALFORMED_DIRECTIVE', `${GFF3_SPEC_BASE}#L138-L140`],
  ['GFF3_DUPLICATE_SEQUENCE_REGION', `${GFF3_SPEC_BASE}#L473-L474`],
  ['GFF3_FIELD_COUNT', `${GFF3_SPEC_BASE}#L24`],
  ['GFF3_INLINE_COMMENT', `${GFF3_SPEC_BASE}#L138`],
  ['GFF3_INVALID_PERCENT_ESCAPE', `${GFF3_SPEC_BASE}#L64-L66`],
  ['GFF3_ILLEGAL_CONTROL_CHARACTER', `${GFF3_SPEC_BASE}#L64-L66`],
  ['GFF3_INVALID_SEQID', `${GFF3_SPEC_BASE}#L44-L45`],
  ['GFF3_INVALID_TYPE', `${GFF3_SPEC_BASE}#L48-L49`],
  ['GFF3_INVALID_START', `${GFF3_SPEC_BASE}#L50-L52`],
  ['GFF3_INVALID_END', `${GFF3_SPEC_BASE}#L50-L52`],
  ['GFF3_START_GT_END', `${GFF3_SPEC_BASE}#L50-L52`],
  ['GFF3_INVALID_SCORE', `${GFF3_SPEC_BASE}#L55-L56`],
  ['GFF3_INVALID_STRAND', `${GFF3_SPEC_BASE}#L57-L58`],
  ['GFF3_INVALID_PHASE', `${GFF3_SPEC_BASE}#L59-L62`],
  ['GFF3_CDS_PHASE_REQUIRED', `${GFF3_SPEC_BASE}#L59-L62`],
  ['GFF3_INVALID_ATTRIBUTES', `${GFF3_SPEC_BASE}#L64-L96`],
  ['GFF3_EMPTY_ATTRIBUTE_TAG', `${GFF3_SPEC_BASE}#L64-L66`],
  ['GFF3_MISSING_ATTRIBUTE_EQUALS', `${GFF3_SPEC_BASE}#L64-L66`],
  ['GFF3_INVALID_MULTIVALUE_ATTRIBUTE', `${GFF3_SPEC_BASE}#L92-L95`],
  ['GFF3_UNKNOWN_RESERVED_ATTRIBUTE', `${GFF3_SPEC_BASE}#L95-L96`],
  ['GFF3_INVALID_TARGET', `${GFF3_SPEC_BASE}#L77-L78`],
  ['GFF3_INVALID_GAP', `${GFF3_SPEC_BASE}#L258-L265`],
  ['GFF3_INVALID_DBXREF', `${GFF3_SPEC_BASE}#L447-L449`],
  ['GFF3_INVALID_ONTOLOGY_TERM', `${GFF3_SPEC_BASE}#L447-L449`],
  ['GFF3_INVALID_IS_CIRCULAR', `${GFF3_SPEC_BASE}#L238-L244`],
  ['GFF3_DUPLICATE_ID_CONFLICT', `${GFF3_SPEC_BASE}#L69-L70`],
  ['GFF3_UNRESOLVED_PARENT', `${GFF3_SPEC_BASE}#L75-L76`],
  ['GFF3_UNRESOLVED_DERIVES_FROM', `${GFF3_SPEC_BASE}#L81-L82`],
  ['GFF3_PARENT_CYCLE', `${GFF3_SPEC_BASE}#L250-L254`],
  ['GFF3_OUT_OF_BOUNDS', `${GFF3_SPEC_BASE}#L473-L474`],
  ['GFF3_FASTA_BEFORE_HEADER', `${GFF3_SPEC_BASE}#L530-L532`],
  ['GFF3_ANNOTATION_AFTER_FASTA', `${GFF3_SPEC_BASE}#L530-L532`],
]);

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
      const prefix = format === 'GFF3' ? 'GFF3_' : `${format}-`;
      const hasFormat = Array.from(SPEC_REFS.keys()).some(k => k.startsWith(prefix));
      assert.ok(hasFormat, `Missing spec refs for ${format}`);
    }
  });

  it('should have at least 50 rules', () => {
    assert.ok(SPEC_REFS.size >= 50, `Expected at least 50 rules, got ${SPEC_REFS.size}`);
  });

  it('should pin every GFF3 rule to an exact spec line anchor', () => {
    const gff3Codes = Array.from(SPEC_REFS.keys()).filter(code => code.startsWith('GFF3_')).sort();
    const expectedCodes = Array.from(EXPECTED_GFF3_HREFS.keys()).sort();

    assert.deepStrictEqual(gff3Codes, expectedCodes);

    for (const [code, expectedHref] of EXPECTED_GFF3_HREFS) {
      const ref = SPEC_REFS.get(code);
      assert.ok(ref, `Missing spec ref for ${code}`);
      assert.strictEqual(ref.href, expectedHref);
      assert.ok(ref.href.includes('?plain=1#L'), `${code} should link to a specific source line anchor`);
      assert.ok(!ref.href.includes('/master/'), `${code} should pin the spec commit instead of master`);
    }
  });

  it('should attach exact GFF3 spec hrefs to diagnostics', () => {
    const context: ValidatorContext = {
      uri: 'file:///example.gff3',
      lineCount: 2,
      headerEndLine: 0,
      bufferLines: 500,
    };
    const diagnostics = validateGff3(
      '##gff-version 3\nchr1\tsource\tgene\t1\t10\t.\tinvalid\t.\tID=gene1',
      defaultSettings,
      context,
    );
    const strandDiagnostic = diagnostics.find(diagnostic => diagnostic.code === 'GFF3_INVALID_STRAND');

    assert.ok(strandDiagnostic, 'Expected invalid strand diagnostic');
    assert.deepStrictEqual(strandDiagnostic.codeDescription, {
      href: EXPECTED_GFF3_HREFS.get('GFF3_INVALID_STRAND'),
    });
  });
});
