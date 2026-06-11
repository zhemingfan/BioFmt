// SPDX-License-Identifier: GPL-3.0-or-later

/** Default maximum number of records returned per region query to avoid UI overload. */
export const DEFAULT_MAX_REGION_ROWS = 10000;

/**
 * Apply the per-region record cap.
 *
 * @param rows  All records collected for the region.
 * @param limit Maximum records to return; values <= 0 fall back to {@link DEFAULT_MAX_REGION_ROWS}.
 * @returns The (possibly capped) rows and whether truncation occurred.
 */
export function capRegionRows<T>(rows: T[], limit: number): { rows: T[]; hasMore: boolean } {
  const max = limit > 0 ? limit : DEFAULT_MAX_REGION_ROWS;
  if (rows.length > max) {
    return { rows: rows.slice(0, max), hasMore: true };
  }
  return { rows, hasMore: false };
}
