// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  FormatDefinition,
  TypedFormatValue,
  ParsedGenotype,
  ParsedAD,
  ParsedPL,
  ParsedPS,
  ParsedFT,
  FormatSummary,
  FormatRecordContext,
} from '../types';

// ============================================================================
// FORMAT Renderer Interface
// ============================================================================

export interface FormatRenderer {
  id: string;
  parse(raw: string, def: FormatDefinition | null, ctx: FormatRecordContext): TypedFormatValue;
  summarize(typed: TypedFormatValue, def: FormatDefinition | null, ctx: FormatRecordContext): FormatSummary[];
  renderDisplay(typed: TypedFormatValue, ctx: FormatRecordContext): string;
}

// ============================================================================
// Renderer Registry
// ============================================================================

const rendererRegistry = new Map<string, FormatRenderer>();

export function registerRenderer(renderer: FormatRenderer): void {
  rendererRegistry.set(renderer.id, renderer);
}

export function getRenderer(formatId: string): FormatRenderer {
  return rendererRegistry.get(formatId) || genericRenderer;
}

export function hasSpecializedRenderer(formatId: string): boolean {
  return rendererRegistry.has(formatId);
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseInteger(val: string): number | null {
  if (val === '.' || val === '') return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function parseIntegerArray(raw: string): (number | null)[] {
  if (raw === '.' || raw === '') return [];
  return raw.split(',').map(parseInteger);
}

// ============================================================================
// GT (Genotype) Renderer
// ============================================================================

const gtRenderer: FormatRenderer = {
  id: 'GT',

  parse(raw: string, _def: FormatDefinition | null, _ctx: FormatRecordContext): TypedFormatValue {
    const gt = parseGenotype(raw);
    return { type: 'GT', value: gt };
  },

  summarize(typed: TypedFormatValue, _def: FormatDefinition | null, ctx: FormatRecordContext): FormatSummary[] {
    if (typed.type !== 'GT') return [];
    const gt = typed.value;
    const summaries: FormatSummary[] = [];

    // Show allele letters if available
    const alleleLetters = gt.alleles.map((idx) => {
      if (idx === null) return '.';
      if (idx === 0) return ctx.ref.charAt(0);
      const altIdx = idx - 1;
      return altIdx < ctx.alts.length ? ctx.alts[altIdx].charAt(0) : '?';
    });
    const sep = gt.isPhased ? '|' : '/';
    summaries.push({
      label: 'Alleles',
      value: alleleLetters.join(sep),
      tooltip: `Allele indices: ${gt.alleles.map((a) => a ?? '.').join(sep)}`,
    });

    summaries.push({
      label: 'Phased',
      value: gt.isPhased ? 'Yes' : 'No',
    });

    summaries.push({
      label: 'Ploidy',
      value: String(gt.ploidy),
    });

    if (gt.hasMissing) {
      summaries.push({
        label: 'Missing',
        value: 'Yes',
        tooltip: 'Contains missing allele(s)',
      });
    }

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue, ctx: FormatRecordContext): string {
    if (typed.type !== 'GT') return '';
    const gt = typed.value;
    const sep = gt.isPhased ? '|' : '/';

    // Show indices with phase marker
    const indices = gt.alleles.map((a) => (a === null ? '.' : String(a)));
    const display = indices.join(sep);

    // Add allele letters in parentheses
    const letters = gt.alleles.map((idx) => {
      if (idx === null) return '.';
      if (idx === 0) return ctx.ref.charAt(0);
      const altIdx = idx - 1;
      return altIdx < ctx.alts.length ? ctx.alts[altIdx].charAt(0) : '?';
    });
    return `${display} (${letters.join(sep)})`;
  },
};

function parseGenotype(raw: string): ParsedGenotype {
  if (raw === '.' || raw === '') {
    return {
      isPhased: false,
      alleles: [null],
      ploidy: 1,
      hasMissing: true,
      raw,
    };
  }

  // Determine separator (phased '|' vs unphased '/')
  const isPhased = raw.includes('|');
  const sep = isPhased ? '|' : '/';
  const parts = raw.split(sep);

  const alleles: (number | null)[] = parts.map((p) => {
    if (p === '.' || p === '') return null;
    const num = parseInt(p, 10);
    return isNaN(num) ? null : num;
  });

  const hasMissing = alleles.some((a) => a === null);

  return {
    isPhased,
    alleles,
    ploidy: alleles.length,
    hasMissing,
    raw,
  };
}

// ============================================================================
// GQ (Genotype Quality) Renderer
// ============================================================================

const gqRenderer: FormatRenderer = {
  id: 'GQ',

  parse(raw: string): TypedFormatValue {
    const value = parseInteger(raw);
    return { type: 'GQ', value, raw };
  },

  summarize(typed: TypedFormatValue): FormatSummary[] {
    if (typed.type !== 'GQ') return [];
    return [
      {
        label: 'GQ',
        value: typed.value !== null ? String(typed.value) : '.',
        tooltip: 'Genotype Quality (Phred-scaled)',
      },
    ];
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'GQ') return '';
    return typed.value !== null ? String(typed.value) : '.';
  },
};

// ============================================================================
// DP (Read Depth) Renderer
// ============================================================================

const dpRenderer: FormatRenderer = {
  id: 'DP',

  parse(raw: string): TypedFormatValue {
    const value = parseInteger(raw);
    return { type: 'DP', value, raw };
  },

  summarize(typed: TypedFormatValue): FormatSummary[] {
    if (typed.type !== 'DP') return [];
    return [
      {
        label: 'DP',
        value: typed.value !== null ? String(typed.value) : '.',
        tooltip: 'Read Depth',
      },
    ];
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'DP') return '';
    return typed.value !== null ? String(typed.value) : '.';
  },
};

