// SPDX-License-Identifier: GPL-3.0-or-later

import { parseVcfLine } from './VcfPreview';
import type { VcfHeaderInfo, FormatDefinition } from '../types';

const headerInfo: VcfHeaderInfo = {
  infoFields: [],
  filterFields: [],
  formatFields: [
    { id: 'GT', number: '1', type: 'String', description: '' },
    { id: 'DP', number: '1', type: 'Integer', description: '' },
  ],
  samples: ['S1', 'S2', 'S3', 'S4', 'S5'],
  headerEndLine: 0,
};
const formatDefs = new Map<string, FormatDefinition>(headerInfo.formatFields.map((f) => [f.id, f]));

// 8 fixed columns + FORMAT + 5 sample columns
const LINE = 'chr1\t100\t.\tA\tG\t50\tPASS\t.\tGT:DP\t0/1:10\t1/1:20\t0/0:30\t0/1:40\t1/1:50';

describe('parseVcfLine sample parsing (viewport-bounded)', () => {
  it('parses only the requested number of samples', () => {
    const row = parseVcfLine(LINE, 1, headerInfo, formatDefs, 2);
    expect(row).not.toBeNull();
    expect(Object.keys(row!.samples ?? {})).toEqual(['S1', 'S2']);
  });

  it('parses all samples when the cap covers them', () => {
    const row = parseVcfLine(LINE, 1, headerInfo, formatDefs, 5);
    expect(Object.keys(row!.samples ?? {}).length).toBe(5);
  });

  it('never parses more samples than exist even with a larger cap', () => {
    const row = parseVcfLine(LINE, 1, headerInfo, formatDefs, 100);
    expect(Object.keys(row!.samples ?? {}).length).toBe(5);
  });

  it('parses no samples when the cap is zero', () => {
    const row = parseVcfLine(LINE, 1, headerInfo, formatDefs, 0);
    expect(Object.keys(row!.samples ?? {}).length).toBe(0);
  });
});
