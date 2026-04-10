// SPDX-License-Identifier: GPL-3.0-or-later

import type { Diagnostic } from 'vscode-languageserver/node';

export interface SpecRef {
  code: string;
  href: string;
  summary: string;
}

const VCF_SPEC = 'https://samtools.github.io/hts-specs/VCFv4.4.pdf';
const SAM_SPEC = 'https://samtools.github.io/hts-specs/SAMv1.pdf';
const BED_SPEC = 'https://genome.ucsc.edu/FAQ/FAQformat.html#format1';
const BEDPE_SPEC = 'https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format';
const GTF_SPEC = 'https://www.ensembl.org/info/website/upload/gff.html';
const GFF3_SPEC = 'https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md';
const PAF_SPEC = 'https://lh3.github.io/minimap2/minimap2.html#10';
const PSL_SPEC = 'https://genome.ucsc.edu/FAQ/FAQformat.html#format2';
const WIG_SPEC = 'https://genome.ucsc.edu/goldenPath/help/wiggle.html';
const BEDGRAPH_SPEC = 'https://genome.ucsc.edu/goldenPath/help/bedgraph.html';
const FASTA_SPEC = 'https://www.ncbi.nlm.nih.gov/genbank/fastaformat/';
const FASTQ_SPEC = 'https://www.ncbi.nlm.nih.gov/sra/docs/submitformats/#fastq-files';

