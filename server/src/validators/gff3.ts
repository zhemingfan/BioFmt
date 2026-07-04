// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  DefinitionParams,
  Location,
  ReferenceParams,
  RenameParams,
  PrepareRenameParams,
  WorkspaceEdit,
  TextEdit,
  Range,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { withSpecRef } from '../specRefs';
import type { BioFmtSettings, ValidatorContext } from './types';

interface ParsedAttributes {
  values: Map<string, string[]>;
  raw: string;
  startColumn: number;
}

interface FeatureRecord {
  line: number;
  lineText: string;
  seqid: string;
  featureType: string;
  start: number;
  end: number;
  strand: string;
  attributes: ParsedAttributes;
}

interface SequenceRegion {
  seqid: string;
  start: number;
  end: number;
  line: number;
}

interface ReferenceUse {
  targetId: string;
  sourceId?: string;
  line: number;
  lineText: string;
  startColumn: number;
  length: number;
  code: string;
}

const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;
const SCORE_RE = /^(\.|[+-]?((\d+(\.\d*)?)|(\.\d+))([eE][+-]?\d+)?)$/;
const GFF3_VERSION_RE = /^##gff-version\s+3(\.\d+){0,2}$/;
const TARGET_RE = /^([^\s]+)\s+([1-9][0-9]*)\s+([1-9][0-9]*)(\s+[+-])?$/;
const GAP_RE = /^[MIDFR][1-9][0-9]*( [MIDFR][1-9][0-9]*)*$/;
const VALID_STRANDS = new Set(['+', '-', '.', '?']);
const VALID_PHASES = new Set(['0', '1', '2', '.']);
const CDS_PHASES = new Set(['0', '1', '2']);
const MULTIVALUE_ATTRIBUTES = new Set(['Parent', 'Alias', 'Note', 'Dbxref', 'Ontology_term']);
export const RESERVED_ATTRIBUTES = new Set([
  'ID',
  'Name',
  'Alias',
  'Parent',
  'Target',
  'Gap',
  'Derives_from',
  'Note',
  'Dbxref',
  'Ontology_term',
  'Is_circular',
]);
const SEQID_CHARS = /^[A-Za-z0-9.:^*$@!+_?\-|]$/;

