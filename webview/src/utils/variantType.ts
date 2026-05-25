// SPDX-License-Identifier: GPL-3.0-or-later

export type VariantType =
  | 'SNP'
  | 'Insertion'
  | 'Deletion'
  | 'MNV'
  | 'Breakend'
  | 'SV'
  | 'Other';

/**
 * Classify a single REF/ALT allele pair into a variant type for statistics.
 *
 * Order matters: breakend and symbolic alleles must be detected before the
 * length-based indel checks, otherwise a single-base REF with a long breakend
 * ALT (e.g. `G]11:94975749]`) is mistaken for an insertion.
 */
export function classifyVariantType(ref: string, alt: string): VariantType {
  // Breakend (BND): paired notation t[p[ / t]p] / [p[t / ]p]t, or the
  // single-breakend (telomeric) forms .t / t.
  if (
    alt.includes('[') ||
    alt.includes(']') ||
    (alt.length > 1 && (alt.startsWith('.') || alt.endsWith('.')))
  ) {
    return 'Breakend';
  }

  // Symbolic structural alleles: <DEL>, <DUP>, <INS>, <INV>, <CNV>, ...
  if (alt.startsWith('<')) return 'SV';

  if (ref.length === 1 && alt.length === 1) return 'SNP';
  if (alt.length > ref.length) return 'Insertion';
  if (alt.length < ref.length) return 'Deletion';
  if (ref.length > 1 && alt.length === ref.length) return 'MNV';
  return 'Other';
}

export interface VariantTypeCount {
  label: VariantType;
  count: number;
  /** Percentage of all classified ALT alleles, 0-100. */
  pct: number;
}

export interface VariantTypeSummary {
  /** Total ALT alleles classified (multi-allelic records contribute one per ALT). */
  total: number;
  /** Per-type counts and percentages, sorted by count descending. */
  types: VariantTypeCount[];
}

/**
 * Summarize variant records into total event count and a per-type breakdown with
 * percentages. Each comma-separated ALT allele counts as one event; "." ALTs are
 * skipped. Drives the VCF preview Statistics tab.
 */
export function summarizeVariantTypes(variants: { ref: string; alt: string }[]): VariantTypeSummary {
  const counts = new Map<VariantType, number>();
  let total = 0;

  for (const variant of variants) {
    const alts = variant.alt === '.' ? [] : variant.alt.split(',');
    for (const alt of alts) {
      const type = classifyVariantType(variant.ref, alt);
      counts.set(type, (counts.get(type) ?? 0) + 1);
      total++;
    }
  }

  const types = Array.from(counts, ([label, count]) => ({
    label,
    count,
    pct: total > 0 ? (count / total) * 100 : 0,
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { total, types };
}
