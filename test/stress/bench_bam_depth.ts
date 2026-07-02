// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * WEAKNESS W1 — BAM region query cost vs COVERAGE DEPTH (fixed window).
 *
 * BioFmt's BamProvider does getRecordsForRange(chrom,start,end) then capRegionRows(…, 10000).
 * The cap bounds what is DISPLAYED, not what is READ: @gmod materializes every record
 * overlapping the window first, then we slice. So the cost of "open" scales with the
 * coverage DEPTH in the window, not with the 10K cap.
 *
 * cmp1 used uniform low-depth data and hid this. Here we pile reads into a fixed 1 Mb
 * window at increasing depth and measure: query time, records MATERIALIZED (the true
 * cost driver) vs records DISPLAYED (capped at 10K), and heap used.
 *
 * Run:  node --expose-gc -r ts-node/register/transpile-only test/stress/bench_bam_depth.ts
 * Out:  test/stress/results/bench_bam_depth.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BamFile } = require('@gmod/bam');

const SCRATCH = '/private/tmp/claude-502/-Users-owner-Documents-claude-OmicsPad/29abf9a4-8e6f-43a2-8feb-b72afc901eda/scratchpad/bams_depth';
fs.mkdirSync(SCRATCH, { recursive: true });

const CHR = 'chr1', CHR_LEN = 250_000_000, WINDOW = 1_000_000;
const READ_LEN = 100, SEQ = 'A'.repeat(READ_LEN), QUAL = 'I'.repeat(READ_LEN), CIGAR = `${READ_LEN}M`;
const CAP = 10_000; // biofmt.preview.maxRegionRecords
const DEPTHS = [1_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000]; // reads in the window

function sh(c: string) { execSync(c, { stdio: ['ignore', 'ignore', 'inherit'] }); }

function ensureBam(nWindow: number): string {
  const bam = path.join(SCRATCH, `depth_${nWindow}.bam`);
  if (fs.existsSync(bam) && fs.existsSync(bam + '.bai')) return bam;
  const sam = path.join(SCRATCH, `depth_${nWindow}.sam`);
  const fd = fs.openSync(sam, 'w');
  fs.writeSync(fd, `@HD\tVN:1.6\tSO:coordinate\n@SQ\tSN:${CHR}\tLN:${CHR_LEN}\n`);
  // All nWindow reads packed into [1, WINDOW], coordinate-sorted.
  const step = WINDOW / nWindow;
  let buf: string[] = [];
  for (let i = 0; i < nWindow; i++) {
    const pos = 1 + Math.floor(i * step);
    buf.push(`r${i}\t0\t${CHR}\t${pos}\t60\t${CIGAR}\t*\t0\t0\t${SEQ}\t${QUAL}`);
    if (buf.length >= 50_000) { fs.writeSync(fd, buf.join('\n') + '\n'); buf = []; }
  }
  if (buf.length) fs.writeSync(fd, buf.join('\n') + '\n');
  fs.closeSync(fd);
  sh(`samtools view -b "${sam}" -o "${bam}.u" 2>/dev/null`);
  sh(`samtools sort -o "${bam}" "${bam}.u" 2>/dev/null`);
  sh(`samtools index "${bam}"`);
  fs.unlinkSync(sam); fs.unlinkSync(bam + '.u');
  return bam;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

async function main() {
  const rows: any[] = [];
  console.log('depth(reads/win)  bam_MB   query_ms   materialized   displayed(cap)   heap_MB');
  console.log('─'.repeat(84));
  for (const depth of DEPTHS) {
    const bam = ensureBam(depth);
    const bamMb = fs.statSync(bam).size / 1048576;
    const runs = depth >= 100_000 ? 3 : 5;
    const times: number[] = [];
    let materialized = 0;
    for (let i = 0; i < runs; i++) {
      const f = new BamFile({ bamPath: bam, baiPath: bam + '.bai' });
      await f.getHeader();
      const t0 = performance.now();
      const recs = await f.getRecordsForRange(CHR, 0, WINDOW);
      const displayed = recs.slice(0, CAP);        // BioFmt caps AFTER materializing
      let sink = 0; for (const r of displayed) sink += r.start; // touch displayed rows
      times.push(performance.now() - t0);
      materialized = recs.length + (sink === -1 ? 1 : 0);
    }
    // heap for a single materialization
    if (global.gc) global.gc();
    const h0 = process.memoryUsage().heapUsed;
    const f = new BamFile({ bamPath: bam, baiPath: bam + '.bai' });
    await f.getHeader();
    const recs = await f.getRecordsForRange(CHR, 0, WINDOW);
    const h1 = process.memoryUsage().heapUsed;
    const heapMb = Math.max(0, (h1 - h0) / 1048576) + (recs.length === -1 ? 1 : 0);

    const row = {
      depth, bam_mb: bamMb, query_ms: median(times),
      materialized, displayed: Math.min(materialized, CAP), heap_mb: heapMb,
      wasted_records: Math.max(0, materialized - CAP),
    };
    rows.push(row);
    console.log(
      `${String(depth).padStart(15)} ${bamMb.toFixed(1).padStart(7)} ${row.query_ms.toFixed(1).padStart(10)} ` +
      `${String(materialized).padStart(13)} ${String(row.displayed).padStart(15)} ${heapMb.toFixed(1).padStart(9)}`
    );
    if (global.gc) global.gc();
  }
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bench_bam_depth.json'),
    JSON.stringify({ meta: { chr: CHR, window: WINDOW, cap: CAP, note: 'reads piled into a fixed 1Mb window; query cost scales with materialized records (depth), not the display cap' }, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows to results/bench_bam_depth.json`);
}
main().catch(e => { console.error(e); process.exit(1); });