export function validateGff3(
  text: string,
  settings: BioFmtSettings,
  _context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  let seenVersion = false;
  let reportedVersionNotFirst = false;
  let inFasta = false;
  let fastaHasHeader = false;

  const features: FeatureRecord[] = [];
  const featuresById = new Map<string, FeatureRecord[]>();
  const parentReferences: ReferenceUse[] = [];
  const derivesFromReferences: ReferenceUse[] = [];
  const reportedReferences = new Set<ReferenceUse>();
  const parentGraph = new Map<string, Set<string>>();
  const sequenceRegions = new Map<string, SequenceRegion>();
  const circularSeqids = new Set<string>();

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    if (diagnostics.length >= settings.validation.maxDiagnostics) break;

    const line = lines[lineNo];
    const trimmed = line.trim();
    if (trimmed === '') continue;

    if (!seenVersion && !line.startsWith('##gff-version') && !reportedVersionNotFirst) {
      addDiagnostic(diagnostics, settings, 'GFF3_VERSION_NOT_FIRST', lineNo, line, '##gff-version must be the first non-empty line');
      reportedVersionNotFirst = true;
    }

    if (inFasta) {
      validateFastaLine(line, lineNo, fastaHasHeader, diagnostics, settings);
      if (line.startsWith('>')) fastaHasHeader = true;
      continue;
    }

    if (line.startsWith('##FASTA')) {
      inFasta = true;
      fastaHasHeader = false;
      continue;
    }

    if (line.startsWith('>')) {
      inFasta = true;
      fastaHasHeader = true;
      continue;
    }

    if (line === '###') {
      resolveReferences(parentReferences, featuresById, reportedReferences, diagnostics, settings);
      resolveReferences(derivesFromReferences, featuresById, reportedReferences, diagnostics, settings);
      continue;
    }

    if (line.startsWith('##')) {
      parseDirective(line, lineNo, sequenceRegions, diagnostics, settings);
      if (line.startsWith('##gff-version')) {
        if (seenVersion) {
          addDiagnostic(diagnostics, settings, 'GFF3_DUPLICATE_VERSION', lineNo, line, '##gff-version may only appear once');
        }
        seenVersion = true;
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    if (line.includes('#')) {
      addDiagnostic(diagnostics, settings, 'GFF3_INLINE_COMMENT', lineNo, line, 'End-of-line comments are not valid in GFF3 feature lines');
    }

    const feature = parseFeatureLine(line, lineNo, diagnostics, settings);
    if (!feature) continue;

    features.push(feature);
    indexFeature(feature, featuresById, parentGraph, parentReferences, derivesFromReferences, circularSeqids, diagnostics, settings);
  }

  if (!seenVersion) {
    addDiagnostic(diagnostics, settings, 'GFF3_MISSING_VERSION', 0, lines[0] ?? '', 'GFF3 file must contain ##gff-version as the first non-empty line');
  }

  if (settings.validation.level === 'strict') {
    resolveReferences(parentReferences, featuresById, reportedReferences, diagnostics, settings);
    resolveReferences(derivesFromReferences, featuresById, reportedReferences, diagnostics, settings);
    validateParentCycles(parentGraph, featuresById, diagnostics, settings);
    validateSequenceRegionBounds(features, sequenceRegions, circularSeqids, diagnostics, settings);
  }

  return diagnostics;
}

function parseDirective(
  line: string,
  lineNo: number,
  sequenceRegions: Map<string, SequenceRegion>,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  if (line.startsWith('##gff-version')) {
    if (!GFF3_VERSION_RE.test(line)) {
      addDiagnostic(diagnostics, settings, 'GFF3_MALFORMED_DIRECTIVE', lineNo, line, 'Malformed ##gff-version directive');
    }
    return;
  }

  if (!line.startsWith('##sequence-region')) return;

  const parts = line.trim().split(/\s+/);
  if (parts.length !== 4) {
    addDiagnostic(diagnostics, settings, 'GFF3_MALFORMED_DIRECTIVE', lineNo, line, '##sequence-region must contain seqid, start, and end');
    return;
  }

  const [, seqid, startRaw, endRaw] = parts;
  if (sequenceRegions.has(seqid)) {
    addDiagnostic(diagnostics, settings, 'GFF3_DUPLICATE_SEQUENCE_REGION', lineNo, line, `Duplicate ##sequence-region for "${seqid}"`);
    return;
  }

  if (!POSITIVE_INTEGER_RE.test(startRaw) || !POSITIVE_INTEGER_RE.test(endRaw)) {
    addDiagnostic(diagnostics, settings, 'GFF3_MALFORMED_DIRECTIVE', lineNo, line, '##sequence-region coordinates must be positive integers');
    return;
  }

  const start = Number(startRaw);
  const end = Number(endRaw);
  if (start > end) {
    addDiagnostic(diagnostics, settings, 'GFF3_MALFORMED_DIRECTIVE', lineNo, line, '##sequence-region start must be <= end');
    return;
  }

  sequenceRegions.set(seqid, { seqid, start, end, line: lineNo });
}

function parseFeatureLine(
  line: string,
  lineNo: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): FeatureRecord | null {
  const columns = line.split('\t');
  if (columns.length !== 9) {
    addDiagnostic(diagnostics, settings, 'GFF3_FIELD_COUNT', lineNo, line, `Feature line must contain exactly 9 tab-separated fields, found ${columns.length}`);
    return null;
  }

  const [seqid, source, featureType, startRaw, endRaw, score, strand, phase, attrsRaw] = columns;

  validateSeqid(seqid, line, lineNo, 0, diagnostics, settings);
  validatePercentEncoding(source, line, lineNo, columnOffset(columns, 1), diagnostics, settings);
  validateFeatureType(featureType, line, lineNo, columnOffset(columns, 2), diagnostics, settings);

  const start = parsePositiveInteger(startRaw, 'GFF3_INVALID_START', line, lineNo, columnOffset(columns, 3), diagnostics, settings);
  const end = parsePositiveInteger(endRaw, 'GFF3_INVALID_END', line, lineNo, columnOffset(columns, 4), diagnostics, settings);
  if (start !== null && end !== null && start > end) {
    addDiagnostic(diagnostics, settings, 'GFF3_START_GT_END', lineNo, line, 'Start position cannot be greater than end position', DiagnosticSeverity.Error, columnOffset(columns, 3), columnOffset(columns, 5) - 1);
  }

  const scoreStart = columnOffset(columns, 5);
  if (!SCORE_RE.test(score)) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_SCORE', lineNo, line, `Score must be "." or a floating-point number, found "${score}"`, DiagnosticSeverity.Error, scoreStart, scoreStart + score.length);
  }

  const strandStart = columnOffset(columns, 6);
  if (!VALID_STRANDS.has(strand)) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_STRAND', lineNo, line, `Invalid strand "${strand}" (expected +, -, ., or ?)`, DiagnosticSeverity.Error, strandStart, strandStart + strand.length);
  }

  const phaseStart = columnOffset(columns, 7);
  if (!VALID_PHASES.has(phase)) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_PHASE', lineNo, line, `Invalid phase "${phase}" (expected 0, 1, 2, or .)`, DiagnosticSeverity.Error, phaseStart, phaseStart + phase.length);
  } else if (featureType === 'CDS' && !CDS_PHASES.has(phase)) {
    addDiagnostic(diagnostics, settings, 'GFF3_CDS_PHASE_REQUIRED', lineNo, line, 'CDS features require phase 0, 1, or 2', DiagnosticSeverity.Error, phaseStart, phaseStart + phase.length);
  } else if (settings.validation.level === 'strict' && featureType !== 'CDS' && phase !== '.') {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_PHASE', lineNo, line, 'Non-CDS features should use "." for phase', DiagnosticSeverity.Warning, phaseStart, phaseStart + phase.length);
  }

  const attrsStart = columnOffset(columns, 8);
  const attributes = parseAttributes(attrsRaw, line, lineNo, attrsStart, diagnostics, settings);

  if (start === null || end === null) return null;

  return {
    line: lineNo,
    lineText: line,
    seqid,
    featureType,
    start,
    end,
    strand,
    attributes,
  };
}

