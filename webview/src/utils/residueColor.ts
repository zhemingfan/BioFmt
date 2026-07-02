// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Residue coloring for sequence previews.
 *
 * BioFmt previously colored FASTA per-nucleotide only. This adds the standard
 * amino-acid *property* color schemes (Taylor, Zappo, Clustal, hydrophobicity) —
 * the feature bioSyntax is known for — but applied in the virtualized preview so
 * it scales to large files (bioSyntax does it in the editor grammar, which is why
 * it is ~30x slower per-base on big sequences).
 */

import { baseToColor } from './phredColor';

export type ColorScheme = 'nucleotide' | 'taylor' | 'zappo' | 'clustal' | 'hydrophobicity';

export const AA_SCHEMES: { id: ColorScheme; label: string; kind: 'nt' | 'aa' }[] = [
  { id: 'nucleotide', label: 'Nucleotide', kind: 'nt' },
  { id: 'taylor', label: 'Taylor', kind: 'aa' },
  { id: 'zappo', label: 'Zappo', kind: 'aa' },
  { id: 'clustal', label: 'Clustal', kind: 'aa' },
  { id: 'hydrophobicity', label: 'Hydrophobicity', kind: 'aa' },
];

const UNKNOWN = '#757575';

/** Build a per-residue map from property groups. */
function fromGroups(groups: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [residues, color] of Object.entries(groups)) {
    for (const r of residues) map[r] = color;
  }
  return map;
}

// Taylor (1997) amino-acid color wheel.
const TAYLOR: Record<string, string> = {
  A: '#ccff00', R: '#0000ff', N: '#cc00ff', D: '#ff0000', C: '#ffff00',
  Q: '#ff00cc', E: '#ff0066', G: '#ff9900', H: '#0066ff', I: '#66ff00',
  L: '#33ff00', K: '#6600ff', M: '#00ff00', F: '#00ff66', P: '#ffcc00',
  S: '#ff3300', T: '#ff6600', W: '#00ccff', Y: '#00ffcc', V: '#99ff00',
};

// Zappo — physicochemical property groups (Jalview palette).
const ZAPPO = fromGroups({
  ILVAM: '#ffafaf', // aliphatic / hydrophobic
  FWY: '#ffc800',   // aromatic
  HKR: '#6464ff',   // positive
  DE: '#ff0000',    // negative
  STNQ: '#00ff00',  // polar
  G: '#ff00ff',     // glycine
  P: '#ffff00',     // proline
  C: '#ffff00',     // cysteine
});

// ClustalX default amino-acid scheme.
const CLUSTAL = fromGroups({
  AILMFWV: '#80a0f0', // hydrophobic
  KR: '#f01505',      // positive
  ED: '#c048c0',      // negative
  NQST: '#15c015',    // polar
  C: '#f08080',       // cysteine
  G: '#f09048',       // glycine
  P: '#c0c000',       // proline
  HY: '#15a4a4',      // aromatic
});

// Kyte-Doolittle hydrophobicity, binned: hydrophobic (red) / neutral (gray) / hydrophilic (blue).
const HYDRO = fromGroups({
  IVLFCMA: '#e06666', // hydrophobic
  GHPSTYW: '#dcdcdc', // neutral
  RNDQEK: '#6d9eeb',  // hydrophilic
});

const SCHEME_MAPS: Record<Exclude<ColorScheme, 'nucleotide'>, Record<string, string>> = {
  taylor: TAYLOR, zappo: ZAPPO, clustal: CLUSTAL, hydrophobicity: HYDRO,
};

// Letters that appear only in amino-acid alphabets (never in IUPAC nucleotide codes).
const AA_ONLY = /[EFILPQZJ]/i;

/**
 * Classify a sequence as nucleotide ('nt') or amino-acid ('aa') by sampling.
 * Any of E/F/I/L/P/Q/Z/J is definitive for protein (absent from IUPAC nt codes).
 */
export function detectSequenceType(sequence: string): 'nt' | 'aa' {
  return AA_ONLY.test(sequence.slice(0, 500)) ? 'aa' : 'nt';
}

/** Color for a single residue under the given scheme. */
export function residueColor(residue: string, scheme: ColorScheme): string {
  if (scheme === 'nucleotide') return baseToColor(residue);
  const r = residue.toUpperCase();
  if (r === '-' || r === '.' || r === '*') return UNKNOWN; // gaps / stop
  return SCHEME_MAPS[scheme][r] ?? UNKNOWN;
}

/** Default scheme for a sequence when the user selects "Auto". */
export function autoScheme(sequence: string): ColorScheme {
  return detectSequenceType(sequence) === 'aa' ? 'clustal' : 'nucleotide';
}
