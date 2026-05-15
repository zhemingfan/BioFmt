// SPDX-License-Identifier: GPL-3.0-or-later

import type * as vscode from 'vscode';
import { parseGenomicCoords, parseFastaContigName } from '../shared/genomicCoords';

/**
 * A genomic region indexed from an open document.
 * All coordinates are stored as 0-based half-open internally.
 */
export interface GenomicRegion {
  chrom: string;
  start: number;  // 0-based
  end: number;    // 0-based, exclusive
  lineNumber: number;
  uri: string;
}

interface DocumentIndex {
  uri: string;
  languageId: string;
  version: number;
  regions: GenomicRegion[];
  /** For FASTA: index by contig name instead of coordinates */
  contigs?: Map<string, number>;
}

const MAX_INDEX_LINES = 50000;

/**
 * Tracks genomic coordinates from open documents for cross-format navigation.
 * Provides overlap queries so a VCF variant can jump to overlapping BED/GFF3 features.
 */
export class GenomicIndexRegistry {
  private indices = new Map<string, DocumentIndex>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Index a document's genomic regions.
   * Parses coordinates based on languageId and caches them.
   */
  indexDocument(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    const languageId = document.languageId;

    // Only index supported formats
    if (!this.isSupported(languageId)) return;

    // Skip if already indexed at this version
    const existing = this.indices.get(uri);
    if (existing && existing.version === document.version) return;

    const text = document.getText();
    const lines = text.split('\n');
    const regions: GenomicRegion[] = [];
    const contigs = new Map<string, number>();

    let dataLines = 0;
    for (let i = 0; i < lines.length && dataLines < MAX_INDEX_LINES; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const region = this.parseLine(line, i, languageId, contigs);
      if (region) {
        regions.push({ ...region, uri });
        dataLines++;
      }
    }

    // Sort by chrom + start for binary search
    regions.sort((a, b) => {
      const chromCmp = a.chrom.localeCompare(b.chrom);
      if (chromCmp !== 0) return chromCmp;
      return a.start - b.start;
    });

    this.indices.set(uri, {
      uri,
      languageId,
      version: document.version,
      regions,
      contigs: contigs.size > 0 ? contigs : undefined,
    });
  }

  /**
   * Schedule a debounced re-index for a document.
   */
  scheduleReindex(document: vscode.TextDocument): void {
    const uri = document.uri.toString();
    const existing = this.debounceTimers.get(uri);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(uri, setTimeout(() => {
      this.debounceTimers.delete(uri);
      // Clear cached version to force re-index
      const idx = this.indices.get(uri);
      if (idx) idx.version = -1;
      this.indexDocument(document);
    }, 2000));
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(uri: string): void {
    this.indices.delete(uri);
    const timer = this.debounceTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(uri);
    }
  }

  /**
   * Find regions in other documents that overlap with the given coordinates.
   */
  findOverlapping(
    chrom: string,
    start: number,
    end: number,
    excludeUri?: string
  ): GenomicRegion[] {
    const results: GenomicRegion[] = [];

    for (const [uri, index] of this.indices) {
      if (uri === excludeUri) continue;

      // Binary search for first region on this chrom that might overlap
      const regions = index.regions;
      let lo = 0, hi = regions.length;

      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const r = regions[mid];
        if (r.chrom < chrom || (r.chrom === chrom && r.end <= start)) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      // Scan forward collecting overlaps
      for (let i = lo; i < regions.length; i++) {
        const r = regions[i];
        if (r.chrom !== chrom || r.start >= end) break;
        if (r.end > start) {
          results.push(r);
        }
      }
    }

    return results;
  }

  /**
   * Find a FASTA contig by name in other open documents.
   */
  findContig(contigName: string, excludeUri?: string): GenomicRegion | null {
    for (const [uri, index] of this.indices) {
      if (uri === excludeUri) continue;
      if (index.contigs) {
        const lineNumber = index.contigs.get(contigName);
        if (lineNumber !== undefined) {
          return { chrom: contigName, start: 0, end: 0, lineNumber, uri };
        }
      }
    }
    return null;
  }

  /**
   * Get all indexed document URIs.
   */
  getIndexedUris(): string[] {
    return Array.from(this.indices.keys());
  }

  /**
   * Dispose of all timers.
   */
  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.indices.clear();
  }

  private isSupported(languageId: string): boolean {
    return [
      'omics-vcf', 'omics-bed', 'omics-bedpe', 'omics-narrowpeak', 'omics-broadpeak',
      'omics-gff3', 'omics-gtf', 'omics-sam', 'omics-paf', 'omics-fasta',
    ].includes(languageId);
  }

  private parseLine(
    line: string,
    lineNumber: number,
    languageId: string,
    contigs: Map<string, number>
  ): Omit<GenomicRegion, 'uri'> | null {
    if (languageId === 'omics-fasta') {
      const name = parseFastaContigName(line);
      if (name) contigs.set(name, lineNumber);
      return null;
    }

    const coords = parseGenomicCoords(line, languageId);
    if (!coords) return null;

    return { chrom: coords.chrom, start: coords.start, end: coords.end, lineNumber };
  }
}
