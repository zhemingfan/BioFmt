// SPDX-License-Identifier: GPL-3.0-or-later

import * as zlib from 'zlib';

export function decompressGzipText(data: Buffer): Buffer {
  try {
    return zlib.gunzipSync(data);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to decompress gzip text file: ${detail}`);
  }
}
