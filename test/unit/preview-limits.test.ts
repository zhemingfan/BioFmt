// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import {
  clampRowRange,
  getPreviewLineLimit,
  normalizePreviewMaxLines,
} from '../../src/shared/previewLimits';

describe('preview limits', () => {
  it('normalizes invalid maxLines values to the default', () => {
    assert.strictEqual(normalizePreviewMaxLines(undefined, 200000), 200000);
    assert.strictEqual(normalizePreviewMaxLines(0, 200000), 200000);
    assert.strictEqual(normalizePreviewMaxLines(-10, 200000), 200000);
    assert.strictEqual(normalizePreviewMaxLines(Number.NaN, 200000), 200000);
  });

  it('uses the configured maxLines as the preview line limit', () => {
    assert.strictEqual(getPreviewLineLimit(1000, 200), 200);
    assert.strictEqual(getPreviewLineLimit(1000, 1500), 1000);
  });

  it('preserves VCF header lines outside the variant preview limit', () => {
    assert.strictEqual(
      getPreviewLineLimit(250005, 1000, { preserveLeadingLines: 4 }),
      1004,
    );
    assert.strictEqual(
      getPreviewLineLimit(250018, 1000, { preserveLeadingLines: 18 }),
      1018,
    );
  });

  it('clamps requested row ranges to the preview line limit', () => {
    assert.deepStrictEqual(clampRowRange(90, 150, 100), { startLine: 90, endLine: 100 });
    assert.strictEqual(clampRowRange(100, 150, 100), null);
    assert.deepStrictEqual(clampRowRange(-5, 10, 100), { startLine: 0, endLine: 10 });
  });

  it('describes VCF preview limits in variants rather than raw lines', () => {
    const previewLimits = require('../../src/shared/previewLimits') as any;
    assert.strictEqual(typeof previewLimits.getPreviewLimitDisplay, 'function');

    assert.deepStrictEqual(
      previewLimits.getPreviewLimitDisplay({
        languageId: 'omics-vcf',
        lineCount: 250005,
        maxLines: 1000,
        headerEndLine: 4,
      }),
      {
        exceedsLimit: true,
        stat: '250,001 variants (250,005 lines; limit: 1,000 variants)',
        message: 'Only the first 1,000 variants are displayed.',
      },
    );
  });
});
