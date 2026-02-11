// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Generators for synthetic test data used in performance benchmarks.
 */

/**
 * Generate a synthetic VCF file content with specified dimensions.
 */
export function generateVcfContent(options: {
  headerLines?: number;
  dataLines?: number;
  infoFields?: number;
  formatFields?: number;
  samples?: number;
}): string {
  const {
    headerLines = 100,
    dataLines = 1000,
    infoFields = 20,
    formatFields = 5,
    samples = 4,
  } = options;

  const lines: string[] = [];

  // File format
  lines.push('##fileformat=VCFv4.2');

  // Generate INFO definitions
  for (let i = 0; i < infoFields; i++) {
    lines.push(
      `##INFO=<ID=INFO${i},Number=1,Type=Integer,Description="Test INFO field ${i} with a reasonably long description to simulate real-world headers">`
    );
  }

  // Generate FORMAT definitions
  const formatIds: string[] = [];
  for (let i = 0; i < formatFields; i++) {
    const id = i === 0 ? 'GT' : `FMT${i}`;
    formatIds.push(id);
    lines.push(
      `##FORMAT=<ID=${id},Number=1,Type=${i === 0 ? 'String' : 'Integer'},Description="Test FORMAT field ${id}">`
    );
  }

  // Generate FILTER definitions
  lines.push('##FILTER=<ID=PASS,Description="All filters passed">');
  lines.push('##FILTER=<ID=LowQual,Description="Low quality variant">');

  // Pad header to reach target line count
  const currentHeaderLines = lines.length;
  for (let i = currentHeaderLines; i < headerLines - 1; i++) {
    lines.push(`##comment_${i}=padding line to reach target header size`);
  }

  // Column header
  const sampleNames = Array.from({ length: samples }, (_, i) => `Sample${i + 1}`);
  lines.push(`#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t${sampleNames.join('\t')}`);

  // Generate data lines
  const bases = ['A', 'C', 'G', 'T'];
  const formatString = formatIds.join(':');

  for (let i = 0; i < dataLines; i++) {
    const chrom = `chr${(i % 22) + 1}`;
    const pos = 1000000 + i * 100;
    const id = i % 10 === 0 ? `rs${100000 + i}` : '.';
    const ref = bases[i % 4];
    const alt = bases[(i + 1) % 4];
    const qual = (30 + (i % 70)).toFixed(2);
    const filter = i % 5 === 0 ? 'LowQual' : 'PASS';

    // Generate INFO values
    const infoValues = Array.from({ length: Math.min(5, infoFields) }, (_, j) => `INFO${j}=${i + j}`).join(';');

    // Generate sample values
    const sampleValues = sampleNames.map((_, si) => {
      const gt = si % 3 === 0 ? '0/0' : si % 3 === 1 ? '0/1' : '1/1';
      const fmtValues = formatIds.map((fid, fi) => (fi === 0 ? gt : String(10 + si + fi)));
      return fmtValues.join(':');
    });

    lines.push(`${chrom}\t${pos}\t${id}\t${ref}\t${alt}\t${qual}\t${filter}\t${infoValues}\t${formatString}\t${sampleValues.join('\t')}`);
  }

  return lines.join('\n');
}

/**
 * Generate a synthetic BED file content.
 */
export function generateBedContent(options: {
  lines?: number;
  columns?: number;
}): string {
  const { lines = 1000, columns = 6 } = options;
  const result: string[] = [];

  for (let i = 0; i < lines; i++) {
    const chrom = `chr${(i % 22) + 1}`;
    const start = 1000000 + i * 1000;
    const end = start + 500 + (i % 500);
    const name = `feature_${i}`;
    const score = i % 1000;
    const strand = i % 2 === 0 ? '+' : '-';

    const cols = [chrom, start, end];
    if (columns >= 4) cols.push(name);
    if (columns >= 5) cols.push(score);
    if (columns >= 6) cols.push(strand);

    result.push(cols.join('\t'));
  }

  return result.join('\n');
}

/**
 * Generate a synthetic SAM file content.
 */