function validateSeqid(
  value: string,
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  validatePercentEncoding(value, line, lineNo, startColumn, diagnostics, settings);

  let invalid = value.length === 0 || value === '.' || value.startsWith('>') || /\s/.test(value);
  for (let i = 0; i < value.length && !invalid; i++) {
    if (value[i] === '%' && isPercentEscape(value, i)) {
      i += 2;
      continue;
    }
    if (!SEQID_CHARS.test(value[i])) invalid = true;
  }

  if (invalid) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_SEQID', lineNo, line, `Invalid seqid "${value}"`, DiagnosticSeverity.Error, startColumn, startColumn + value.length);
  }
}

function validateFeatureType(
  value: string,
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  validatePercentEncoding(value, line, lineNo, startColumn, diagnostics, settings);
  if (value.length === 0) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_TYPE', lineNo, line, 'Feature type must not be empty', DiagnosticSeverity.Error, startColumn, startColumn + value.length);
  }
}

function parsePositiveInteger(
  value: string,
  code: string,
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): number | null {
  if (!POSITIVE_INTEGER_RE.test(value)) {
    addDiagnostic(diagnostics, settings, code, lineNo, line, `Coordinate must be a positive 1-based integer, found "${value}"`, DiagnosticSeverity.Error, startColumn, startColumn + value.length);
    return null;
  }
  return Number(value);
}

