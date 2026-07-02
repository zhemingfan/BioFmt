// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * BioFmt real-code performance benchmark harness.
 *
 * Unlike stress_test.py (which measures only raw file I/O) and the copied-code
 * perf tests, this harness imports and drives the ACTUAL production validators
 * (server/src/validators/*) and the ACTUAL webview VCF field parsers
 * (webview/src/vcf/formatParsers.ts) across a sweep of synthetic file sizes.
 *
 * It measures, per (format, size):
 *   - split_ms          : text.split('\n') — the O(n) floor every validation pays
 *   - validate_open_ms  : viewport validation with cursor at file TOP (buffer 500)
 *   - validate_scroll_ms: viewport validation with cursor in the MIDDLE
 *   - validate_full_ms  : whole-file strict validation (worst case)
 *   - diagnostics_full  : diagnostic count for the whole file (sanity)
 *   - heap_full_mb      : heap delta for a full validation
 *
 * Plus a VCF FORMAT field-parser micro-benchmark (parseGenotype / AD / PL / FT).
 *
 * Run:  node --expose-gc -r ts-node/register test/stress/bench.ts
 * Out:  test/stress/results/bench_real.json
 */

import * as fs from 'fs';
import * as path from 'path';

import { getValidator } from '../../server/src/validators';
import {
  defaultSettings,
  type BioFmtSettings,
  type ValidatorContext,
} from '../../server/src/validators/types';

import {
  parseGenotype,
  parseAllelicDepth,
  parsePhredLikelihoods,
  parseSampleFilter,
} from '../../webview/src/vcf/formatParsers';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (mulberry32) so runs are reproducible
// ─────────────────────────────────────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BASES = 'ACGT';
function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic generators — one function per format, returns full file text.
// Kept intentionally realistic (valid records) so validators do real work.
// ─────────────────────────────────────────────────────────────────────────────
type Gen = (n: number, rng: () => number) => string;

const genVcf: Gen = (n, rng) => {
  const out: string[] = [
    '##fileformat=VCFv4.3',
    '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
    '##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">',
    '##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele Count">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read Depth">',
    '##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype Quality">',
    '##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Allelic depths">',
    '##FORMAT=<ID=PL,Number=G,Type=Integer,Description="Phred likelihoods">',
    '##FILTER=<ID=LowQual,Description="Low quality">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE1\tSAMPLE2',
  ];
  for (let i = 0; i < n; i++) {
    const chrom = `chr${randInt(rng, 1, 22)}`;
    const pos = randInt(rng, 1, 250_000_000);
    const ref = BASES[randInt(rng, 0, 3)];
    let alt = BASES[randInt(rng, 0, 3)];
    if (alt === ref) alt = BASES[(BASES.indexOf(ref) + 1) % 4];
    const qual = randInt(rng, 10, 99);
    const filter = i % 7 === 0 ? 'LowQual' : 'PASS';
    const info = `DP=${randInt(rng, 1, 500)};AF=${(rng()).toFixed(4)};AC=${randInt(rng, 1, 4)}`;
    const s1 = `0/1:${randInt(rng, 1, 100)}:${randInt(rng, 3, 99)}:${randInt(rng, 0, 40)},${randInt(rng, 0, 40)}:${randInt(rng, 0, 255)},0,${randInt(rng, 0, 255)}`;
    const s2 = `1/1:${randInt(rng, 1, 100)}:${randInt(rng, 3, 99)}:${randInt(rng, 0, 40)},${randInt(rng, 0, 40)}:${randInt(rng, 0, 255)},0,${randInt(rng, 0, 255)}`;
    out.push(`${chrom}\t${pos}\t.\t${ref}\t${alt}\t${qual}\tPASS\t${info}\tGT:DP:GQ:AD:PL\t${s1}\t${s2}`.replace('PASS\t', filter + '\t'));
  }
  return out.join('\n');
};

const genBed: Gen = (n, rng) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const chrom = `chr${randInt(rng, 1, 22)}`;
    const start = randInt(rng, 0, 250_000_000);
    const end = start + randInt(rng, 100, 10_000);
    out.push(`${chrom}\t${start}\t${end}\tfeature_${i}\t${randInt(rng, 0, 1000)}\t${rng() < 0.5 ? '+' : '-'}`);
  }
  return out.join('\n');
};

