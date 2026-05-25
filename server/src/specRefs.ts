// SPDX-License-Identifier: GPL-3.0-or-later

import type { Diagnostic } from 'vscode-languageserver/node';

export interface SpecRef {
  code: string;
  href: string;
  summary: string;
  details?: string;
  example?: string;
  safeFix?: {
    title: string;
  };
}

const VCF_SPEC = 'https://github.com/samtools/hts-specs/blob/master/VCFv4.5.tex?plain=1';
const SAM_SPEC = 'https://samtools.github.io/hts-specs/SAMv1.pdf';
const BED_SPEC = 'https://genome.ucsc.edu/FAQ/FAQformat.html#format1';
const BEDPE_SPEC = 'https://bedtools.readthedocs.io/en/latest/content/general-usage.html#bedpe-format';
const GTF_SPEC = 'https://www.ensembl.org/info/website/upload/gff.html';
const GFF3_SPEC_COMMIT = 'fe73505276dd324bf6a55773f3413fe2bed47af4';
const GFF3_SPEC = `https://github.com/The-Sequence-Ontology/Specifications/blob/${GFF3_SPEC_COMMIT}/gff3.md?plain=1`;
const PAF_SPEC = 'https://lh3.github.io/minimap2/minimap2.html#10';
const PSL_SPEC = 'https://genome.ucsc.edu/FAQ/FAQformat.html#format2';
const WIG_SPEC = 'https://genome.ucsc.edu/goldenPath/help/wiggle.html';
const BEDGRAPH_SPEC = 'https://genome.ucsc.edu/goldenPath/help/bedgraph.html';
const FASTA_SPEC = 'https://www.ncbi.nlm.nih.gov/genbank/fastaformat/';
const FASTQ_SPEC = 'https://www.ncbi.nlm.nih.gov/sra/docs/submitformats/#fastq-files';

function gff3SpecLines(start: number, end = start): string {
  const anchor = end === start ? `#L${start}` : `#L${start}-L${end}`;
  return `${GFF3_SPEC}${anchor}`;
}

function vcfSpecLines(start: number, end = start): string {
  const anchor = end === start ? `#L${start}` : `#L${start}-L${end}`;
  return `${VCF_SPEC}${anchor}`;
}