function parseAttributes(
  raw: string,
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): ParsedAttributes {
  const values = new Map<string, string[]>();
  const parsed: ParsedAttributes = { values, raw, startColumn };

  if (raw === '.') return parsed;
  if (raw.length === 0) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_ATTRIBUTES', lineNo, line, 'Attributes field must be "." or tag=value pairs', DiagnosticSeverity.Error, startColumn, startColumn);
    return parsed;
  }

  validatePercentEncoding(raw, line, lineNo, startColumn, diagnostics, settings);

  const normalized = raw.endsWith(';') ? raw.slice(0, -1) : raw;
  const parts = normalized.split(';');
  for (const part of parts) {
    const partStart = startColumn + raw.indexOf(part);
    if (part.length === 0) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_ATTRIBUTES', lineNo, line, 'Empty attributes are not allowed except for one trailing semicolon', DiagnosticSeverity.Error, partStart, partStart + part.length);
      continue;
    }

    const eqIndex = part.indexOf('=');
    if (eqIndex < 0) {
      addDiagnostic(diagnostics, settings, 'GFF3_MISSING_ATTRIBUTE_EQUALS', lineNo, line, `Attribute "${part}" must use tag=value format`, DiagnosticSeverity.Error, partStart, partStart + part.length);
      continue;
    }
    if (eqIndex === 0) {
      addDiagnostic(diagnostics, settings, 'GFF3_EMPTY_ATTRIBUTE_TAG', lineNo, line, 'Attribute tag must not be empty', DiagnosticSeverity.Error, partStart, partStart + part.length);
      continue;
    }

    const tag = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    const valueStart = partStart + eqIndex + 1;

    if (value.length === 0) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_ATTRIBUTES', lineNo, line, `Attribute "${tag}" must not have an empty value`, DiagnosticSeverity.Error, valueStart, valueStart);
      continue;
    }

    if (part.indexOf('=', eqIndex + 1) >= 0) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_ATTRIBUTES', lineNo, line, `Literal "=" in attribute "${tag}" must be percent-encoded`, DiagnosticSeverity.Error, valueStart, valueStart + value.length);
    }

    const splitValues = value.split(',');
    // Comma is the GFF3 multi-value separator; it is only disallowed on reserved
    // single-value attributes (e.g. ID, Target). Custom attributes such as
    // `tag` (used by GENCODE/Ensembl: tag=basic,Ensembl_canonical,...) may be
    // comma-separated, so only flag reserved-but-not-multivalue attributes.
    if (splitValues.length > 1 && RESERVED_ATTRIBUTES.has(tag) && !MULTIVALUE_ATTRIBUTES.has(tag)) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_MULTIVALUE_ATTRIBUTE', lineNo, line, `Attribute "${tag}" does not allow comma-separated values`, DiagnosticSeverity.Error, valueStart, valueStart + value.length);
    }

    if (/^[A-Z]/.test(tag) && !RESERVED_ATTRIBUTES.has(tag)) {
      addDiagnostic(diagnostics, settings, 'GFF3_UNKNOWN_RESERVED_ATTRIBUTE', lineNo, line, `Unknown uppercase attribute "${tag}" is reserved by GFF3`, DiagnosticSeverity.Warning, partStart, partStart + tag.length);
    }

    values.set(tag, splitValues);
    validateReservedAttribute(tag, splitValues, line, lineNo, valueStart, diagnostics, settings);
  }

  return parsed;
}

function validateReservedAttribute(
  tag: string,
  values: string[],
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  if (tag === 'Target') {
    if (values.length !== 1 || !TARGET_RE.test(values[0])) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_TARGET', lineNo, line, 'Target must be: target_id start end [strand]', DiagnosticSeverity.Error, startColumn, startColumn + values.join(',').length);
    }
    return;
  }

  if (tag === 'Gap') {
    if (values.length !== 1 || !GAP_RE.test(values[0])) {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_GAP', lineNo, line, 'Gap must contain M/I/D/F/R operation-length pairs', DiagnosticSeverity.Error, startColumn, startColumn + values.join(',').length);
    }
    return;
  }

  if (tag === 'Dbxref') {
    for (const value of values) {
      if (!hasDbtag(value)) {
        addDiagnostic(diagnostics, settings, 'GFF3_INVALID_DBXREF', lineNo, line, 'Dbxref values must use DBTAG:ID format', DiagnosticSeverity.Warning, startColumn, startColumn + value.length);
      }
    }
    return;
  }

  if (tag === 'Ontology_term') {
    for (const value of values) {
      if (!hasDbtag(value)) {
        addDiagnostic(diagnostics, settings, 'GFF3_INVALID_ONTOLOGY_TERM', lineNo, line, 'Ontology_term values must use DBTAG:ID format', DiagnosticSeverity.Warning, startColumn, startColumn + value.length);
      }
    }
    return;
  }

  if (tag === 'Is_circular' && (values.length !== 1 || values[0] !== 'true')) {
    addDiagnostic(diagnostics, settings, 'GFF3_INVALID_IS_CIRCULAR', lineNo, line, 'Is_circular is expected to be true when present', DiagnosticSeverity.Warning, startColumn, startColumn + values.join(',').length);
  }
}

