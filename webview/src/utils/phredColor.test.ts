// SPDX-License-Identifier: GPL-3.0-or-later

import { asciiToPhred, phredToColor, baseToColor } from './phredColor';

describe('phredColor', () => {
  describe('asciiToPhred', () => {
    it('maps ! to 0', () => expect(asciiToPhred('!')).toBe(0));
    it('maps I to 40', () => expect(asciiToPhred('I')).toBe(40));
    it('maps ~ to 93 (max Phred+33)', () => expect(asciiToPhred('~')).toBe(93));
  });

  describe('phredToColor', () => {
    it('is green at >= 30', () => {
      expect(phredToColor(30)).toBe('#4caf50');
      expect(phredToColor(40)).toBe('#4caf50');
    });
    it('is yellow for 20-29', () => {
      expect(phredToColor(20)).toBe('#ffeb3b');
      expect(phredToColor(29)).toBe('#ffeb3b');
    });
    it('is orange for 10-19', () => {
      expect(phredToColor(10)).toBe('#ff9800');
      expect(phredToColor(19)).toBe('#ff9800');
    });
    it('is red for < 10', () => {
      expect(phredToColor(0)).toBe('#f44336');
      expect(phredToColor(9)).toBe('#f44336');
    });
  });

  describe('baseToColor', () => {
    it('colors each canonical base', () => {
      expect(baseToColor('A')).toBe('#4caf50');
      expect(baseToColor('T')).toBe('#f44336');
      expect(baseToColor('U')).toBe('#f44336');
      expect(baseToColor('G')).toBe('#ffc107');
      expect(baseToColor('C')).toBe('#2196f3');
      expect(baseToColor('N')).toBe('#9e9e9e');
    });
    it('is case-insensitive', () => expect(baseToColor('a')).toBe('#4caf50'));
    it('falls back to dark gray for unknown bases', () => expect(baseToColor('X')).toBe('#757575'));
  });
});
