// SPDX-License-Identifier: GPL-3.0-or-later

import * as path from 'path';
import * as vscode from 'vscode';
import { TabixIndexedFile } from '@gmod/tabix';
import type { FileProvider, ProviderMetadata, ReferenceInfo, RegionResult } from './types';
import type { IndexInfo } from './indexDiscovery';

/** Maximum number of records returned per region query to avoid UI overload */
const MAX_REGION_ROWS = 10000;

/**
 * FileProvider backed by a tabix-indexed bgzipped file.
 * Supports region-based random access via .tbi or .csi indexes.
 */
export class TabixProvider implements FileProvider {
  private tabix: TabixIndexedFile;
  private _metadata: ProviderMetadata;
  private _refs: ReferenceInfo[] = [];
  private _headerLines: string[] = [];

  private constructor(
    tabix: TabixIndexedFile,
    metadata: ProviderMetadata,
    refs: ReferenceInfo[],
    headerLines: string[],
  ) {
    this.tabix = tabix;
    this._metadata = metadata;
    this._refs = refs;
    this._headerLines = headerLines;
  }

  static async create(
    uri: vscode.Uri,
    formatId: string,
    indexInfo: IndexInfo,
  ): Promise<TabixProvider> {
    const filePath = uri.fsPath;
    const indexPath = indexInfo.uri.fsPath;

    const opts: Record<string, string> = { path: filePath };
    if (indexInfo.type === 'tbi') {
      opts.tbiPath = indexPath;
    } else {
      opts.csiPath = indexPath;
    }

    const tabix = new TabixIndexedFile(opts);

    // Fetch references and header in parallel
    const [refNames, header] = await Promise.all([
      tabix.getReferenceSequenceNames(),
      tabix.getHeader(),
    ]);

    const refs: ReferenceInfo[] = refNames.map((name) => ({ name }));
    const headerLines = header ? header.split('\n').filter((l) => l.length > 0) : [];

    const stat = await vscode.workspace.fs.stat(uri);

    const metadata: ProviderMetadata = {
      type: 'indexed',
      hasIndex: true,
      fileSize: stat.size,
      formatId,
      fileName: path.basename(filePath),
      references: refs,
    };

    return new TabixProvider(tabix, metadata, refs, headerLines);
  }

  async getRows(startLine: number, endLine: number): Promise<string[]> {
    // For indexed files, line-based access returns header lines
    return this._headerLines.slice(startLine, endLine);
  }

  async getRegion(chrom: string, start: number, end: number): Promise<RegionResult> {
    const rows: string[] = [];
    let truncated = false;

    await this.tabix.getLines(chrom, start, end, {
      lineCallback: (line) => {
        if (rows.length >= MAX_REGION_ROWS) {
          truncated = true;
          return;
        }
        rows.push(line);
      },
    });

    return { rows, hasMore: truncated };
  }

  async getReferences(): Promise<ReferenceInfo[]> {
    return this._refs;
  }

  async getHeader(): Promise<string[]> {
    return this._headerLines;
  }

  async getMetadata(): Promise<ProviderMetadata> {
    return this._metadata;
  }

  dispose(): void {
    // TabixIndexedFile doesn't have a close method
  }
}