function indexFeature(
  feature: FeatureRecord,
  featuresById: Map<string, FeatureRecord[]>,
  parentGraph: Map<string, Set<string>>,
  parentReferences: ReferenceUse[],
  derivesFromReferences: ReferenceUse[],
  circularSeqids: Set<string>,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  const ids = feature.attributes.values.get('ID') ?? [];
  const id = ids[0];

  if (id) {
    const existing = featuresById.get(id) ?? [];
    if (settings.validation.level === 'strict' && existing.some(record => record.featureType !== feature.featureType)) {
      addDiagnostic(diagnostics, settings, 'GFF3_DUPLICATE_ID_CONFLICT', feature.line, feature.lineText, `Repeated ID "${id}" has inconsistent feature types`, DiagnosticSeverity.Error, feature.attributes.startColumn, feature.attributes.startColumn + feature.attributes.raw.length);
    }
    existing.push(feature);
    featuresById.set(id, existing);
  }

  if (feature.attributes.values.get('Is_circular')?.includes('true')) {
    circularSeqids.add(feature.seqid);
  }

  if (settings.validation.level !== 'strict') return;

  for (const parentId of feature.attributes.values.get('Parent') ?? []) {
    parentReferences.push({
      targetId: parentId,
      sourceId: id,
      line: feature.line,
      lineText: feature.lineText,
      startColumn: feature.attributes.startColumn,
      length: feature.attributes.raw.length,
      code: 'GFF3_UNRESOLVED_PARENT',
    });
    if (id) {
      if (!parentGraph.has(parentId)) parentGraph.set(parentId, new Set());
      parentGraph.get(parentId)?.add(id);
    }
  }

  for (const targetId of feature.attributes.values.get('Derives_from') ?? []) {
    derivesFromReferences.push({
      targetId,
      sourceId: id,
      line: feature.line,
      lineText: feature.lineText,
      startColumn: feature.attributes.startColumn,
      length: feature.attributes.raw.length,
      code: 'GFF3_UNRESOLVED_DERIVES_FROM',
    });
  }
}

function resolveReferences(
  references: ReferenceUse[],
  featuresById: Map<string, FeatureRecord[]>,
  reportedReferences: Set<ReferenceUse>,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  for (const ref of references) {
    if (reportedReferences.has(ref) || featuresById.has(ref.targetId)) continue;
    const message = ref.code === 'GFF3_UNRESOLVED_PARENT'
      ? `Parent "${ref.targetId}" references non-existent ID`
      : `Derives_from "${ref.targetId}" references non-existent ID`;
    addDiagnostic(diagnostics, settings, ref.code, ref.line, ref.lineText, message, DiagnosticSeverity.Error, ref.startColumn, ref.startColumn + ref.length);
    reportedReferences.add(ref);
  }
}

function validateParentCycles(
  parentGraph: Map<string, Set<string>>,
  featuresById: Map<string, FeatureRecord[]>,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  let reported = false;

  const visit = (id: string): void => {
    if (reported || visited.has(id)) return;
    if (visiting.has(id)) {
      const record = featuresById.get(id)?.[0];
      addDiagnostic(diagnostics, settings, 'GFF3_PARENT_CYCLE', record?.line ?? 0, record?.lineText ?? '', `Parent graph contains a cycle: ${path.concat(id).join(' -> ')}`);
      reported = true;
      return;
    }
    visiting.add(id);
    path.push(id);
    for (const child of parentGraph.get(id) ?? []) {
      visit(child);
    }
    path.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of parentGraph.keys()) {
    visit(id);
    if (reported) return;
  }
}

function validateSequenceRegionBounds(
  features: FeatureRecord[],
  sequenceRegions: Map<string, SequenceRegion>,
  circularSeqids: Set<string>,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  for (const feature of features) {
    const region = sequenceRegions.get(feature.seqid);
    if (!region) continue;

    const regionLength = region.end - region.start + 1;
    const upperBound = circularSeqids.has(feature.seqid) ? region.end + regionLength : region.end;
    if (feature.start < region.start || feature.end > upperBound) {
      addDiagnostic(diagnostics, settings, 'GFF3_OUT_OF_BOUNDS', feature.line, feature.lineText, `Feature coordinates must be within ##sequence-region ${feature.seqid}:${region.start}-${region.end}`);
    }
  }
}