const genSam: Gen = (n, rng) => {
  const out: string[] = ['@HD\tVN:1.6\tSO:coordinate', '@SQ\tSN:chr1\tLN:249250621', '@SQ\tSN:chr22\tLN:51304566'];
  for (let i = 0; i < n; i++) {
    const len = randInt(rng, 50, 150);
    let seq = '';
    let qual = '';
    for (let j = 0; j < len; j++) {
      seq += BASES[randInt(rng, 0, 3)];
      qual += String.fromCharCode(randInt(rng, 33, 73));
    }
    out.push(`read_${i}\t0\tchr${randInt(rng, 1, 22)}\t${randInt(rng, 1, 250_000_000)}\t${randInt(rng, 0, 60)}\t${len}M\t*\t0\t0\t${seq}\t${qual}`);
  }
  return out.join('\n');
};

const genGff3: Gen = (n, rng) => {
  const out: string[] = ['##gff-version 3'];
  const types = ['gene', 'mRNA', 'exon', 'CDS'];
  for (let i = 0; i < n; i++) {
    const start = randInt(rng, 1, 250_000_000);
    const end = start + randInt(rng, 100, 50_000);
    const t = types[randInt(rng, 0, 3)];
    // CDS features require a phase (0/1/2); everything else uses '.'. Keeping this
    // valid means GFF3 validates the whole file instead of early-exiting at the
    // maxDiagnostics cap, so its timing reflects real full-file work.
    const phase = t === 'CDS' ? String(randInt(rng, 0, 2)) : '.';
    out.push(`chr${randInt(rng, 1, 22)}\t.\t${t}\t${start}\t${end}\t.\t${rng() < 0.5 ? '+' : '-'}\t${phase}\tID=${t}_${i};Name=feature_${i}`);
  }
  return out.join('\n');
};

const genGtf: Gen = (n, rng) => {
  const out: string[] = [];
  const types = ['gene', 'transcript', 'exon', 'CDS'];
  for (let i = 0; i < n; i++) {
    const start = randInt(rng, 1, 250_000_000);
    const end = start + randInt(rng, 100, 50_000);
    const t = types[randInt(rng, 0, 3)];
    out.push(`chr${randInt(rng, 1, 22)}\ttest\t${t}\t${start}\t${end}\t.\t${rng() < 0.5 ? '+' : '-'}\t.\tgene_id "gene_${i}"; transcript_id "tx_${i}";`);
  }
  return out.join('\n');
};

const genPaf: Gen = (n, rng) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const qlen = randInt(rng, 1000, 100_000);
    const qstart = randInt(rng, 0, (qlen / 2) | 0);
    const qend = qstart + randInt(rng, 500, (qlen / 2) | 0);
    const blockLen = qend - qstart;
    const matches = blockLen - randInt(rng, 0, 50);
    const tlen = 250_000_000;
    const tstart = randInt(rng, 0, (tlen / 2) | 0);
    out.push(`query_${i}\t${qlen}\t${qstart}\t${qend}\t${rng() < 0.5 ? '+' : '-'}\tchr${randInt(rng, 1, 22)}\t${tlen}\t${tstart}\t${tstart + blockLen}\t${matches}\t${blockLen}\t${randInt(rng, 0, 60)}`);
  }
  return out.join('\n');
};

const genBedGraph: Gen = (n, rng) => {
  const out: string[] = ['track type=bedGraph name="test"'];
  for (let i = 0; i < n; i++) {
    const start = i * 100;
    out.push(`chr1\t${start}\t${start + 100}\t${(rng() * 100).toFixed(4)}`);
  }
  return out.join('\n');
};

const genFasta: Gen = (n, rng) => {
  // n records, ~600bp each wrapped at 80 → dominated by sequence lines
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`>sequence_${i} synthetic`);
    const L = 600;
    let seq = '';
    for (let j = 0; j < L; j++) seq += BASES[randInt(rng, 0, 3)];
    for (let j = 0; j < L; j += 80) out.push(seq.slice(j, j + 80));
  }
  return out.join('\n');
};

const genFastq: Gen = (n, rng) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const len = 150;
    let seq = '';
    let qual = '';
    for (let j = 0; j < len; j++) {
      seq += BASES[randInt(rng, 0, 3)];
      qual += String.fromCharCode(randInt(rng, 33, 73));
    }
    out.push(`@read_${i}`, seq, '+', qual);
  }
  return out.join('\n');
};