export function generateSamContent(options: {
  headerLines?: number;
  alignments?: number;
}): string {
  const { headerLines = 50, alignments = 1000 } = options;
  const lines: string[] = [];

  // SAM header
  lines.push('@HD\tVN:1.6\tSO:coordinate');

  // Generate @SQ (reference sequence) headers
  for (let i = 1; i <= Math.min(headerLines - 1, 25); i++) {
    lines.push(`@SQ\tSN:chr${i}\tLN:${100000000 + i * 10000000}`);
  }

  // Pad with @CO (comment) lines if needed
  for (let i = lines.length; i < headerLines; i++) {
    lines.push(`@CO\tComment line ${i}`);
  }

  // Generate alignment records
  const flags = [0, 16, 99, 147, 83, 163];
  const cigars = ['100M', '50M1I49M', '75M1D25M', '100M'];

  for (let i = 0; i < alignments; i++) {
    const qname = `read_${i}`;
    const flag = flags[i % flags.length];
    const rname = `chr${(i % 22) + 1}`;
    const pos = 1000000 + i * 200;
    const mapq = 30 + (i % 30);
    const cigar = cigars[i % cigars.length];
    const rnext = '*';
    const pnext = 0;
    const tlen = 0;
    const seq = 'ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT'; // 100bp
    const qual = 'I'.repeat(100);

    lines.push(`${qname}\t${flag}\t${rname}\t${pos}\t${mapq}\t${cigar}\t${rnext}\t${pnext}\t${tlen}\t${seq}\t${qual}`);
  }

  return lines.join('\n');
}

/**
 * Generate a synthetic GTF file content.
 */
export function generateGtfContent(options: {
  genes?: number;
  transcriptsPerGene?: number;
  exonsPerTranscript?: number;
}): string {
  const { genes = 100, transcriptsPerGene = 2, exonsPerTranscript = 5 } = options;
  const lines: string[] = [];

  for (let g = 0; g < genes; g++) {
    const chrom = `chr${(g % 22) + 1}`;
    const geneStart = 1000000 + g * 100000;
    const geneEnd = geneStart + 50000;
    const strand = g % 2 === 0 ? '+' : '-';
    const geneId = `GENE${g.toString().padStart(5, '0')}`;
    const geneName = `TestGene${g}`;

    // Gene line
    lines.push(
      `${chrom}\ttest\tgene\t${geneStart}\t${geneEnd}\t.\t${strand}\t.\tgene_id "${geneId}"; gene_name "${geneName}";`
    );

    for (let t = 0; t < transcriptsPerGene; t++) {
      const transcriptId = `${geneId}.${t + 1}`;
      const txStart = geneStart + t * 1000;
      const txEnd = geneEnd - t * 1000;

      // Transcript line
      lines.push(
        `${chrom}\ttest\ttranscript\t${txStart}\t${txEnd}\t.\t${strand}\t.\tgene_id "${geneId}"; transcript_id "${transcriptId}";`
      );

      // Exon lines
      const exonSize = Math.floor((txEnd - txStart) / (exonsPerTranscript + 1));
      for (let e = 0; e < exonsPerTranscript; e++) {
        const exonStart = txStart + e * exonSize + (e > 0 ? 500 : 0);
        const exonEnd = exonStart + exonSize - 500;

        lines.push(
          `${chrom}\ttest\texon\t${exonStart}\t${exonEnd}\t.\t${strand}\t.\tgene_id "${geneId}"; transcript_id "${transcriptId}"; exon_number "${e + 1}";`
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate a synthetic bedGraph file content.
 */
export function generateBedGraphContent(options: {
  lines?: number;
}): string {
  const { lines = 10000 } = options;
  const result: string[] = [];

  result.push('track type=bedGraph name="Test Track"');

  for (let i = 0; i < lines; i++) {
    const chrom = `chr${(i % 22) + 1}`;
    const start = 1000000 + i * 100;
    const end = start + 100;
    const value = Math.sin(i * 0.01) * 100 + 100;

    result.push(`${chrom}\t${start}\t${end}\t${value.toFixed(4)}`);
  }

  return result.join('\n');
}