function validateFastaLine(
  line: string,
  lineNo: number,
  fastaHasHeader: boolean,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  if (line.startsWith('>')) return;

  if (!fastaHasHeader) {
    addDiagnostic(diagnostics, settings, 'GFF3_FASTA_BEFORE_HEADER', lineNo, line, 'FASTA sequence data must follow a FASTA header line');
    return;
  }

  if (line.includes('\t') || line.startsWith('##') || line === '###') {
    addDiagnostic(diagnostics, settings, 'GFF3_ANNOTATION_AFTER_FASTA', lineNo, line, 'GFF3 annotation content is not allowed after FASTA starts');
  }
}

function validatePercentEncoding(
  value: string,
  line: string,
  lineNo: number,
  startColumn: number,
  diagnostics: Diagnostic[],
  settings: BioFmtSettings
): void {
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const codePoint = value.charCodeAt(i);

    if (char === '%') {
      if (!isPercentEscape(value, i)) {
        addDiagnostic(diagnostics, settings, 'GFF3_INVALID_PERCENT_ESCAPE', lineNo, line, 'Percent escapes must be two hexadecimal digits', DiagnosticSeverity.Error, startColumn + i, startColumn + i + 1);
      } else {
        i += 2;
      }
      continue;
    }

    if (char === '\\') {
      addDiagnostic(diagnostics, settings, 'GFF3_INVALID_PERCENT_ESCAPE', lineNo, line, 'Backslash escaping is not valid in GFF3; use percent encoding', DiagnosticSeverity.Error, startColumn + i, startColumn + i + 1);
      continue;
    }

    if (codePoint < 32 || codePoint === 127) {
      addDiagnostic(diagnostics, settings, 'GFF3_ILLEGAL_CONTROL_CHARACTER', lineNo, line, 'Control characters must be percent-encoded in GFF3 fields', DiagnosticSeverity.Error, startColumn + i, startColumn + i + 1);
    }
  }
}

function addDiagnostic(
  diagnostics: Diagnostic[],
  settings: BioFmtSettings,
  code: string,
  line: number,
  lineText: string,
  message: string,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  start = 0,
  end = lineText.length
): void {
  if (diagnostics.length >= settings.validation.maxDiagnostics) return;
  diagnostics.push(withSpecRef({
    severity,
    range: {
      start: { line, character: Math.max(0, start) },
      end: { line, character: Math.max(Math.max(0, start), end) },
    },
    message,
    source: 'biofmt',
  }, code));
}

function columnOffset(columns: string[], index: number): number {
  return columns.slice(0, index).join('\t').length + (index === 0 ? 0 : 1);
}

function hasDbtag(value: string): boolean {
  const colon = value.indexOf(':');
  return colon > 0 && colon < value.length - 1;
}

function isPercentEscape(value: string, index: number): boolean {
  return index + 2 < value.length && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3));
}

// ----- Completion, go-to-definition, references, rename (LSP IntelliSense) -----

const REFERENCE_ATTRIBUTES = new Set(['Parent', 'Derives_from']);
// Attributes whose values are feature IDs participating in the ID graph.
const ID_BEARING_ATTRIBUTES = new Set(['ID', 'Parent', 'Derives_from']);
// Structural characters and whitespace that are not valid in a bare feature ID
// (they would need percent-encoding), so a plain rename must reject them.
// A literal hyphen is intentionally allowed (legal and common in feature IDs).
const INVALID_ID_CHARS = /[;=,&\s]/;

interface Gff3Occurrence {
  line: number;
  startChar: number;
  endChar: number;
  isDeclaration: boolean;
}

interface Gff3Index {
  idToLine: Map<string, number[]>;
  attributeKeys: Set<string>;
  // Every occurrence of each feature ID: ID= declarations plus
  // Parent=/Derives_from= references, with precise column ranges.
  occurrences: Map<string, Gff3Occurrence[]>;
}

const gff3IndexCache = new Map<string, { version: number; index: Gff3Index }>();

export function clearGff3IndexCache(uri: string): void {
  gff3IndexCache.delete(uri);
}

export function getGff3Index(document: TextDocument): Gff3Index {
  const cached = gff3IndexCache.get(document.uri);
  if (cached && cached.version === document.version) return cached.index;
  const index = buildGff3Index(document.getText());
  gff3IndexCache.set(document.uri, { version: document.version, index });
  return index;
}