// ============================================================================
// AD (Allelic Depth) Renderer
// ============================================================================

const adRenderer: FormatRenderer = {
  id: 'AD',

  parse(raw: string, _def: FormatDefinition | null, ctx: FormatRecordContext): TypedFormatValue {
    const ad = parseAllelicDepth(raw, ctx);
    return { type: 'AD', value: ad };
  },

  summarize(typed: TypedFormatValue, _def: FormatDefinition | null, ctx: FormatRecordContext): FormatSummary[] {
    if (typed.type !== 'AD') return [];
    const ad = typed.value;
    const summaries: FormatSummary[] = [];

    summaries.push({
      label: 'AD(ref)',
      value: ad.refDepth !== null ? String(ad.refDepth) : '.',
      tooltip: `Depth for REF allele (${ctx.ref})`,
    });

    if (ctx.alts.length === 1) {
      // Biallelic: show single ALT depth
      summaries.push({
        label: 'AD(alt)',
        value: ad.altDepths[0] !== null ? String(ad.altDepths[0]) : '.',
        tooltip: `Depth for ALT allele (${ctx.alts[0]})`,
      });
    } else if (ad.altDepths.length > 0) {
      // Multiallelic: show all ALT depths
      const altStr = ad.altDepths.map((d) => (d !== null ? String(d) : '.')).join(',');
      summaries.push({
        label: 'AD(alts)',
        value: altStr,
        tooltip: `Depths for ALT alleles (${ctx.alts.join(',')})`,
      });
    }

    summaries.push({
      label: 'Total',
      value: String(ad.total),
      tooltip: 'Sum of all allelic depths',
    });

    // Check for length mismatch
    const expectedLen = ctx.nAlleles;
    if (ad.values.length !== expectedLen && ad.values.length > 0) {
      summaries.push({
        label: 'Warning',
        value: `Length mismatch (got ${ad.values.length}, expected ${expectedLen})`,
        tooltip: 'AD array length does not match number of alleles',
      });
    }

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'AD') return '';
    const ad = typed.value;
    return ad.values.map((v) => (v !== null ? String(v) : '.')).join(',');
  },
};

function parseAllelicDepth(raw: string, ctx: FormatRecordContext): ParsedAD {
  if (raw === '.' || raw === '') {
    return {
      values: [],
      refDepth: null,
      altDepths: [],
      total: 0,
      raw,
    };
  }

  const values = parseIntegerArray(raw);
  const refDepth = values.length > 0 ? values[0] : null;
  const altDepths = values.slice(1);
  const total = values.reduce((sum, v) => sum + (v ?? 0), 0);

  return {
    values,
    refDepth,
    altDepths,
    total,
    raw,
  };
}

