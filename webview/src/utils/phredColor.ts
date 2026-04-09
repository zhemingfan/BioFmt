// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Convert ASCII quality character to Phred+33 score.
 */
export function asciiToPhred(char: string): number {
  return char.charCodeAt(0) - 33;
}

/**
 * Map Phred quality score to a color for heatmap display.
 * - >= 30: green (high quality)
 * - 20-29: yellow (good)
 * - 10-19: orange (poor)
 * - < 10:  red (very poor)
 */
export function phredToColor(phred: number): string {
  if (phred >= 30) return '#4caf50';
  if (phred >= 20) return '#ffeb3b';
  if (phred >= 10) return '#ff9800';
  return '#f44336';
}

/**
 * Map DNA/RNA base to a display color.
 */
export function baseToColor(base: string): string {
  switch (base.toUpperCase()) {
    case 'A': return '#4caf50'; // green
    case 'T':
    case 'U': return '#f44336'; // red
    case 'G': return '#ffc107'; // gold
    case 'C': return '#2196f3'; // blue
    case 'N': return '#9e9e9e'; // gray
    default:  return '#757575'; // dark gray
  }
}
