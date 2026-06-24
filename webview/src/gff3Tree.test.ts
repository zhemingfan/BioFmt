// SPDX-License-Identifier: GPL-3.0-or-later

import { buildGff3Tree, flattenVisibleNodes } from './gff3Tree';

const GFF = [
  '##gff-version 3',
  'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=gene1;Name=BRCA',
  'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=mrna1;Parent=gene1',
  'chr1\tsrc\texon\t1\t50\t.\t+\t.\tID=exon1;Parent=mrna1',
  'chr1\tsrc\texon\t60\t100\t.\t+\t.\tID=exon2;Parent=mrna1',
  'chr1\tsrc\tCDS\t1\t50\t.\t+\t0\tID=cds1;Parent=mrna1',
];

describe('buildGff3Tree', () => {
  it('nests features under their parent', () => {
    const roots = buildGff3Tree(GFF);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('gene1');
    expect(roots[0].type).toBe('gene');
    expect(roots[0].name).toBe('BRCA');
    expect(roots[0].children.map((c) => c.id)).toEqual(['mrna1']);
    expect(roots[0].children[0].children.map((c) => c.id)).toEqual(['exon1', 'exon2', 'cds1']);
  });

  it('parses coordinates and strand', () => {
    const gene = buildGff3Tree(GFF)[0];
    expect(gene.seqid).toBe('chr1');
    expect(gene.start).toBe(1);
    expect(gene.end).toBe(100);
    expect(gene.strand).toBe('+');
    expect(gene.line).toBe(1);
  });

  it('treats a feature with an unresolvable Parent as a root', () => {
    const roots = buildGff3Tree([
      '##gff-version 3',
      'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=orphan;Parent=ghost',
    ]);
    expect(roots.map((r) => r.id)).toEqual(['orphan']);
  });

  it('keeps both lines of a multi-exon shared ID under the same parent', () => {
    const roots = buildGff3Tree([
      '##gff-version 3',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=g',
      'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=m;Parent=g',
      'chr1\tsrc\tCDS\t1\t50\t.\t+\t0\tID=c;Parent=m',
      'chr1\tsrc\tCDS\t60\t100\t.\t+\t0\tID=c;Parent=m',
    ]);
    const mrna = roots[0].children[0];
    expect(mrna.children).toHaveLength(2);
    expect(mrna.children.every((c) => c.type === 'CDS')).toBe(true);
  });

  it('attaches a multi-parent feature under its first resolvable parent', () => {
    const roots = buildGff3Tree([
      '##gff-version 3',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=a',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=b',
      'chr1\tsrc\tmRNA\t1\t100\t.\t+\t.\tID=t;Parent=a,b',
    ]);
    expect(roots.map((r) => r.id)).toEqual(['a', 'b']);
    expect(roots[0].children.map((c) => c.id)).toEqual(['t']);
    expect(roots[1].children).toHaveLength(0);
  });

  it('skips comments, directives, blank lines, and FASTA', () => {
    const roots = buildGff3Tree([
      '##gff-version 3',
      '',
      '# a comment',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=g',
      '##FASTA',
      '>g',
      'ACGTACGT',
    ]);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('g');
  });

  it('does not loop on a parent cycle', () => {
    const roots = buildGff3Tree([
      '##gff-version 3',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=A;Parent=B',
      'chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=B;Parent=A',
    ]);
    // Exactly one of the two becomes the root; the structure stays finite.
    const flat = flattenVisibleNodes(roots, new Set());
    expect(flat).toHaveLength(2);
  });
});

describe('flattenVisibleNodes', () => {
  it('flattens the full tree with depth when nothing is collapsed', () => {
    const flat = flattenVisibleNodes(buildGff3Tree(GFF), new Set());
    expect(flat.map((f) => f.node.id)).toEqual(['gene1', 'mrna1', 'exon1', 'exon2', 'cds1']);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 2, 2]);
  });

  it('hides the subtree of a collapsed node', () => {
    const roots = buildGff3Tree(GFF);
    const mrnaLine = roots[0].children[0].line;
    const flat = flattenVisibleNodes(roots, new Set([mrnaLine]));
    expect(flat.map((f) => f.node.id)).toEqual(['gene1', 'mrna1']);
  });

  it('hides everything under a collapsed root', () => {
    const roots = buildGff3Tree(GFF);
    const flat = flattenVisibleNodes(roots, new Set([roots[0].line]));
    expect(flat.map((f) => f.node.id)).toEqual(['gene1']);
  });
});
