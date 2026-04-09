// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstraction over different file access strategies:
 * - TextDocumentProvider: line-based reads from VS Code TextDocument (existing text formats)
 * - TabixProvider: region-based reads from bgzipped+tabix-indexed files (Phase 3)
 * - BamProvider: region-based reads from BAM files (Phase 4)
 */

export interface ReferenceInfo {
  name: string;
  length?: number;
}

export interface ProviderMetadata {
  /** 'text' = line-based TextDocument, 'indexed' = tabix/fai indexed, 'binary' = BAM/CRAM */
  type: 'text' | 'indexed' | 'binary';
  /** Total line count (text files only) */
  lineCount?: number;
  /** Reference sequences with optional lengths (indexed/binary files) */
  references?: ReferenceInfo[];
  /** Whether an index file was found */
  hasIndex: boolean;
  /** File size in bytes */
  fileSize: number;
  /** The language/format ID (e.g. 'omics-vcf') */
  formatId: string;
  /** Original file name */
  fileName: string;
}

export interface RegionResult {
  rows: string[];
  /** True if the query was truncated due to record limit */
  hasMore: boolean;
}

export interface FileProvider {
  /** Read lines by line number range (text files) */
  getRows(startLine: number, endLine: number): Promise<string[]>;

  /** Read records by genomic region (indexed/binary files). Optional — not all providers support this. */
  getRegion?(chrom: string, start: number, end: number): Promise<RegionResult>;

  /** Get available reference sequences (indexed/binary files). Optional. */
  getReferences?(): Promise<ReferenceInfo[]>;

  /** Get header lines (e.g. VCF ##, SAM @HD/@SQ). Optional. */
  getHeader?(): Promise<string[]>;

  /** Get metadata about this file/provider */
  getMetadata(): Promise<ProviderMetadata>;

  /** Release resources */
  dispose(): void;
}