export const SPEC_REFS: ReadonlyMap<string, SpecRef> = new Map([
  // VCF rules
  ['VCF-001', { code: 'VCF-001', href: vcfSpecLines(142, 146), summary: 'VCF file must start with ##fileformat=' }],
  ['VCF-002', { code: 'VCF-002', href: vcfSpecLines(360, 376), summary: 'VCF header must have at least 8 columns' }],
  ['VCF-003', { code: 'VCF-003', href: vcfSpecLines(378, 386), summary: 'VCF data line must have at least 8 columns' }],
  ['VCF-004', { code: 'VCF-004', href: vcfSpecLines(497, 500), summary: 'Data line column count must match header' }],
  ['VCF-005', { code: 'VCF-005', href: vcfSpecLines(420, 422), summary: 'QUAL must be numeric or "."' }],
  ['VCF-006', { code: 'VCF-006', href: vcfSpecLines(437), summary: 'INFO key must be declared in header' }],

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
  ['GFF3_MISSING_VERSION', {
    code: 'GFF3_MISSING_VERSION',
    href: gff3SpecLines(138, 140),
    summary: 'GFF3 file must declare ##gff-version first',
    details: 'GFF3 files must start with a version directive before feature records, comments, or FASTA content.',
    example: '##gff-version 3',
    safeFix: { title: 'Insert ##gff-version 3' },
  }],
  ['GFF3_VERSION_NOT_FIRST', { code: 'GFF3_VERSION_NOT_FIRST', href: gff3SpecLines(138, 140), summary: '##gff-version must be the first non-empty line' }],
  ['GFF3_DUPLICATE_VERSION', { code: 'GFF3_DUPLICATE_VERSION', href: gff3SpecLines(138, 140), summary: '##gff-version should occur once' }],
  ['GFF3_MALFORMED_DIRECTIVE', { code: 'GFF3_MALFORMED_DIRECTIVE', href: gff3SpecLines(138, 140), summary: 'GFF3 directives must use valid directive syntax' }],
  ['GFF3_DUPLICATE_SEQUENCE_REGION', { code: 'GFF3_DUPLICATE_SEQUENCE_REGION', href: gff3SpecLines(473, 474), summary: 'Only one ##sequence-region directive may be given per seqid' }],
  ['GFF3_FIELD_COUNT', { code: 'GFF3_FIELD_COUNT', href: gff3SpecLines(24), summary: 'GFF3 feature records must have exactly 9 tab-delimited columns' }],
  ['GFF3_INLINE_COMMENT', { code: 'GFF3_INLINE_COMMENT', href: gff3SpecLines(138), summary: 'End-of-line comments are not allowed on feature or directive lines' }],
  ['GFF3_INVALID_PERCENT_ESCAPE', { code: 'GFF3_INVALID_PERCENT_ESCAPE', href: gff3SpecLines(64, 66), summary: 'Reserved characters must use valid percent escapes' }],
  ['GFF3_ILLEGAL_CONTROL_CHARACTER', { code: 'GFF3_ILLEGAL_CONTROL_CHARACTER', href: gff3SpecLines(64, 66), summary: 'Control characters must be percent-encoded' }],
  ['GFF3_INVALID_SEQID', { code: 'GFF3_INVALID_SEQID', href: gff3SpecLines(44, 45), summary: 'Seqid must use legal unescaped characters or percent escapes' }],
  ['GFF3_INVALID_TYPE', { code: 'GFF3_INVALID_TYPE', href: gff3SpecLines(48, 49), summary: 'Feature type must be a valid GFF3 type value' }],
  ['GFF3_INVALID_START', { code: 'GFF3_INVALID_START', href: gff3SpecLines(50, 52), summary: 'Start must be a positive 1-based integer' }],
  ['GFF3_INVALID_END', { code: 'GFF3_INVALID_END', href: gff3SpecLines(50, 52), summary: 'End must be a positive 1-based integer' }],
  ['GFF3_START_GT_END', { code: 'GFF3_START_GT_END', href: gff3SpecLines(50, 52), summary: 'Start must be less than or equal to end' }],
  ['GFF3_INVALID_SCORE', { code: 'GFF3_INVALID_SCORE', href: gff3SpecLines(55, 56), summary: 'Score must be numeric or "."' }],
  ['GFF3_INVALID_STRAND', { code: 'GFF3_INVALID_STRAND', href: gff3SpecLines(57, 58), summary: 'Strand must be +, -, ., or ?' }],
  ['GFF3_INVALID_PHASE', { code: 'GFF3_INVALID_PHASE', href: gff3SpecLines(59, 62), summary: 'Phase must be valid for the feature type' }],
  ['GFF3_CDS_PHASE_REQUIRED', { code: 'GFF3_CDS_PHASE_REQUIRED', href: gff3SpecLines(59, 62), summary: 'CDS features require phase 0, 1, or 2' }],
  ['GFF3_INVALID_ATTRIBUTES', { code: 'GFF3_INVALID_ATTRIBUTES', href: gff3SpecLines(64, 96), summary: 'Attributes must use semicolon-separated tag=value syntax' }],
  ['GFF3_EMPTY_ATTRIBUTE_TAG', { code: 'GFF3_EMPTY_ATTRIBUTE_TAG', href: gff3SpecLines(64, 66), summary: 'Attribute tags must not be empty' }],
  ['GFF3_MISSING_ATTRIBUTE_EQUALS', { code: 'GFF3_MISSING_ATTRIBUTE_EQUALS', href: gff3SpecLines(64, 66), summary: 'Attributes must include a tag=value separator' }],
  ['GFF3_INVALID_MULTIVALUE_ATTRIBUTE', { code: 'GFF3_INVALID_MULTIVALUE_ATTRIBUTE', href: gff3SpecLines(92, 95), summary: 'Only selected reserved attributes may contain comma-separated values' }],
  ['GFF3_UNKNOWN_RESERVED_ATTRIBUTE', { code: 'GFF3_UNKNOWN_RESERVED_ATTRIBUTE', href: gff3SpecLines(95, 96), summary: 'Unknown uppercase attributes are reserved by GFF3' }],
  ['GFF3_INVALID_TARGET', { code: 'GFF3_INVALID_TARGET', href: gff3SpecLines(77, 78), summary: 'Target must use target_id start end [strand]' }],
  ['GFF3_INVALID_GAP', { code: 'GFF3_INVALID_GAP', href: gff3SpecLines(258, 265), summary: 'Gap must use GFF3 operation-length pairs' }],
  ['GFF3_INVALID_DBXREF', { code: 'GFF3_INVALID_DBXREF', href: gff3SpecLines(447, 449), summary: 'Dbxref values should use DBTAG:ID format' }],
  ['GFF3_INVALID_ONTOLOGY_TERM', { code: 'GFF3_INVALID_ONTOLOGY_TERM', href: gff3SpecLines(447, 449), summary: 'Ontology_term values should use DBTAG:ID format' }],
  ['GFF3_INVALID_IS_CIRCULAR', { code: 'GFF3_INVALID_IS_CIRCULAR', href: gff3SpecLines(238, 244), summary: 'Is_circular should be true when present' }],

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
  ['VCF-S001', { code: 'VCF-S001', href: vcfSpecLines(403, 411), summary: 'REF must contain only A, C, G, T, N' }],
  ['VCF-S002', { code: 'VCF-S002', href: vcfSpecLines(413, 419), summary: 'ALT must match VCF spec patterns' }],
  ['VCF-S003', { code: 'VCF-S003', href: vcfSpecLines(177, 181), summary: 'FILTER value must be declared in header' }],
  ['VCF-S004', { code: 'VCF-S004', href: vcfSpecLines(184, 189), summary: 'FORMAT key must be declared in header' }],
  ['VCF-S005', { code: 'VCF-S005', href: vcfSpecLines(393, 397), summary: 'POS must be >= 1 (1-based coordinate)' }],

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
  ['GFF3_DUPLICATE_ID_CONFLICT', { code: 'GFF3_DUPLICATE_ID_CONFLICT', href: gff3SpecLines(69, 70), summary: 'Repeated IDs must represent one discontinuous feature' }],
  ['GFF3_UNRESOLVED_PARENT', { code: 'GFF3_UNRESOLVED_PARENT', href: gff3SpecLines(75, 76), summary: 'Parent attributes must resolve to feature IDs' }],
  ['GFF3_UNRESOLVED_DERIVES_FROM', { code: 'GFF3_UNRESOLVED_DERIVES_FROM', href: gff3SpecLines(81, 82), summary: 'Derives_from attributes should resolve to feature IDs' }],
  ['GFF3_PARENT_CYCLE', { code: 'GFF3_PARENT_CYCLE', href: gff3SpecLines(250, 254), summary: 'Parent relationships must not contain cycles' }],
  ['GFF3_OUT_OF_BOUNDS', { code: 'GFF3_OUT_OF_BOUNDS', href: gff3SpecLines(473, 474), summary: 'Feature coordinates should fit declared ##sequence-region bounds' }],
  ['GFF3_FASTA_BEFORE_HEADER', { code: 'GFF3_FASTA_BEFORE_HEADER', href: gff3SpecLines(530, 532), summary: 'FASTA sequence lines must follow a FASTA header' }],
  ['GFF3_ANNOTATION_AFTER_FASTA', { code: 'GFF3_ANNOTATION_AFTER_FASTA', href: gff3SpecLines(530, 532), summary: 'Annotation content is not allowed after ##FASTA' }],

  // FASTA strict
  ['FASTA-S001', { code: 'FASTA-S001', href: FASTA_SPEC, summary: 'Blank line within sequence block' }],

  // FASTQ strict
  ['FASTQ-S001', { code: 'FASTQ-S001', href: FASTQ_SPEC, summary: 'Quality scores must be in Phred range (ASCII 33-126)' }],
  ['FASTQ-S002', { code: 'FASTQ-S002', href: FASTQ_SPEC, summary: 'Sequence must contain only valid bases' }],

  // === Cross-field validation rules (strict mode) ===

  // VCF cross-field
  ['VCF-X001', { code: 'VCF-X001', href: vcfSpecLines(497, 500), summary: 'FORMAT key count must match sample value count' }],
  ['VCF-X002', { code: 'VCF-X002', href: vcfSpecLines(613, 619), summary: 'Genotype allele index out of range' }],
  ['VCF-X003', { code: 'VCF-X003', href: vcfSpecLines(534), summary: 'AD field length must match allele count' }],

  // SAM cross-field
  ['SAM-X001', { code: 'SAM-X001', href: SAM_SPEC, summary: 'CIGAR query length must match SEQ length' }],
  ['SAM-X002', { code: 'SAM-X002', href: SAM_SPEC, summary: 'FLAG bit conflict: unmapped + properly paired' }],
  ['SAM-X003', { code: 'SAM-X003', href: SAM_SPEC, summary: 'Paired-end FLAG bits require paired flag (0x1)' }],

  // GFF3 cross-field rules are listed in the GFF3 strict block above.
]);

