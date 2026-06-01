// SPDX-License-Identifier: GPL-3.0-or-later

export const DEFAULT_PREVIEW_MAX_LINES = 200000;

export interface RowRange {
  startLine: number;
  endLine: number;
}

export interface PreviewLineLimitOptions {
  preserveLeadingLines?: number;
}

export interface PreviewLimitDisplayInput {
  languageId: string;
  lineCount: number;
  maxLines?: number;
  headerEndLine?: number;
}

export interface PreviewLimitDisplay {
  exceedsLimit: boolean;
  stat: string;
  message: string;
}

export function normalizePreviewMaxLines(
  value: number | undefined,
  fallback = DEFAULT_PREVIEW_MAX_LINES,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

export function getPreviewLineLimit(
  lineCount: number,
  maxLines: number | undefined,
  options: PreviewLineLimitOptions = {},
): number {
  const safeLineCount = Math.max(0, Math.floor(lineCount));
  const preservedLines = normalizePreservedLeadingLines(options.preserveLeadingLines, safeLineCount);
  return Math.min(safeLineCount, preservedLines + normalizePreviewMaxLines(maxLines));
}

export function clampRowRange(
  startLine: number,
  endLine: number,
  lineLimit: number,
): RowRange | null {
  const limit = Math.max(0, Math.floor(lineLimit));
  const clampedStart = Math.min(Math.max(0, Math.floor(startLine)), limit);
  const clampedEnd = Math.min(Math.max(0, Math.floor(endLine)), limit);

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return { startLine: clampedStart, endLine: clampedEnd };
}

export function getPreviewLimitDisplay({
  languageId,
  lineCount,
  maxLines,
  headerEndLine,
}: PreviewLimitDisplayInput): PreviewLimitDisplay {
  const safeLineCount = Math.max(0, Math.floor(lineCount));
  const limit = normalizePreviewMaxLines(maxLines);

  if (languageId === 'omics-vcf') {
    const preservedLines = normalizePreservedLeadingLines(headerEndLine, safeLineCount);
    const variantCount = Math.max(0, safeLineCount - preservedLines);
    return {
      exceedsLimit: variantCount > limit,
      stat: `${variantCount.toLocaleString()} variants (${safeLineCount.toLocaleString()} lines; limit: ${limit.toLocaleString()} variants)`,
      message: `Only the first ${limit.toLocaleString()} variants are displayed.`,
    };
  }

  return {
    exceedsLimit: safeLineCount > limit,
    stat: `${safeLineCount.toLocaleString()} lines (limit: ${limit.toLocaleString()})`,
    message: `Only the first ${limit.toLocaleString()} lines are displayed.`,
  };
}

function normalizePreservedLeadingLines(
  value: number | undefined,
  lineCount: number,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return 0;
  }
  return Math.min(Math.max(0, lineCount), Math.floor(value));
}