// linesPerRecord lets us size FASTA/FASTQ by target LINE count (not record count),
// so the x-axis (lines) is comparable across formats and memory stays bounded.
const GENERATORS: Record<string, { gen: Gen; languageId: string; linesPerRecord: number }> = {
  VCF: { gen: genVcf, languageId: 'omics-vcf', linesPerRecord: 1 },
  BED: { gen: genBed, languageId: 'omics-bed', linesPerRecord: 1 },
  SAM: { gen: genSam, languageId: 'omics-sam', linesPerRecord: 1 },
  GFF3: { gen: genGff3, languageId: 'omics-gff3', linesPerRecord: 1 },
  GTF: { gen: genGtf, languageId: 'omics-gtf', linesPerRecord: 1 },
  PAF: { gen: genPaf, languageId: 'omics-paf', linesPerRecord: 1 },
  bedGraph: { gen: genBedGraph, languageId: 'omics-bedgraph', linesPerRecord: 1 },
  FASTA: { gen: genFasta, languageId: 'omics-fasta', linesPerRecord: 9 }, // 600bp/80 wrap + header
  FASTQ: { gen: genFastq, languageId: 'omics-fastq', linesPerRecord: 4 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Timing helper — warmup + measured runs, returns median (robust to GC spikes)
// ─────────────────────────────────────────────────────────────────────────────
function timeIt(fn: () => void, warmup: number, runs: number): { medianMs: number; minMs: number } {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[times.length >> 1], minMs: times[0] };
}

function makeSettings(level: 'basic' | 'strict'): BioFmtSettings {
  return { ...defaultSettings, validation: { level, maxDiagnostics: 2000 } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sweep
// ─────────────────────────────────────────────────────────────────────────────
// Target LINE counts (x-axis). FASTA/FASTQ derive record counts from linesPerRecord.
const SIZES = [1_000, 5_000, 10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
// Adaptive run counts: fewer measured runs for the huge sizes to bound wall-clock + memory.
function runsFor(targetLines: number): { warmup: number; runs: number } {
  if (targetLines >= 500_000) return { warmup: 0, runs: 1 };
  if (targetLines >= 100_000) return { warmup: 1, runs: 2 };
  return { warmup: 2, runs: 4 };
}

interface Row {
  format: string;
  records: number;
  lines: number;
  bytes: number;
  size_mb: number;
  split_ms: number;
  validate_open_ms: number;
  validate_scroll_ms: number;
  validate_full_ms: number;
  diagnostics_full: number;
  heap_full_mb: number;
  full_throughput_mb_s: number;
  full_throughput_lines_s: number;
}

function benchFormatSize(format: string, targetLines: number): Row {
  const { gen, languageId, linesPerRecord } = GENERATORS[format];
  const validator = getValidator(languageId)!;
  const records = Math.max(1, Math.round(targetLines / linesPerRecord));
  const rng = makeRng(0x1234 + targetLines);
  const text = gen(records, rng);
  const bytes = Buffer.byteLength(text, 'utf8');
  const lineCount = text.split('\n').length;
  const strict = makeSettings('strict');
  const { warmup, runs } = runsFor(targetLines);

  // headerEndLine: VCF header is preserved & always validated; approximate 0 for others.
  const headerEndLine = 0;

  const splitT = timeIt(() => { text.split('\n'); }, warmup, runs);

  // Viewport @ TOP (open): buffer 500, visible range at very top.
  const ctxOpen: ValidatorContext = {
    uri: 'file:///bench',
    lineCount,
    headerEndLine,
    bufferLines: 500,
    visibleRanges: [{ startLine: 0, endLine: 50 }],
  };
  const openT = timeIt(() => { validator(text, strict, ctxOpen); }, warmup, runs);

  // Viewport @ MIDDLE (scroll): buffer 500, visible range in the middle.
  const mid = Math.floor(lineCount / 2);
  const ctxScroll: ValidatorContext = {
    uri: 'file:///bench',
    lineCount,
    headerEndLine,
    bufferLines: 500,
    visibleRanges: [{ startLine: mid, endLine: mid + 50 }],
  };
  const scrollT = timeIt(() => { validator(text, strict, ctxScroll); }, warmup, runs);

  // FULL file (worst case): buffer covers everything, no visibleRanges.
  const ctxFull: ValidatorContext = {
    uri: 'file:///bench',
    lineCount,
    headerEndLine,
    bufferLines: lineCount + 10,
  };
  const fullT = timeIt(() => { validator(text, strict, ctxFull); }, warmup, runs);
  const diags = validator(text, strict, ctxFull).length;

  // Heap delta for a single full validation.
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  const d = validator(text, strict, ctxFull);
  const h1 = process.memoryUsage().heapUsed;
  // keep `d` alive across the measurement
  const heapFullMb = Math.max(0, (h1 - h0) / 1048576) + (d.length === -1 ? 1 : 0);

  const sizeMb = bytes / 1048576;
  return {
    format,
    records,
    lines: lineCount,
    bytes,
    size_mb: sizeMb,
    split_ms: splitT.medianMs,
    validate_open_ms: openT.medianMs,
    validate_scroll_ms: scrollT.medianMs,
    validate_full_ms: fullT.medianMs,
    diagnostics_full: diags,
    heap_full_mb: heapFullMb,
    full_throughput_mb_s: sizeMb / (fullT.medianMs / 1000),
    full_throughput_lines_s: lineCount / (fullT.medianMs / 1000),
  };
}

// VCF FORMAT field-parser micro-benchmark (real webview parsers)
function benchFieldParsers(): Record<string, number> {
  const N = 500_000;
  const plCtx = { ref: 'A', alts: ['G'], nAlleles: 2, formatKeys: ['GT', 'PL'], sampleName: 'S1' };
  const gtT = timeIt(() => { for (let i = 0; i < N; i++) parseGenotype('0/1'); }, 1, 3);
  const gtPhased = timeIt(() => { for (let i = 0; i < N; i++) parseGenotype('0|1|2'); }, 1, 3);
  const adT = timeIt(() => { for (let i = 0; i < N; i++) parseAllelicDepth('34,12,3'); }, 1, 3);
  const plT = timeIt(() => { for (let i = 0; i < N; i++) parsePhredLikelihoods('255,0,128,90,40,255', plCtx); }, 1, 3);
  const ftT = timeIt(() => { for (let i = 0; i < N; i++) parseSampleFilter('PASS'); }, 1, 3);
  return {
    n: N,
    parseGenotype_M_per_s: N / (gtT.medianMs / 1000) / 1e6,
    parseGenotypePhased_M_per_s: N / (gtPhased.medianMs / 1000) / 1e6,
    parseAllelicDepth_M_per_s: N / (adT.medianMs / 1000) / 1e6,
    parsePhredLikelihoods_M_per_s: N / (plT.medianMs / 1000) / 1e6,
    parseSampleFilter_M_per_s: N / (ftT.medianMs / 1000) / 1e6,
  };
}

function main() {
  const onlyFormats = process.env.BENCH_FORMATS ? process.env.BENCH_FORMATS.split(',') : Object.keys(GENERATORS);
  const maxRecords = process.env.BENCH_MAX ? parseInt(process.env.BENCH_MAX, 10) : 1_000_000;
  const sizes = SIZES.filter((s) => s <= maxRecords);

  const outName = process.env.BENCH_OUT || 'bench_real.json';
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, outName);

  const results: Row[] = [];
  let fieldParsers: Record<string, number> = {};
  const t0 = performance.now();

  // Crash-safe: rewrite the JSON after every measurement so an OOM still leaves data.
  const flush = () => {
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          meta: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            validationLevel: 'strict',
            bufferLines: 500,
            generatedAtRunMs: performance.now() - t0,
          },
          rows: results,
          fieldParsers,
        },
        null,
        2
      )
    );
  };

  console.log('format     records     lines   size_MB  split_ms  open_ms  scroll_ms  full_ms  diags  MB/s');
  console.log('─'.repeat(100));
  for (const format of onlyFormats) {
    for (const targetLines of sizes) {
      try {
        const row = benchFormatSize(format, targetLines);
        results.push(row);
        console.log(
          `${format.padEnd(9)} ${String(row.records).padStart(9)} ${String(row.lines).padStart(9)} ` +
          `${row.size_mb.toFixed(1).padStart(8)} ${row.split_ms.toFixed(2).padStart(8)} ` +
          `${row.validate_open_ms.toFixed(2).padStart(7)} ${row.validate_scroll_ms.toFixed(2).padStart(9)} ` +
          `${row.validate_full_ms.toFixed(1).padStart(8)} ${String(row.diagnostics_full).padStart(6)} ` +
          `${row.full_throughput_mb_s.toFixed(0).padStart(5)}`
        );
        flush();
      } catch (e) {
        console.error(`  ${format} @ ${targetLines}: ERROR ${(e as Error).message}`);
      }
      if (global.gc) global.gc(); // release the generated text before the next size
    }
  }

  fieldParsers = benchFieldParsers();
  console.log('\nVCF field parsers (M ops/sec):', JSON.stringify(fieldParsers, null, 0));
  flush();
  console.log(`\nWrote ${results.length} rows to ${outPath} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}

main();
