// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Competitive BAM benchmark: BioFmt vs the "BAM Reader" VS Code extension.
 *
 * The two tools solve "let me see this BAM" with fundamentally different mechanisms:
 *   - BAM Reader: shells out to `samtools view` to convert the ENTIRE file to CSV
 *     (its Marketplace page: "converts BAM files to CSV", "the entire BAM file is
 *     converted"). Cost is O(file size).
 *   - BioFmt: an indexed region query via @gmod/bam getRecordsForRange(chrom,start,end)
 *     capped at maxRegionRecords (10000) — exactly what src/providers/BamProvider.ts
 *     does. Cost is O(records in the queried window), not O(file size).
 *
 * We reproduce each mechanism faithfully and time it across BAM sizes:
 *   - BAM Reader        : `samtools view <bam>` whole file -> CSV
 *   - BioFmt (open)     : region query chr1:0-1,000,000 (BioFmt's auto-query on open)
 *   - BioFmt (navigate) : region query chr1:100,000,000-100,100,000 (jump to a region)
 *
 * Requires samtools on PATH. BAMs are generated once into scratchpad and cached.
 *
 * Run:  node -r ts-node/register/transpile-only test/stress/bench_bam.ts
 * Out:  test/stress/results/bench_bam.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BamFile } = require('@gmod/bam');

const SCRATCH = process.env.BAM_DIR ||
  '/private/tmp/claude-502/-Users-owner-Documents-claude-OmicsPad/29abf9a4-8e6f-43a2-8feb-b72afc901eda/scratchpad/bams';
fs.mkdirSync(SCRATCH, { recursive: true });

const CHR = 'chr1';
const CHR_LEN = 250_000_000;
const READ_LEN = 100;
const SEQ = 'A'.repeat(READ_LEN);
const QUAL = 'I'.repeat(READ_LEN);
const CIGAR = `${READ_LEN}M`;
const MAX_REGION_RECORDS = 10_000; // BioFmt default biofmt.preview.maxRegionRecords

const SIZES = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000];

function sh(cmd: string): void {
  execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** Generate a coordinate-sorted, indexed BAM of N reads spread uniformly across chr1. Cached. */
function ensureBam(n: number): string {
  const bam = path.join(SCRATCH, `reads_${n}.bam`);
  if (fs.existsSync(bam) && fs.existsSync(bam + '.bai')) return bam;

  const sam = path.join(SCRATCH, `reads_${n}.sam`);
  const fd = fs.openSync(sam, 'w');
  fs.writeSync(fd, `@HD\tVN:1.6\tSO:coordinate\n@SQ\tSN:${CHR}\tLN:${CHR_LEN}\n`);
  const step = CHR_LEN / n;
  const CHUNK = 50_000;
  let buf: string[] = [];
  for (let i = 0; i < n; i++) {
    const pos = 1 + Math.floor(i * step); // non-decreasing => already coordinate-sorted
    buf.push(`r${i}\t0\t${CHR}\t${pos}\t60\t${CIGAR}\t*\t0\t0\t${SEQ}\t${QUAL}`);
    if (buf.length >= CHUNK) { fs.writeSync(fd, buf.join('\n') + '\n'); buf = []; }
  }
  if (buf.length) fs.writeSync(fd, buf.join('\n') + '\n');
  fs.closeSync(fd);

  // SAM -> sorted BAM -> index (mirrors the real user workflow BioFmt docs recommend)
  sh(`samtools view -b "${sam}" -o "${bam}.unsorted" 2>/dev/null`);
  sh(`samtools sort -o "${bam}" "${bam}.unsorted" 2>/dev/null`);
  sh(`samtools index "${bam}"`);
  fs.unlinkSync(sam);
  fs.unlinkSync(bam + '.unsorted');
  return bam;
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }

async function timeAsync(fn: () => Promise<number>, runs: number): Promise<{ ms: number; n: number }> {
  let last = 0;
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); last = await fn(); ts.push(performance.now() - t0); }
  return { ms: median(ts), n: last };
}

function timeSync(fn: () => void, runs: number): number {
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); fn(); ts.push(performance.now() - t0); }
  return median(ts);
}

// Faithful BioFmt region query: getRecordsForRange -> cap -> convert each record to a SAM-ish text line.
async function bioFmtRegion(bam: any, start: number, end: number): Promise<number> {
  const records = await bam.getRecordsForRange(CHR, start, end);
  const capped = records.slice(0, MAX_REGION_RECORDS);
  let sink = 0;
  for (const r of capped) {
    const line = `${r.name}\t${r.flags}\t${CHR}\t${r.start + 1}\t${r.mq}\t${r.CIGAR || CIGAR}`;
    sink += line.length; // force materialization of the rendered row
  }
  return sink === -1 ? -1 : records.length;
}

async function main() {
  const rows: any[] = [];
  const csvOut = path.join(SCRATCH, 'out.csv');
  console.log('reads      bam_MB   bamReader_ms   biofmt_open_ms(recs)   biofmt_nav_ms(recs)');
  console.log('─'.repeat(90));

  for (const n of SIZES) {
    const bam = ensureBam(n);
    const bamMb = fs.statSync(bam).size / 1048576;
    const runs = n >= 1_000_000 ? 3 : 5;

    // BAM Reader mechanism: convert the WHOLE file (samtools view -> CSV write)
    const bamReaderMs = timeSync(() => {
      execSync(`samtools view "${bam}" | tr '\\t' ',' > "${csvOut}"`, { stdio: 'ignore' });
    }, n >= 1_000_000 ? 2 : 3);

    // BioFmt mechanism: indexed region queries (construct once, like an open panel)
    const bamFile = new BamFile({ bamPath: bam, baiPath: bam + '.bai' });
    await bamFile.getHeader();
    const open = await timeAsync(() => bioFmtRegion(bamFile, 0, 1_000_000), runs);
    const nav = await timeAsync(() => bioFmtRegion(bamFile, 100_000_000, 100_100_000), runs);

    rows.push({
      reads: n, bam_mb: bamMb,
      bamReader_ms: bamReaderMs,
      biofmt_open_ms: open.ms, biofmt_open_records: open.n,
      biofmt_nav_ms: nav.ms, biofmt_nav_records: nav.n,
      speedup_open: bamReaderMs / open.ms,
      speedup_nav: bamReaderMs / nav.ms,
    });
    console.log(
      `${String(n).padStart(9)} ${bamMb.toFixed(1).padStart(7)} ${bamReaderMs.toFixed(0).padStart(13)} ` +
      `${(open.ms.toFixed(1) + ' (' + open.n + ')').padStart(22)} ${(nav.ms.toFixed(1) + ' (' + nav.n + ')').padStart(20)}`
    );
  }

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bench_bam.json'),
    JSON.stringify({ meta: { chr: CHR, chrLen: CHR_LEN, maxRegionRecords: MAX_REGION_RECORDS, samtools: '1.9', note: 'BAM Reader = samtools view whole-file->CSV; BioFmt = @gmod/bam indexed region query (mirrors BamProvider)' }, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows to results/bench_bam.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
