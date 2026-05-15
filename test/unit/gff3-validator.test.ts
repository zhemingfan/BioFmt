// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { validateGff3 } from '../../server/src/validators/gff3';
import { defaultSettings, type BioFmtSettings, type ValidatorContext } from '../../server/src/validators/types';

function validate(text: string, level: BioFmtSettings['validation']['level'] = 'strict') {
  const lines = text.split('\n');
  const settings: BioFmtSettings = {
    ...defaultSettings,
    validation: {
      level,
      maxDiagnostics: 2000,
    },
  };
  const context: ValidatorContext = {
    uri: 'file:///test.gff3',
    lineCount: lines.length,
    headerEndLine: 0,
    bufferLines: lines.length + 10,
  };
  return validateGff3(text, settings, context);
}

function codesFor(text: string, level: BioFmtSettings['validation']['level'] = 'strict'): string[] {
  return validate(text, level).map(diagnostic => String(diagnostic.code));
}

function assertHasCode(text: string, code: string, level: BioFmtSettings['validation']['level'] = 'strict') {
  const codes = codesFor(text, level);
  assert.ok(codes.includes(code), `Expected ${code}, got ${codes.join(', ') || 'no diagnostics'}`);
}

function assertNoCode(text: string, code: string, level: BioFmtSettings['validation']['level'] = 'strict') {
  const codes = codesFor(text, level);
  assert.ok(!codes.includes(code), `Did not expect ${code}, got ${codes.join(', ')}`);
}

