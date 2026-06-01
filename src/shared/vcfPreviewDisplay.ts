// SPDX-License-Identifier: GPL-3.0-or-later

import { getPreviewLineLimit, normalizePreviewMaxLines } from './previewLimits';

export interface VcfPreviewDisplayInput {
  lineCount: number;
  maxLines?: number;
  previewedVariants: number;
  headerEndLine?: number;
}

export interface VcfPreviewDisplayScope {
  effectiveLineLimit: number;
  isLineLimited: boolean;
  variantLabel: string;
  eventLabel: string;
  percentHeader: string;
  truncationMessage?: string;
}

export function getVcfPreviewDisplayScope({
  lineCount,
  maxLines,
  previewedVariants,
  headerEndLine,
}: VcfPreviewDisplayInput): VcfPreviewDisplayScope {
  const normalizedMaxLines = normalizePreviewMaxLines(maxLines);
  const effectiveLineLimit = getPreviewLineLimit(lineCount, normalizedMaxLines, {
    preserveLeadingLines: headerEndLine,
  });
  const safeLineCount = Math.max(0, Math.floor(lineCount));
  const safeHeaderEndLine = Math.min(
    safeLineCount,
    Math.max(0, Math.floor(headerEndLine ?? 0)),
  );
  const totalVariants = Math.max(0, safeLineCount - safeHeaderEndLine);
  const isLineLimited = totalVariants > normalizedMaxLines;

  return {
    effectiveLineLimit,
    isLineLimited,
    variantLabel: isLineLimited ? 'Variants previewed' : 'Variants',
    eventLabel: isLineLimited ? 'Preview events' : 'Events',
    percentHeader: isLineLimited ? '% of preview' : '% of VCF',
    truncationMessage: isLineLimited
      ? `Loaded the first ${previewedVariants.toLocaleString()} variants of ${totalVariants.toLocaleString()} total variants (${safeLineCount.toLocaleString()} total lines)`
      : undefined,
  };
}