export const SPEC_REFS: ReadonlyMap<string, SpecRef> = new Map([
  // VCF rules
  ['VCF-001', { code: 'VCF-001', href: VCF_SPEC, summary: 'VCF file must start with ##fileformat=' }],
  ['VCF-002', { code: 'VCF-002', href: VCF_SPEC, summary: 'VCF header must have at least 8 columns' }],
  ['VCF-003', { code: 'VCF-003', href: VCF_SPEC, summary: 'VCF data line must have at least 8 columns' }],
  ['VCF-004', { code: 'VCF-004', href: VCF_SPEC, summary: 'Data line column count must match header' }],
  ['VCF-005', { code: 'VCF-005', href: VCF_SPEC, summary: 'QUAL must be numeric or "."' }],
  ['VCF-006', { code: 'VCF-006', href: VCF_SPEC, summary: 'INFO key must be declared in header' }],

  // BED rules
  ['BED-001', { code: 'BED-001', href: BED_SPEC, summary: 'BED requires at least 3 columns' }],
  ['BED-002', { code: 'BED-002', href: BED_SPEC, summary: 'Start and end must be integers' }],
  ['BED-003', { code: 'BED-003', href: BED_SPEC, summary: 'Start position cannot be negative' }],
  ['BED-004', { code: 'BED-004', href: BED_SPEC, summary: 'Start must be less than end' }],

  // BEDPE rules
  ['BEDPE-001', { code: 'BEDPE-001', href: BEDPE_SPEC, summary: 'BEDPE requires at least 6 columns' }],
  ['BEDPE-002', { code: 'BEDPE-002', href: BEDPE_SPEC, summary: 'Coordinate pair 1 must be integers' }],
  ['BEDPE-003', { code: 'BEDPE-003', href: BEDPE_SPEC, summary: 'Coordinate pair 2 must be integers' }],
  ['BEDPE-004', { code: 'BEDPE-004', href: BEDPE_SPEC, summary: 'Start positions cannot be negative' }],
  ['BEDPE-005', { code: 'BEDPE-005', href: BEDPE_SPEC, summary: 'End must be >= start' }],
  ['BEDPE-006', { code: 'BEDPE-006', href: BEDPE_SPEC, summary: 'Strand fields should be +, -, or .' }],

  // SAM rules
  ['SAM-001', { code: 'SAM-001', href: SAM_SPEC, summary: 'SAM requires at least 11 columns' }],
  ['SAM-002', { code: 'SAM-002', href: SAM_SPEC, summary: 'FLAG must be a non-negative integer' }],
  ['SAM-003', { code: 'SAM-003', href: SAM_SPEC, summary: 'POS must be a non-negative integer' }],
  ['SAM-004', { code: 'SAM-004', href: SAM_SPEC, summary: 'MAPQ should be between 0 and 255' }],

  // GTF rules
  ['GTF-001', { code: 'GTF-001', href: GTF_SPEC, summary: 'GTF requires 9 columns' }],
  ['GTF-002', { code: 'GTF-002', href: GTF_SPEC, summary: 'Start and end must be integers' }],
  ['GTF-003', { code: 'GTF-003', href: GTF_SPEC, summary: 'Start cannot be greater than end' }],
  ['GTF-004', { code: 'GTF-004', href: GTF_SPEC, summary: 'Strand must be +, -, or .' }],
  ['GTF-005', { code: 'GTF-005', href: GTF_SPEC, summary: 'Frame must be 0, 1, 2, or .' }],
  ['GTF-006', { code: 'GTF-006', href: GTF_SPEC, summary: 'Attributes should use key "value"; format' }],

  // GFF3 rules
  ['GFF3-001', { code: 'GFF3-001', href: GFF3_SPEC, summary: 'GFF3 requires 9 columns' }],
  ['GFF3-002', { code: 'GFF3-002', href: GFF3_SPEC, summary: 'Start and end must be integers' }],
  ['GFF3-003', { code: 'GFF3-003', href: GFF3_SPEC, summary: 'Start cannot be greater than end' }],
  ['GFF3-004', { code: 'GFF3-004', href: GFF3_SPEC, summary: 'Strand must be +, -, ., or ?' }],
  ['GFF3-005', { code: 'GFF3-005', href: GFF3_SPEC, summary: 'Phase must be 0, 1, 2, or .' }],
  ['GFF3-006', { code: 'GFF3-006', href: GFF3_SPEC, summary: 'Attributes should use key=value format' }],

  // PAF rules
  ['PAF-001', { code: 'PAF-001', href: PAF_SPEC, summary: 'PAF requires at least 12 columns' }],
  ['PAF-002', { code: 'PAF-002', href: PAF_SPEC, summary: 'Numeric columns must be non-negative integers' }],
  ['PAF-003', { code: 'PAF-003', href: PAF_SPEC, summary: 'Strand must be + or -' }],
  ['PAF-004', { code: 'PAF-004', href: PAF_SPEC, summary: 'Query start should be less than query end' }],
  ['PAF-005', { code: 'PAF-005', href: PAF_SPEC, summary: 'Target start should be less than target end' }],

  // PSL rules
  ['PSL-001', { code: 'PSL-001', href: PSL_SPEC, summary: 'PSL requires 21 columns' }],
  ['PSL-002', { code: 'PSL-002', href: PSL_SPEC, summary: 'Numeric columns must be non-negative integers' }],
  ['PSL-003', { code: 'PSL-003', href: PSL_SPEC, summary: 'Invalid strand value' }],
  ['PSL-004', { code: 'PSL-004', href: PSL_SPEC, summary: 'Query start should be less than query end' }],
  ['PSL-005', { code: 'PSL-005', href: PSL_SPEC, summary: 'Target start should be less than target end' }],

  // WIG rules
  ['WIG-001', { code: 'WIG-001', href: WIG_SPEC, summary: 'fixedStep requires chrom parameter' }],
  ['WIG-002', { code: 'WIG-002', href: WIG_SPEC, summary: 'fixedStep requires start parameter' }],
  ['WIG-003', { code: 'WIG-003', href: WIG_SPEC, summary: 'fixedStep requires step parameter' }],
  ['WIG-004', { code: 'WIG-004', href: WIG_SPEC, summary: 'step must be a positive integer' }],
  ['WIG-005', { code: 'WIG-005', href: WIG_SPEC, summary: 'span should be a positive integer' }],
  ['WIG-006', { code: 'WIG-006', href: WIG_SPEC, summary: 'variableStep requires chrom parameter' }],
  ['WIG-007', { code: 'WIG-007', href: WIG_SPEC, summary: 'fixedStep data lines should have one value' }],
  ['WIG-008', { code: 'WIG-008', href: WIG_SPEC, summary: 'Invalid numeric value' }],
  ['WIG-009', { code: 'WIG-009', href: WIG_SPEC, summary: 'variableStep data lines require position and value' }],
  ['WIG-010', { code: 'WIG-010', href: WIG_SPEC, summary: 'Position must be a non-negative integer' }],

  // bedGraph rules
  ['BDG-001', { code: 'BDG-001', href: BEDGRAPH_SPEC, summary: 'bedGraph requires 4 columns' }],
  ['BDG-002', { code: 'BDG-002', href: BEDGRAPH_SPEC, summary: 'Start must be a non-negative integer' }],
  ['BDG-003', { code: 'BDG-003', href: BEDGRAPH_SPEC, summary: 'End must be a non-negative integer' }],
  ['BDG-004', { code: 'BDG-004', href: BEDGRAPH_SPEC, summary: 'Start must be less than end' }],
  ['BDG-005', { code: 'BDG-005', href: BEDGRAPH_SPEC, summary: 'Value must be a number' }],

  // FASTA rules
  ['FASTA-001', { code: 'FASTA-001', href: FASTA_SPEC, summary: 'FASTA file should start with > header' }],
  ['FASTA-002', { code: 'FASTA-002', href: FASTA_SPEC, summary: 'FASTA header is empty' }],
  ['FASTA-003', { code: 'FASTA-003', href: FASTA_SPEC, summary: 'Invalid base characters for FASTA' }],

  // FASTQ rules
  ['FASTQ-001', { code: 'FASTQ-001', href: FASTQ_SPEC, summary: 'FASTQ record should start with @ header' }],
  ['FASTQ-002', { code: 'FASTQ-002', href: FASTQ_SPEC, summary: 'Expected + separator on line 3' }],
  ['FASTQ-003', { code: 'FASTQ-003', href: FASTQ_SPEC, summary: 'Quality length must match sequence length' }],

  // === Strict-mode rules ===

  // VCF strict
  ['VCF-S001', { code: 'VCF-S001', href: VCF_SPEC, summary: 'REF must contain only A, C, G, T, N' }],
  ['VCF-S002', { code: 'VCF-S002', href: VCF_SPEC, summary: 'ALT must match VCF spec patterns' }],
  ['VCF-S003', { code: 'VCF-S003', href: VCF_SPEC, summary: 'FILTER value must be declared in header' }],
  ['VCF-S004', { code: 'VCF-S004', href: VCF_SPEC, summary: 'FORMAT key must be declared in header' }],
  ['VCF-S005', { code: 'VCF-S005', href: VCF_SPEC, summary: 'POS must be >= 1 (1-based coordinate)' }],

  // BED strict
  ['BED-S001', { code: 'BED-S001', href: BED_SPEC, summary: 'Score must be 0-1000' }],
  ['BED-S002', { code: 'BED-S002', href: BED_SPEC, summary: 'Strand must be +, -, or .' }],

  // SAM strict
  ['SAM-S001', { code: 'SAM-S001', href: SAM_SPEC, summary: 'CIGAR must match valid operation pattern' }],
  ['SAM-S002', { code: 'SAM-S002', href: SAM_SPEC, summary: 'FLAG must be 0-65535' }],
  ['SAM-S003', { code: 'SAM-S003', href: SAM_SPEC, summary: 'SEQ must contain only valid bases or *' }],

  // GTF strict
  ['GTF-S001', { code: 'GTF-S001', href: GTF_SPEC, summary: 'Score must be numeric or .' }],
  ['GTF-S002', { code: 'GTF-S002', href: GTF_SPEC, summary: 'Attributes must contain gene_id' }],
  ['GTF-S003', { code: 'GTF-S003', href: GTF_SPEC, summary: 'Attributes must contain transcript_id' }],

  // GFF3 strict
  ['GFF3-S001', { code: 'GFF3-S001', href: GFF3_SPEC, summary: 'First line must be ##gff-version 3' }],
  ['GFF3-S002', { code: 'GFF3-S002', href: GFF3_SPEC, summary: 'Score must be numeric or .' }],

  // FASTA strict
  ['FASTA-S001', { code: 'FASTA-S001', href: FASTA_SPEC, summary: 'Blank line within sequence block' }],

  // FASTQ strict
  ['FASTQ-S001', { code: 'FASTQ-S001', href: FASTQ_SPEC, summary: 'Quality scores must be in Phred range (ASCII 33-126)' }],
  ['FASTQ-S002', { code: 'FASTQ-S002', href: FASTQ_SPEC, summary: 'Sequence must contain only valid bases' }],

  // === Cross-field validation rules (strict mode) ===

  // VCF cross-field
  ['VCF-X001', { code: 'VCF-X001', href: VCF_SPEC, summary: 'FORMAT key count must match sample value count' }],
  ['VCF-X002', { code: 'VCF-X002', href: VCF_SPEC, summary: 'Genotype allele index out of range' }],
  ['VCF-X003', { code: 'VCF-X003', href: VCF_SPEC, summary: 'AD field length must match allele count' }],

  // SAM cross-field
  ['SAM-X001', { code: 'SAM-X001', href: SAM_SPEC, summary: 'CIGAR query length must match SEQ length' }],
  ['SAM-X002', { code: 'SAM-X002', href: SAM_SPEC, summary: 'FLAG bit conflict: unmapped + properly paired' }],
  ['SAM-X003', { code: 'SAM-X003', href: SAM_SPEC, summary: 'Paired-end FLAG bits require paired flag (0x1)' }],

  // GFF3 cross-field
  ['GFF3-X001', { code: 'GFF3-X001', href: GFF3_SPEC, summary: 'Parent attribute references non-existent ID' }],
  ['GFF3-X002', { code: 'GFF3-X002', href: GFF3_SPEC, summary: 'Duplicate feature ID' }],
]);

/**
 * Attach spec reference to a diagnostic. Returns the diagnostic for chaining.
 */
export function withSpecRef(diagnostic: Diagnostic, ruleCode: string): Diagnostic {
  const ref = SPEC_REFS.get(ruleCode);
  if (ref) {
    diagnostic.code = ruleCode;
    diagnostic.codeDescription = { href: ref.href };
  }
  return diagnostic;
}