/**
 * Spec refs contributed at runtime by declarative format specs (/formats/*.json).
 * Kept separate from the static SPEC_REFS map (which stays the source of truth for
 * the hand-written formats) but consulted by getSpecRef/withSpecRef and, through
 * them, by the diagnostic code actions.
 */
const DECLARATIVE_SPEC_REFS = new Map<string, SpecRef>();

export function registerSpecRefs(refs: SpecRef[]): void {
  for (const ref of refs) {
    DECLARATIVE_SPEC_REFS.set(ref.code, ref);
  }
}

/**
 * Attach spec reference to a diagnostic. Returns the diagnostic for chaining.
 */
export function withSpecRef(diagnostic: Diagnostic, ruleCode: string): Diagnostic {
  diagnostic.code = ruleCode;
  const ref = getSpecRef(ruleCode);
  if (ref) {
    diagnostic.codeDescription = { href: ref.href };
  }
  return diagnostic;
}

export function getSpecRef(ruleCode: string): SpecRef | undefined {
  return SPEC_REFS.get(ruleCode) ?? DECLARATIVE_SPEC_REFS.get(ruleCode);
}

export function ruleAnchor(ruleCode: string): string {
  return ruleCode.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function biofmtRuleHref(ruleCode: string): string {
  return `https://zhemingfan.github.io/BioFmt/rules.html#${ruleAnchor(ruleCode)}`;
}

export function formatRuleDetails(ruleCode: string): string | undefined {
  const ref = getSpecRef(ruleCode);
  if (!ref) return undefined;

  const parts = [
    `${ref.code}: ${ref.summary}`,
    ref.details,
    ref.example ? `Example: ${ref.example}` : undefined,
    `Spec: ${ref.href}`,
    `BioFmt docs: ${biofmtRuleHref(ruleCode)}`,
  ].filter((part): part is string => Boolean(part));

  return parts.join('\n');
}
