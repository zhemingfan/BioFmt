// SPDX-License-Identifier: GPL-3.0-or-later

import * as path from 'path';
import * as vscode from 'vscode';
import { BamFile, BamRecord } from '@gmod/bam';
import type { FileProvider, ProviderMetadata, ReferenceInfo, RegionResult } from './types';
import type { IndexInfo } from './indexDiscovery';

/** Maximum number of records returned per region query */
const MAX_REGION_ROWS = 10000;

/**
 * Convert a numeric quality array to ASCII Phred+33 string.
 * Returns '*' if quality is null or all 255 (unavailable).
 */
function qualToString(qual: Uint8Array | null): string {
  if (!qual || qual.length === 0) return '*';
  // BAM uses 0xff for unavailable quality
  if (qual.every((q) => q === 255)) return '*';
  return Array.from(qual)
    .map((q) => String.fromCharCode(q + 33))
    .join('');
}

/**
 * Format BAM tags as SAM-style tab-separated tag:type:value strings.
 */
function formatTags(tags: Record<string, unknown>): string[] {
  const result: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'number') {
      // Integer vs float detection
      if (Number.isInteger(value)) {
        result.push(`${key}:i:${value}`);
      } else {
        result.push(`${key}:f:${value}`);
      }
    } else if (typeof value === 'string') {
      if (value.length === 1) {
        result.push(`${key}:A:${value}`);
      } else {
        result.push(`${key}:Z:${value}`);
      }
    } else if (ArrayBuffer.isView(value)) {
      // Typed arrays (B tag)
      const arr = Array.from(value as Int32Array);
      let subtype = 'i';
      if (value instanceof Int8Array) subtype = 'c';
      else if (value instanceof Uint8Array) subtype = 'C';
      else if (value instanceof Int16Array) subtype = 's';
      else if (value instanceof Uint16Array) subtype = 'S';
      else if (value instanceof Float32Array) subtype = 'f';
      result.push(`${key}:B:${subtype},${arr.join(',')}`);
    } else if (Array.isArray(value)) {
      result.push(`${key}:B:i,${value.join(',')}`);
    } else {
      result.push(`${key}:Z:${String(value)}`);
    }
  }
  return result;
}

/**
 * Convert a BamRecord to a SAM-format text line.
 * This allows SamPreview to parse and display BAM records unchanged.
 */
function bamRecordToSamLine(
  record: BamRecord,
  indexToChr: { refName: string; length: number }[],
): string {
  const refName =
    record.ref_id >= 0 && record.ref_id < indexToChr.length
      ? indexToChr[record.ref_id].refName
      : '*';
  const nextRefName =
    record.next_refid >= 0 && record.next_refid < indexToChr.length
      ? indexToChr[record.next_refid].refName
      : '*';
  // SAM uses '=' for mate on same reference
  const rnext =
    record.next_refid === record.ref_id && record.next_refid >= 0
      ? '='
      : nextRefName;

  const fields = [
    record.name || '*',
    record.flags,
    refName,
    record.start + 1, // BAM 0-based → SAM 1-based
    record.mq ?? 0,
    record.CIGAR || '*',
    rnext,
    record.next_pos + 1, // BAM 0-based → SAM 1-based
    record.template_length,
    record.seq || '*',
    qualToString(record.qual),
  ];

  const tagStrings = formatTags(record.tags);
  if (tagStrings.length > 0) {
    return fields.join('\t') + '\t' + tagStrings.join('\t');
  }
  return fields.join('\t');
}

/**
 * FileProvider backed by a BAM file with .bai or .csi index.
 * Converts BAM records to SAM text lines for SamPreview.
 */
export class BamProvider implements FileProvider {
  private bam: BamFile;
  private _metadata: ProviderMetadata;
  private _refs: ReferenceInfo[] = [];
  private _headerLines: string[] = [];
  private _indexToChr: { refName: string; length: number }[] = [];

  private constructor(
    bam: BamFile,
    metadata: ProviderMetadata,
    refs: ReferenceInfo[],
    headerLines: string[],
    indexToChr: { refName: string; length: number }[],
  ) {
    this.bam = bam;
    this._metadata = metadata;
    this._refs = refs;
    this._headerLines = headerLines;
    this._indexToChr = indexToChr;
  }

  static async create(
    uri: vscode.Uri,
    indexInfo: IndexInfo,
  ): Promise<BamProvider> {
    const filePath = uri.fsPath;
    const indexPath = indexInfo.uri.fsPath;

    const opts: Record<string, string> = { bamPath: filePath };
    if (indexInfo.type === 'bai') {
      opts.baiPath = indexPath;
    } else {
      opts.csiPath = indexPath;
    }

    const bam = new BamFile(opts);

    // Trigger header parse to populate indexToChr
    await bam.getHeader();

    const indexToChr = bam.indexToChr || [];
    const refs: ReferenceInfo[] = indexToChr.map((r) => ({
      name: r.refName,
      length: r.length,
    }));

    const headerText = await bam.getHeaderText();
    const headerLines = headerText
      ? headerText.split('\n').filter((l) => l.length > 0)
      : [];

    const stat = await vscode.workspace.fs.stat(uri);

    const metadata: ProviderMetadata = {
      type: 'binary',
      hasIndex: true,
      fileSize: stat.size,
      formatId: 'omics-bam',
      fileName: path.basename(filePath),
      references: refs,
    };

    return new BamProvider(bam, metadata, refs, headerLines, indexToChr);
  }

  async getRows(startLine: number, endLine: number): Promise<string[]> {
    // For BAM files, line-based access returns SAM header lines
    return this._headerLines.slice(startLine, endLine);
  }

  async getRegion(chrom: string, start: number, end: number): Promise<RegionResult> {
    const records = await this.bam.getRecordsForRange(chrom, start, end);

    const truncated = records.length > MAX_REGION_ROWS;
    const subset = truncated ? records.slice(0, MAX_REGION_ROWS) : records;
    const rows = subset.map((r) => bamRecordToSamLine(r, this._indexToChr));

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
    // BamFile doesn't have a close method
  }
}
