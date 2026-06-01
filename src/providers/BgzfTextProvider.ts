// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { FileProvider, ProviderMetadata } from './types';
import { decompressGzipText } from '../shared/gzipText';

/**
 * Simple provider for gzipped text files (.vcf.gz, .bed.gz, etc.) without a
 * tabix index. Decompresses the entire file into memory and serves it
 * line-by-line, just like TextDocumentProvider.
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
    const decompressed = decompressGzipText(compressed);
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