// Lightweight, non-diagnostic split of a GFF3 attributes column into tag -> values.
// Kept separate from parseAttributes so the index never re-runs validation.
function splitGff3Attributes(raw: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (raw === '.' || raw.length === 0) return out;
  const normalized = raw.endsWith(';') ? raw.slice(0, -1) : raw;
  for (const part of normalized.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out.set(part.slice(0, eq), part.slice(eq + 1).split(','));
  }
  return out;
}

function buildGff3Index(text: string): Gff3Index {
  const idToLine = new Map<string, number[]>();
  const attributeKeys = new Set<string>();
  const occurrences = new Map<string, Gff3Occurrence[]>();
  const lines = text.split(/\r?\n/);

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo];
    // The FASTA section (if present) is sequence data, not features.
    if (line.startsWith('##FASTA') || line.startsWith('>')) break;
    if (line.length === 0 || line.startsWith('#')) continue;

    const columns = line.split('\t');
    if (columns.length !== 9) continue;

    for (const tag of splitGff3Attributes(columns[8]).keys()) {
      attributeKeys.add(tag);
    }

    forEachIdToken(line, (attr, id, startChar, endChar) => {
      const isDeclaration = attr === 'ID';
      const entry: Gff3Occurrence = { line: lineNo, startChar, endChar, isDeclaration };
      const existing = occurrences.get(id);
      if (existing) existing.push(entry);
      else occurrences.set(id, [entry]);

      if (isDeclaration) {
        const lns = idToLine.get(id);
        if (lns) lns.push(lineNo);
        else idToLine.set(id, [lineNo]);
      }
    });
  }

  return { idToLine, attributeKeys, occurrences };
}

function readGff3Line(document: TextDocument, line: number): string {
  return document
    .getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } })
    .replace(/\r?\n$/, '');
}

// Walk the ID-bearing tokens (ID / Parent / Derives_from values) of a single
// feature line, reporting each value token and its absolute [startChar, endChar).
function forEachIdToken(
  lineText: string,
  cb: (attr: string, id: string, startChar: number, endChar: number) => void,
): void {
  const columns = lineText.split('\t');
  if (columns.length !== 9) return;
  const attrStart = columnOffset(columns, 8);
  const attrCol = columns[8];

  let segStart = 0;
  for (;;) {
    let segEnd = attrCol.indexOf(';', segStart);
    if (segEnd < 0) segEnd = attrCol.length;
    const segment = attrCol.slice(segStart, segEnd);
    const eq = segment.indexOf('=');
    const attr = eq > 0 ? segment.slice(0, eq) : '';
    if (eq > 0 && ID_BEARING_ATTRIBUTES.has(attr)) {
      const valuePart = segment.slice(eq + 1);
      const valueStart = segStart + eq + 1;
      let tStart = 0;
      for (;;) {
        let tEnd = valuePart.indexOf(',', tStart);
        if (tEnd < 0) tEnd = valuePart.length;
        if (tEnd > tStart) {
          const absStart = attrStart + valueStart + tStart;
          cb(attr, valuePart.slice(tStart, tEnd), absStart, absStart + (tEnd - tStart));
        }
        if (tEnd >= valuePart.length) break;
        tStart = tEnd + 1;
      }
    }
    if (segEnd >= attrCol.length) break;
    segStart = segEnd + 1;
  }
}

// The ID-bearing token under the cursor on a feature line, if any.
function findIdTokenAt(
  lineText: string,
  character: number,
): { attr: string; id: string; startChar: number; endChar: number } | null {
  let hit: { attr: string; id: string; startChar: number; endChar: number } | null = null;
  forEachIdToken(lineText, (attr, id, startChar, endChar) => {
    if (character >= startChar && character <= endChar) {
      hit = { attr, id, startChar, endChar };
    }
  });
  return hit;
}

