// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared statistical helpers used by multiple webview preview components
 * (VcfPreview, BedPreview, SamPreview, FastaPreview). Pure functions, no
 * React or DOM dependencies.
 */

export function sum(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

export function groupCount<T, K>(items: Iterable<T>, keyFn: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const k = keyFn(item);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

export function topN(
  entries: { label: string; value: number }[],
  n: number
): { label: string; value: number }[] {
  return [...entries].sort((a, b) => b.value - a.value).slice(0, n);
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function nL50(lengths: number[]): { n50: number; l50: number } {
  if (lengths.length === 0) return { n50: 0, l50: 0 };
  const sorted = [...lengths].sort((a, b) => b - a);
  const total = sum(sorted);
  const half = total / 2;
  let cumul = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumul += sorted[i];
    if (cumul >= half) {
      return { n50: sorted[i], l50: i + 1 };
    }
  }
  return { n50: sorted[sorted.length - 1], l50: sorted.length };
}
