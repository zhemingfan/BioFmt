// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseGenotype,
  parseAllelicDepth,
  parsePhredLikelihoods,
  parseSampleFilter,
  genericRenderer,
} from './formatParsers';
import type { FormatRecordContext } from '../types';

const ctx: FormatRecordContext = {
  ref: 'A',
  alts: ['T'],
  nAlleles: 2,
  formatKeys: ['GT'],
  sampleName: 'S1',
};

describe('formatParsers', () => {
  describe('parseGenotype', () => {
    it('parses an unphased diploid genotype', () => {
      expect(parseGenotype('0/1')).toMatchObject({
        isPhased: false,
        alleles: [0, 1],
        ploidy: 2,
        hasMissing: false,
      });
    });

    it('detects phasing', () => {
      const gt = parseGenotype('0|1');
      expect(gt.isPhased).toBe(true);
      expect(gt.alleles).toEqual([0, 1]);
    });

    it('treats . as a missing haploid call', () => {
      const gt = parseGenotype('.');
      expect(gt.alleles).toEqual([null]);
      expect(gt.hasMissing).toBe(true);
      expect(gt.ploidy).toBe(1);
    });

    it('flags a partially missing genotype', () => {
      const gt = parseGenotype('1/.');
      expect(gt.alleles).toEqual([1, null]);
      expect(gt.hasMissing).toBe(true);
    });
  });

  describe('parseAllelicDepth', () => {
    it('splits ref and alt depths and totals them', () => {
      const ad = parseAllelicDepth('10,5');
      expect(ad.refDepth).toBe(10);
      expect(ad.altDepths).toEqual([5]);
      expect(ad.total).toBe(15);
    });

    it('handles a missing value', () => {
      const ad = parseAllelicDepth('.');
      expect(ad.values).toEqual([]);
      expect(ad.total).toBe(0);
    });
  });

  describe('parsePhredLikelihoods', () => {
    it('finds the minimum likelihood and its index', () => {
      const pl = parsePhredLikelihoods('20,0,30', ctx);
      expect(pl.values).toEqual([20, 0, 30]);
      expect(pl.minPL).toBe(0);
      expect(pl.minPLIndex).toBe(1);
    });

    it('extracts the first three values for a biallelic diploid site', () => {
      const pl = parsePhredLikelihoods('0,10,20', ctx);
      expect(pl.firstThree).toEqual([0, 10, 20]);
    });
  });

  describe('parseSampleFilter', () => {
    it('treats PASS as passing', () => {
      expect(parseSampleFilter('PASS').isPassing).toBe(true);
    });

    it('parses failing filters', () => {
      const ft = parseSampleFilter('q10;LowQual');
      expect(ft.isPassing).toBe(false);
      expect(ft.filters).toEqual(['q10', 'LowQual']);
    });
  });

  describe('genericRenderer', () => {
    it('renders a comma-separated array unchanged', () => {
      const typed = genericRenderer.parse('1,2,3', null, ctx);
      expect(genericRenderer.renderDisplay(typed, ctx)).toBe('1,2,3');
    });

    it('renders a missing value as a dot', () => {
      const typed = genericRenderer.parse('.', null, ctx);
      expect(genericRenderer.renderDisplay(typed, ctx)).toBe('.');
    });
  });
});