// ============================================================================
// PL (Phred-scaled Likelihoods) Renderer
// ============================================================================

const plRenderer: FormatRenderer = {
  id: 'PL',

  parse(raw: string, _def: FormatDefinition | null, ctx: FormatRecordContext): TypedFormatValue {
    const pl = parsePhredLikelihoods(raw, ctx);
    return { type: 'PL', value: pl };
  },

  summarize(typed: TypedFormatValue, _def: FormatDefinition | null, ctx: FormatRecordContext): FormatSummary[] {
    if (typed.type !== 'PL') return [];
    const pl = typed.value;
    const summaries: FormatSummary[] = [];

    if (pl.minPL !== null && pl.minPLIndex !== null) {
      summaries.push({
        label: 'Min PL',
        value: String(pl.minPL),
        tooltip: `Minimum PL value at index ${pl.minPLIndex}`,
      });
      summaries.push({
        label: 'Min PL Index',
        value: String(pl.minPLIndex),
        tooltip: 'Index of minimum PL (most likely genotype)',
      });
    }

    // For biallelic diploid (3 values: 0/0, 0/1, 1/1)
    if (pl.firstThree && ctx.nAlleles === 2) {
      const labels = ['0/0', '0/1', '1/1'];
      const display = pl.firstThree
        .map((v, i) => `${labels[i]}:${v !== null ? v : '.'}`)
        .join(' ');
      summaries.push({
        label: 'Genotypes',
        value: display,
        tooltip: 'PL values for diploid biallelic genotypes',
      });
    }

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'PL') return '';
    const pl = typed.value;
    if (pl.values.length === 0) return '.';
    return pl.values.map((v) => (v !== null ? String(v) : '.')).join(',');
  },
};

function parsePhredLikelihoods(raw: string, ctx: FormatRecordContext): ParsedPL {
  if (raw === '.' || raw === '') {
    return {
      values: [],
      minPL: null,
      minPLIndex: null,
      firstThree: null,
      raw,
    };
  }

  const values = parseIntegerArray(raw);

  // Find minimum and its index
  let minPL: number | null = null;
  let minPLIndex: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && (minPL === null || v < minPL)) {
      minPL = v;
      minPLIndex = i;
    }
  }

  // For biallelic diploid, extract first three values
  let firstThree: (number | null)[] | null = null;
  if (ctx.nAlleles === 2 && values.length >= 3) {
    firstThree = values.slice(0, 3);
  }

  return {
    values,
    minPL,
    minPLIndex,
    firstThree,
    raw,
  };
}

// ============================================================================
// PS (Phase Set) Renderer
// ============================================================================

const psRenderer: FormatRenderer = {
  id: 'PS',

  parse(raw: string): TypedFormatValue {
    const value = parseInteger(raw);
    return { type: 'PS', value: { value, raw } };
  },

  summarize(typed: TypedFormatValue): FormatSummary[] {
    if (typed.type !== 'PS') return [];
    const ps = typed.value;
    const summaries: FormatSummary[] = [];

    if (ps.value !== null) {
      summaries.push({
        label: 'Phase Set',
        value: String(ps.value),
        tooltip: 'Phase block identifier',
      });
    }

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'PS') return '';
    const ps = typed.value;
    return ps.value !== null ? String(ps.value) : '.';
  },
};

// ============================================================================
// FT (Sample Filter) Renderer
// ============================================================================

const ftRenderer: FormatRenderer = {
  id: 'FT',

  parse(raw: string): TypedFormatValue {
    const ft = parseSampleFilter(raw);
    return { type: 'FT', value: ft };
  },

  summarize(typed: TypedFormatValue): FormatSummary[] {
    if (typed.type !== 'FT') return [];
    const ft = typed.value;
    const summaries: FormatSummary[] = [];

    summaries.push({
      label: 'Filter',
      value: ft.isPassing ? 'PASS' : ft.filters.join(';'),
      tooltip: ft.isPassing ? 'Sample passed all filters' : `Failed filters: ${ft.filters.join(', ')}`,
    });

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'FT') return '';
    const ft = typed.value;
    return ft.isPassing ? 'PASS' : ft.filters.join(';');
  },
};

