// SPDX-License-Identifier: GPL-3.0-or-later

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export interface DocumentMetadata {
  lineCount: number;
  languageId: string;
  fileName: string;
  headerInfo?: VcfHeaderInfo;
}

export interface VcfHeaderInfo {
  fileformat?: string;
  infoFields: InfoDefinition[];
  formatFields: FormatDefinition[];
  filterFields: FilterDefinition[];
  samples: string[];
  headerEndLine: number;
}

export interface InfoDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
}

export interface FormatDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
}

export interface FilterDefinition {
  id: string;
  description: string;
}

// ============================================================================
// VCF FORMAT Field Types
// ============================================================================

/**
 * Parsed genotype value with phasing and allele information
 */
export interface ParsedGenotype {
  isPhased: boolean;
  alleles: (number | null)[];  // Allele indices (0=REF, 1+=ALT), null for missing
  ploidy: number;
  hasMissing: boolean;
  raw: string;
}

/**
 * Parsed allelic depth array
 */
export interface ParsedAD {
  values: (number | null)[];  // [REF, ALT1, ALT2, ...]
  refDepth: number | null;
  altDepths: (number | null)[];
  total: number;
  raw: string;
}

/**
 * Parsed phred-scaled likelihoods array
 */
export interface ParsedPL {
  values: (number | null)[];
  minPL: number | null;
  minPLIndex: number | null;
  firstThree: (number | null)[] | null;  // For biallelic diploid: [0/0, 0/1, 1/1]
  raw: string;
}

/**
 * Parsed phase set value
 */
export interface ParsedPS {
  value: number | null;
  raw: string;
}

/**
 * Parsed sample filter value
 */
export interface ParsedFT {
  isPassing: boolean;
  filters: string[];
  raw: string;
}

/**
 * Union of all typed FORMAT values
 */
export type TypedFormatValue =
  | { type: 'GT'; value: ParsedGenotype }
  | { type: 'GQ'; value: number | null; raw: string }
  | { type: 'DP'; value: number | null; raw: string }
  | { type: 'AD'; value: ParsedAD }
  | { type: 'PL'; value: ParsedPL }
  | { type: 'PS'; value: ParsedPS }
  | { type: 'FT'; value: ParsedFT }
  | { type: 'generic'; value: string | number | (string | number | null)[] | null; raw: string };

/**
 * Summary information for display
 */
export interface FormatSummary {
  label: string;
  value: string;
  tooltip?: string;
}

/**
 * Context for FORMAT parsing - provides REF/ALT information
 */
export interface FormatRecordContext {
  ref: string;
  alts: string[];
  nAlleles: number;  // REF + number of ALTs
  formatKeys: string[];
  sampleName: string;
}

/**
 * Typed sample data with parsed FORMAT values
 */
export interface TypedSampleData {
  raw: Record<string, string>;
  typed: Record<string, TypedFormatValue>;
}

// ============================================================================
// Existing Types (Updated)
// ============================================================================

export interface ParsedVcfRow {
  lineNumber: number;
  chrom: string;
  pos: number;
  id: string;
  ref: string;
  alt: string;
  qual: number | null;
  filter: string;
  info: Record<string, string | boolean>;
  format?: string;
  samples?: Record<string, Record<string, string>>;
  typedSamples?: Record<string, TypedSampleData>;
  raw: string;
}

export interface FilterConfig {
  chrom?: string;
  id?: string;
  filter?: string;
}

export type MessageFromExtension =
  | { command: 'metadata'; lineCount: number; languageId: string; fileName: string; headerInfo?: VcfHeaderInfo }
  | { command: 'rowData'; rows: string[]; startLine: number }
  | { command: 'headerInfo'; headerInfo: VcfHeaderInfo };

export type MessageToExtension =
  | { command: 'getMetadata' }
  | { command: 'requestRows'; startLine: number; endLine: number }
  | { command: 'requestHeader' };
