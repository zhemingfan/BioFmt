// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as zlib from 'zlib';
import * as path from 'path';
import * as vscode from 'vscode';
import type { FileProvider, ProviderMetadata } from './types';

/**
 * Decompresses an entire BGZF file by parsing and inflating each gzip block.
 * BGZF is concatenated gzip blocks, each with a 'BC' extra field containing
 * the block size (BSIZE + 1).
 */
function decompressBgzf(data: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let pos = 0;

  while (pos < data.length) {
    // Check gzip magic bytes
    if (data[pos] !== 0x1f || data[pos + 1] !== 0x8b) break;

    // FLG byte at offset 3 must have FEXTRA (0x04) for BGZF
    const flg = data[pos + 3];
    if (!(flg & 0x04)) break;

    const xlen = data.readUInt16LE(pos + 10);

    // Find the BC subfield to get the block size
    let bsize = -1;
    let xpos = pos + 12;
    const xend = xpos + xlen;
    while (xpos < xend) {
      const si1 = data[xpos];
      const si2 = data[xpos + 1];
      const slen = data.readUInt16LE(xpos + 2);
      if (si1 === 0x42 && si2 === 0x43 && slen === 2) { // 'B', 'C'
        bsize = data.readUInt16LE(xpos + 4) + 1;
        break;
      }
      xpos += 4 + slen;
    }

    if (bsize <= 0) break;

    // Decompress this single gzip block
    const block = data.slice(pos, pos + bsize);
    try {
      const decompressed = zlib.gunzipSync(block);
      if (decompressed.length > 0) {
        chunks.push(decompressed);
      }
    } catch {
      // EOF marker or corrupt block — stop
      break;
    }

    pos += bsize;
  }

  return Buffer.concat(chunks);
}

/**
 * Simple provider for bgzipped text files (.vcf.gz, .bed.gz, etc.)
 * without a tabix index. Decompresses the entire file into memory and
 * serves it line-by-line, just like TextDocumentProvider.
 *
 * For large files with a tabix index, Phase 3's TabixProvider will
 * replace this with region-based random access.
 */
export class BgzfTextProvider implements FileProvider {
  private lines: string[] = [];
  private headerLines: string[] = [];
  private _metadata: ProviderMetadata;

  private constructor(
    lines: string[],
    headerLines: string[],
    metadata: ProviderMetadata,
  ) {
    this.lines = lines;
    this.headerLines = headerLines;
    this._metadata = metadata;
  }

  static async create(uri: vscode.Uri, formatId: string): Promise<BgzfTextProvider> {
    const filePath = uri.fsPath;
    const compressed = await fs.promises.readFile(filePath);
    const decompressed = decompressBgzf(compressed);
    const text = decompressed.toString('utf-8');
    const lines = text.split('\n');

    // Remove trailing empty line from split
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Extract header lines (lines starting with # or @)
    const headerLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('#') || line.startsWith('@')) {
        headerLines.push(line);
      } else {
        break;
      }
    }

    const stat = await fs.promises.stat(filePath);

    const metadata: ProviderMetadata = {
      type: 'text',
      lineCount: lines.length,
      hasIndex: false,
      fileSize: stat.size,
      formatId,
      fileName: path.basename(filePath),
    };

    return new BgzfTextProvider(lines, headerLines, metadata);
  }

  async getRows(startLine: number, endLine: number): Promise<string[]> {
    const clamped = Math.min(endLine, this.lines.length);
    return this.lines.slice(startLine, clamped);
  }

  async getHeader(): Promise<string[]> {
    return this.headerLines;
  }

  async getMetadata(): Promise<ProviderMetadata> {
    return this._metadata;
  }

  dispose(): void {
    this.lines = [];
    this.headerLines = [];
  }
}
