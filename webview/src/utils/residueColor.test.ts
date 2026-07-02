// SPDX-License-Identifier: GPL-3.0-or-later

import { detectSequenceType, residueColor, autoScheme } from './residueColor';
import { baseToColor } from './phredColor';

describe('residueColor', () => {
  describe('detectSequenceType', () => {
    it('classifies a nucleotide sequence as nt', () => {
      expect(detectSequenceType('ACGTACGTACGTNNNNACGT')).toBe('nt');
    });
    it('classifies a protein sequence as aa (contains L/E/P/etc.)', () => {
      expect(detectSequenceType('MKVLAAGELPQFIWY')).toBe('aa');
    });
    it('treats a pure IUPAC-ambiguity string as nt (no protein-only letters)', () => {
      expect(detectSequenceType('ACGTRYSWKMBDHVN')).toBe('nt');
    });
  });

  describe('residueColor', () => {
    it('nucleotide scheme delegates to baseToColor', () => {
      expect(residueColor('A', 'nucleotide')).toBe(baseToColor('A'));
      expect(residueColor('g', 'nucleotide')).toBe(baseToColor('g'));
    });
    it('returns the Taylor color for a known amino acid', () => {
      expect(residueColor('D', 'taylor')).toBe('#ff0000');
      expect(residueColor('w', 'taylor')).toBe('#00ccff'); // case-insensitive
    });
    it('returns a Clustal group color', () => {
      expect(residueColor('K', 'clustal')).toBe('#f01505'); // positive
      expect(residueColor('P', 'clustal')).toBe('#c0c000'); // proline
    });
    it('colors gaps and stops as neutral', () => {
      expect(residueColor('-', 'zappo')).toBe('#757575');
      expect(residueColor('*', 'clustal')).toBe('#757575');
    });
    it('falls back to neutral for an unknown residue', () => {
      expect(residueColor('?', 'hydrophobicity')).toBe('#757575');
    });
  });

  describe('autoScheme', () => {
    it('picks nucleotide for DNA and a protein scheme for protein', () => {
      expect(autoScheme('ACGTACGT')).toBe('nucleotide');
      expect(autoScheme('MKVLAAGELPQ')).toBe('clustal');
    });
  });
});