describe('GFF3 Validator', () => {
  it('accepts a valid minimal GFF3 document', () => {
    const diagnostics = validate([
      '##gff-version 3',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1',
    ].join('\n'));

    assert.deepStrictEqual(diagnostics, []);
  });

  it('enforces gff-version as the first non-empty line and only once', () => {
    const text = [
      '# comment before version',
      '##gff-version 3',
      '##gff-version 3.1.26',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1',
    ].join('\n');

    const codes = codesFor(text);
    assert.ok(codes.includes('GFF3_VERSION_NOT_FIRST'), `Expected version-not-first, got ${codes.join(', ')}`);
    assert.ok(codes.includes('GFF3_DUPLICATE_VERSION'), `Expected duplicate version, got ${codes.join(', ')}`);
  });

  it('requires exactly nine tab-delimited feature fields', () => {
    assertHasCode('##gff-version 3\nchr1 source gene 1 10 . + . ID=gene1', 'GFF3_FIELD_COUNT');
    assertHasCode('##gff-version 3\nchr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1\textra', 'GFF3_FIELD_COUNT');
  });

  it('validates feature columns according to GFF3 syntax', () => {
    const text = [
      '##gff-version 3',
      'chr 1\tsource\tCDS\t0\tabc\tbad\tinvalid\t.\tID=cds1',
      'chr1\tsource\tgene\t20\t10\t.\t+\t1\tID=gene1',
      'chr%GZ\tsource\tgene\t1\t10\t.\t+\t.\tID=gene2',
    ].join('\n');

    const codes = codesFor(text);
    for (const code of [
      'GFF3_INVALID_SEQID',
      'GFF3_INVALID_START',
      'GFF3_INVALID_END',
      'GFF3_INVALID_SCORE',
      'GFF3_INVALID_STRAND',
      'GFF3_CDS_PHASE_REQUIRED',
      'GFF3_START_GT_END',
      'GFF3_INVALID_PHASE',
      'GFF3_INVALID_PERCENT_ESCAPE',
    ]) {
      assert.ok(codes.includes(code), `Expected ${code}, got ${codes.join(', ')}`);
    }
  });

  it('validates attribute grammar and reserved attribute formats', () => {
    const text = [
      '##gff-version 3',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\t=bad',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tNameOnly',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=a,b',
      'chr1\tsource\tmatch\t1\t10\t.\t+\t.\tID=match1;Target=target 0 10 +',
      'chr1\tsource\tmatch\t1\t10\t.\t+\t.\tID=match2;Gap=M8 Z3',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1;Dbxref=NoColon',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene2;Ontology_term=GO',
      'chr1\tsource\tregion\t1\t10\t.\t+\t.\tID=chr1;Is_circular=yes',
    ].join('\n');

    const codes = codesFor(text, 'basic');
    for (const code of [
      'GFF3_EMPTY_ATTRIBUTE_TAG',
      'GFF3_MISSING_ATTRIBUTE_EQUALS',
      'GFF3_INVALID_MULTIVALUE_ATTRIBUTE',
      'GFF3_INVALID_TARGET',
      'GFF3_INVALID_GAP',
      'GFF3_INVALID_DBXREF',
      'GFF3_INVALID_ONTOLOGY_TERM',
      'GFF3_INVALID_IS_CIRCULAR',
    ]) {
      assert.ok(codes.includes(code), `Expected ${code}, got ${codes.join(', ')}`);
    }
  });

  it('allows forward Parent references but reports unresolved Parent and Derives_from references at EOF', () => {
    const validForward = [
      '##gff-version 3',
      'chr1\tsource\tmRNA\t1\t10\t.\t+\t.\tID=tx1;Parent=gene1',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1',
    ].join('\n');
    assertNoCode(validForward, 'GFF3_UNRESOLVED_PARENT');

    const invalid = [
      '##gff-version 3',
      'chr1\tsource\tmRNA\t1\t10\t.\t+\t.\tID=tx1;Parent=missing',
      'chr1\tsource\tmRNA\t1\t10\t.\t+\t.\tID=tx2;Derives_from=missing_derivation',
    ].join('\n');
    assertHasCode(invalid, 'GFF3_UNRESOLVED_PARENT');
    assertHasCode(invalid, 'GFF3_UNRESOLVED_DERIVES_FROM');
  });

  it('allows repeated IDs for discontinuous features but flags inconsistent repeated-ID type and cycles', () => {
    const validDiscontinuous = [
      '##gff-version 3',
      'chr1\tsource\tCDS\t1\t10\t.\t+\t0\tID=cds1;Parent=tx1',
      'chr1\tsource\tCDS\t20\t30\t.\t+\t2\tID=cds1;Parent=tx1',
      'chr1\tsource\tmRNA\t1\t30\t.\t+\t.\tID=tx1',
    ].join('\n');
    assertNoCode(validDiscontinuous, 'GFF3_DUPLICATE_ID_CONFLICT');

    const invalid = [
      '##gff-version 3',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=a;Parent=b',
      'chr1\tsource\tmRNA\t1\t10\t.\t+\t.\tID=a',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=b;Parent=a',
    ].join('\n');

    assertHasCode(invalid, 'GFF3_DUPLICATE_ID_CONFLICT');
    assertHasCode(invalid, 'GFF3_PARENT_CYCLE');
  });

  it('validates sequence-region directives and circular coordinate exceptions', () => {
    const outOfBounds = [
      '##gff-version 3',
      '##sequence-region chr1 1 100',
      '##sequence-region chr1 1 100',
      'chr1\tsource\tgene\t90\t120\t.\t+\t.\tID=gene1',
    ].join('\n');
    assertHasCode(outOfBounds, 'GFF3_DUPLICATE_SEQUENCE_REGION');
    assertHasCode(outOfBounds, 'GFF3_OUT_OF_BOUNDS');

    const circular = [
      '##gff-version 3',
      '##sequence-region chr1 1 100',
      'chr1\tsource\tregion\t1\t100\t.\t+\t.\tID=chr1;Is_circular=true',
      'chr1\tsource\tgene\t90\t120\t.\t+\t.\tID=gene1',
    ].join('\n');
    assertNoCode(circular, 'GFF3_OUT_OF_BOUNDS');
  });

  it('validates FASTA sections after ##FASTA or implied FASTA start', () => {
    assertHasCode('##gff-version 3\n##FASTA\nATGC', 'GFF3_FASTA_BEFORE_HEADER');
    assertHasCode([
      '##gff-version 3',
      '##FASTA',
      '>chr1',
      'ATGC',
      'chr1\tsource\tgene\t1\t10\t.\t+\t.\tID=gene1',
    ].join('\n'), 'GFF3_ANNOTATION_AFTER_FASTA');

    const implied = validate('##gff-version 3\n>chr1\nATGC');
    assert.ok(implied.every(diagnostic => diagnostic.severity !== DiagnosticSeverity.Error), `Expected no implied FASTA errors, got ${implied.map(d => d.code).join(', ')}`);
  });
});
