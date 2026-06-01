// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as zlib from 'zlib';
import { decompressGzipText } from '../../src/shared/gzipText';

describe('gzip text decompression', () => {
  it('decompresses ordinary gzip text files that are not BGZF encoded', () => {
    const text = [
      '##fileformat=VCFv4.2',
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
      'chr1\t1\trs1\tA\tG\t99\tPASS\tDP=10',
      '',
    ].join('\n');

    const decompressed = decompressGzipText(zlib.gzipSync(Buffer.from(text)));

    assert.strictEqual(decompressed.toString('utf-8'), text);
  });
});