function parseSampleFilter(raw: string): ParsedFT {
  if (raw === '.' || raw === '' || raw === 'PASS') {
    return {
      isPassing: raw === 'PASS' || raw === '.' || raw === '',
      filters: [],
      raw,
    };
  }

  // Filters can be semicolon or comma separated
  const filters = raw.split(/[;,]/).filter((f) => f && f !== 'PASS');

  return {
    isPassing: filters.length === 0,
    filters,
    raw,
  };
}

// ============================================================================
// Generic Renderer (Fallback)
// ============================================================================

const genericRenderer: FormatRenderer = {
  id: '_generic',

  parse(raw: string, def: FormatDefinition | null): TypedFormatValue {
    if (raw === '.' || raw === '') {
      return { type: 'generic', value: null, raw };
    }

    const type = def?.type?.toLowerCase() || 'string';
    const number = def?.number || '.';

    // Check if it's an array (comma-separated)
    if (raw.includes(',') || (number !== '1' && number !== '0')) {
      const parts = raw.split(',');
      if (type === 'integer') {
        return { type: 'generic', value: parts.map(parseInteger), raw };
      } else if (type === 'float') {
        return { type: 'generic', value: parts.map((p) => (p === '.' ? null : parseFloat(p))), raw };
      }
      return { type: 'generic', value: parts, raw };
    }

    // Scalar value
    if (type === 'integer') {
      return { type: 'generic', value: parseInteger(raw), raw };
    } else if (type === 'float') {
      const num = parseFloat(raw);
      return { type: 'generic', value: isNaN(num) ? null : num, raw };
    }

    return { type: 'generic', value: raw, raw };
  },

  summarize(typed: TypedFormatValue, def: FormatDefinition | null): FormatSummary[] {
    if (typed.type !== 'generic') return [];

    const summaries: FormatSummary[] = [];
    const val = typed.value;

    let displayValue: string;
    if (val === null) {
      displayValue = '.';
    } else if (Array.isArray(val)) {
      displayValue = val.map((v) => (v === null ? '.' : String(v))).join(',');
    } else {
      displayValue = String(val);
    }

    summaries.push({
      label: 'Value',
      value: displayValue,
      tooltip: def?.description || undefined,
    });

    return summaries;
  },

  renderDisplay(typed: TypedFormatValue): string {
    if (typed.type !== 'generic') return '';
    const val = typed.value;

    if (val === null) return '.';
    if (Array.isArray(val)) {
      return val.map((v) => (v === null ? '.' : String(v))).join(',');
    }
    return String(val);
  },
};

// ============================================================================
// Register All Renderers
// ============================================================================

registerRenderer(gtRenderer);
registerRenderer(gqRenderer);
registerRenderer(dpRenderer);
registerRenderer(adRenderer);
registerRenderer(plRenderer);
registerRenderer(psRenderer);
registerRenderer(ftRenderer);

// ============================================================================
// Main Parsing Function
// ============================================================================

/**
 * Parse a sample's FORMAT values into typed values
 */
export function parseSampleFormats(
  sampleData: Record<string, string>,
  formatDefs: Map<string, FormatDefinition>,
  ctx: FormatRecordContext
): Record<string, TypedFormatValue> {
  const result: Record<string, TypedFormatValue> = {};

  for (const [key, rawValue] of Object.entries(sampleData)) {
    const def = formatDefs.get(key) || null;
    const renderer = getRenderer(key);
    result[key] = renderer.parse(rawValue, def, ctx);
  }

  return result;
}

/**
 * Get summaries for a typed FORMAT value
 */
export function getFormatSummaries(
  formatKey: string,
  typed: TypedFormatValue,
  formatDefs: Map<string, FormatDefinition>,
  ctx: FormatRecordContext
): FormatSummary[] {
  const def = formatDefs.get(formatKey) || null;
  const renderer = getRenderer(formatKey);
  return renderer.summarize(typed, def, ctx);
}

/**
 * Render a typed FORMAT value for display
 */
export function renderFormatDisplay(
  formatKey: string,
  typed: TypedFormatValue,
  ctx: FormatRecordContext
): string {
  const renderer = getRenderer(formatKey);
  return renderer.renderDisplay(typed, ctx);
}

// ============================================================================
// Export for Testing
// ============================================================================

export { parseGenotype, parseAllelicDepth, parsePhredLikelihoods, parseSampleFilter };
export { genericRenderer };
