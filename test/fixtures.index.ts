// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Registry mapping format identifiers to fixture file paths.
 * All paths are relative to the test/fixtures directory.
 */

import * as path from 'path';

export const FIXTURES_DIR = path.join(__dirname, 'fixtures');

export interface FixtureInfo {
  path: string;
  languageId: string;
  description: string;
}

export const FIXTURES: Record<string, FixtureInfo> = {
  // VCF
  'vcf-example': {
    path: 'example.vcf',
    languageId: 'omics-vcf',
    description: 'VCF with INFO and FORMAT definitions, 4 samples',
  },
  'vcf-v45-showcase': {
    path: 'vcf_v45_format_showcase.vcf',
    languageId: 'omics-vcf',
    description: 'VCF v4.5 with all reserved FORMAT fields',
  },
  'vcf-format-groups': {
    path: 'vcf_format_groups.vcf',
    languageId: 'omics-vcf',
    description: 'VCF with FORMAT fields grouped by color category',
  },

  // SAM
  'sam-toy': {
    path: 'toy.sam',
    languageId: 'omics-sam',
    description: 'Small SAM file with header and alignments',
  },

  // BED
  'bed-example': {
    path: 'bedExample.bed',
    languageId: 'omics-bed',
    description: 'BED file with genomic intervals',
  },

  // BEDPE
  'bedpe-example': {
    path: 'example.bedpe',
    languageId: 'omics-bedpe',
    description: 'BEDPE paired-end BED file',
  },

  // GTF
  'gtf-example': {
    path: 'bigGenePredExample4.gtf',
    languageId: 'omics-gtf',
    description: 'GTF gene annotation file',
  },

  // GFF3
  'gff3-example': {
    path: 'simpleGff3.gff',
    languageId: 'omics-gff3',
    description: 'GFF3 feature file',
  },

  // PSL
  'psl-example': {
    path: 'bigPsl.psl',
    languageId: 'omics-psl',
    description: 'PSL alignment file',
  },

  // PAF
  'paf-example': {
    path: 'example.paf',
    languageId: 'omics-paf',
    description: 'PAF minimap2-style alignment',
  },

  // MAF (alignment)
  'maf-alignment': {
    path: 'bigMaf_head120.maf',
    languageId: 'omics-maf-alignment',
    description: 'UCSC MAF multiple alignment format',
  },

  // PED
  'ped-example': {
    path: 'example.ped',
    languageId: 'omics-ped',
    description: 'PLINK PED pedigree file',
  },

  // MAP
  'map-example': {
    path: 'example.map',
    languageId: 'omics-map',
    description: 'PLINK MAP genetic map file',
  },

  // GCT
  'gct-example': {
    path: 'example.gct',
    languageId: 'omics-gct',
    description: 'GCT expression matrix',
  },

  // MTX
  'mtx-example': {
    path: 'matrix.mtx',
    languageId: 'omics-mtx',
    description: 'MatrixMarket sparse matrix',
  },

  // MTX bundle sidecars
  'mtx-barcodes': {
    path: 'barcodes.tsv',
    languageId: 'plaintext',
    description: 'Barcodes sidecar for MTX bundle',
  },
  'mtx-features': {
    path: 'features.tsv',
    languageId: 'plaintext',
    description: 'Features sidecar for MTX bundle',
  },

  // mzTab
  'mztab-lipidomics': {
    path: 'lipidomics-example.mzTab',
    languageId: 'omics-mztab',
    description: 'mzTab-M 2.0 lipidomics example',
  },
  'mztab-mtbls': {
    path: 'MTBLS263.mztab',
    languageId: 'omics-mztab',
    description: 'mzTab-M 2.0 MTBLS example',
  },
  'mztab-large': {
    path: 'MouseLiver_negative.mzTab',
    languageId: 'omics-mztab',
    description: 'Large mzTab-M file (~1.5MB)',
  },

  // MGF
  'mgf-example': {
    path: 'example.mgf',
    languageId: 'omics-mgf',
    description: 'MGF mass spectrometry file',
  },

  // bedGraph
  'bedgraph-example': {
    path: 'example.bedGraph',
    languageId: 'omics-bedgraph',
    description: 'bedGraph track file',
  },

  // WIG
  'wig-example': {
    path: 'wiggleExample.wig',
    languageId: 'omics-wig',
    description: 'WIG track file with fixedStep and variableStep',
  },

  // narrowPeak
  'narrowpeak-example': {
    path: 'bigNarrowPeak_head200.narrowPeak',
    languageId: 'omics-narrowpeak',
    description: 'narrowPeak ChIP-seq peaks (first 200 lines)',
  },
  'narrowpeak-full': {
    path: 'bigNarrowPeak_full.narrowPeak',
    languageId: 'omics-narrowpeak',
    description: 'Full narrowPeak file (large)',
  },

  // GenBank
  'genbank-example': {
    path: 'ls_orchid.gbk',
    languageId: 'omics-genbank',
    description: 'GenBank sequence file (Biopython example)',
  },

  // Chain
  'chain-example': {
    path: 'example.chain',
    languageId: 'omics-chain',
    description: 'UCSC chain file',
  },

  // Net
  'net-example': {
    path: 'example.net',
    languageId: 'omics-net',
    description: 'UCSC net file',
  },

  // GFA
  'gfa-example': {
    path: 'example.gfa',
    languageId: 'omics-gfa',
    description: 'GFA assembly graph',
  },

};

/**
 * Get the absolute path to a fixture file
 */
export function getFixturePath(fixtureId: string): string {
  const fixture = FIXTURES[fixtureId];
  if (!fixture) {
    throw new Error(`Unknown fixture: ${fixtureId}`);
  }
  return path.join(FIXTURES_DIR, fixture.path);
}

