// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { getVcfPreviewDisplayScope } from '../../src/shared/vcfPreviewDisplay';

describe('VCF preview display scope', () => {
  it('describes capped previews using the effective line limit', () => {
    const scope = getVcfPreviewDisplayScope({
      lineCount: 250005,
      maxLines: 1000,
      previewedVariants: 1000,
      headerEndLine: 4,
    } as any);

    assert.strictEqual(scope.isLineLimited, true);
    assert.strictEqual(scope.effectiveLineLimit, 1004);
    assert.strictEqual(scope.variantLabel, 'Variants previewed');
    assert.strictEqual(scope.eventLabel, 'Preview events');
    assert.strictEqual(scope.percentHeader, '% of preview');
    assert.strictEqual(
      scope.truncationMessage,
      'Loaded the first 1,000 variants of 250,001 total variants (250,005 total lines)',
    );
  });

  it('keeps full-preview labels when the file is inside the line limit', () => {
    const scope = getVcfPreviewDisplayScope({
      lineCount: 12,
      maxLines: 1000,
      previewedVariants: 8,
    });

    assert.strictEqual(scope.isLineLimited, false);
    assert.strictEqual(scope.variantLabel, 'Variants');
    assert.strictEqual(scope.eventLabel, 'Events');
    assert.strictEqual(scope.percentHeader, '% of VCF');
    assert.strictEqual(scope.truncationMessage, undefined);
  });
});