// Completion inside the attributes column: reserved tags, or known IDs in Parent/Derives_from values.
export function getGff3Completions(
  document: TextDocument,
  params: CompletionParams,
): CompletionItem[] {
  const position = params.position;
  const lineText = readGff3Line(document, position.line);
  if (lineText.length === 0 || lineText.startsWith('#') || lineText.startsWith('>')) return [];

  const columns = lineText.split('\t');
  if (columns.length !== 9) return [];

  const attrStart = columnOffset(columns, 8);
  const ch = position.character;
  if (ch < attrStart) return [];

  const prefix = lineText.slice(attrStart, ch);
  const segment = prefix.slice(prefix.lastIndexOf(';') + 1);
  const eq = segment.indexOf('=');

  if (eq < 0) {
    // Tag position: offer reserved attribute keys.
    return [...RESERVED_ATTRIBUTES].map((tag) => ({
      label: tag,
      kind: CompletionItemKind.Property,
      insertText: `${tag}=`,
    }));
  }

  if (REFERENCE_ATTRIBUTES.has(segment.slice(0, eq))) {
    // Value position within Parent=/Derives_from=: offer known feature IDs.
    return [...getGff3Index(document).idToLine.keys()].map((id) => ({
      label: id,
      kind: CompletionItemKind.Reference,
    }));
  }

  return [];
}

// Go-to-definition: a Parent/Derives_from value jumps to the feature line(s) declaring that ID.
export function getGff3Definition(
  document: TextDocument,
  params: DefinitionParams,
): Location[] | null {
  const lineText = readGff3Line(document, params.position.line);
  if (lineText.length === 0 || lineText.startsWith('#') || lineText.startsWith('>')) return null;

  const hit = findIdTokenAt(lineText, params.position.character);
  if (!hit || !REFERENCE_ATTRIBUTES.has(hit.attr)) return null;

  const lineNos = getGff3Index(document).idToLine.get(hit.id);
  if (!lineNos || lineNos.length === 0) return null;

  return lineNos.map((ln) => {
    const targetText = readGff3Line(document, ln);
    return {
      uri: document.uri,
      range: {
        start: { line: ln, character: 0 },
        end: { line: ln, character: targetText.length },
      },
    };
  });
}

// Find all references: every occurrence (declaration + references) of the ID under the cursor.
export function getGff3References(
  document: TextDocument,
  params: ReferenceParams,
): Location[] | null {
  const lineText = readGff3Line(document, params.position.line);
  if (lineText.length === 0 || lineText.startsWith('#') || lineText.startsWith('>')) return null;

  const hit = findIdTokenAt(lineText, params.position.character);
  if (!hit) return null;

  const occ = getGff3Index(document).occurrences.get(hit.id);
  if (!occ || occ.length === 0) return null;

  const includeDeclaration = params.context?.includeDeclaration ?? true;
  const selected = includeDeclaration ? occ : occ.filter((o) => !o.isDeclaration);

  return selected.map((o) => locationFor(document, o));
}

// Prepare rename: confirm the cursor is on an identifier and report its span + current name.
export function getGff3PrepareRename(
  document: TextDocument,
  params: PrepareRenameParams,
): { range: Range; placeholder: string } | null {
  const lineText = readGff3Line(document, params.position.line);
  if (lineText.length === 0 || lineText.startsWith('#') || lineText.startsWith('>')) return null;

  const hit = findIdTokenAt(lineText, params.position.character);
  if (!hit) return null;

  return {
    range: {
      start: { line: params.position.line, character: hit.startChar },
      end: { line: params.position.line, character: hit.endChar },
    },
    placeholder: hit.id,
  };
}

// Rename: rewrite the identifier under the cursor at its declaration and every reference.
export function getGff3Rename(
  document: TextDocument,
  params: RenameParams,
): WorkspaceEdit | null {
  const lineText = readGff3Line(document, params.position.line);
  if (lineText.length === 0 || lineText.startsWith('#') || lineText.startsWith('>')) return null;

  const hit = findIdTokenAt(lineText, params.position.character);
  if (!hit) return null;

  if (params.newName.length === 0 || INVALID_ID_CHARS.test(params.newName)) {
    throw new Error(
      `Invalid GFF3 identifier "${params.newName}": must not be empty or contain whitespace, ';', '=', ',' or '&'.`,
    );
  }

  const occ = getGff3Index(document).occurrences.get(hit.id);
  if (!occ || occ.length === 0) return null;

  const edits: TextEdit[] = occ.map((o) => ({
    range: {
      start: { line: o.line, character: o.startChar },
      end: { line: o.line, character: o.endChar },
    },
    newText: params.newName,
  }));

  return { changes: { [document.uri]: edits } };
}

function locationFor(document: TextDocument, occ: Gff3Occurrence): Location {
  return {
    uri: document.uri,
    range: {
      start: { line: occ.line, character: occ.startChar },
      end: { line: occ.line, character: occ.endChar },
    },
  };
}
