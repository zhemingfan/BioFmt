// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * WEAKNESS W4 — population-scale VCF: the webview parses EVERY sample of EVERY row
 * even though only sampleColumnLimit (10) are displayed (review finding P1).
 *
 * We drive the real parser (webview/src/vcf/formatParsers.parseSampleFormats) and
 * measure per-row parse cost for S samples (what VcfPreview does) vs parsing only the
 * 10 shown, across cohort sizes up to 2504 (1000 Genomes). Extrapolated to the initial
 * 500-row viewport load.
 *
 * Run:  node -r ts-node/register/transpile-only test/stress/bench_vcf_samples.ts
 * Out:  test/stress/results/bench_vcf_samples.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseSampleFormats } from '../../webview/src/vcf/formatParsers';
import type { FormatDefinition, FormatRecordContext } from '../../webview/src/types';

const FORMAT_KEYS = ['GT', 'DP', 'GQ', 'AD', 'PL'];
const SAMPLE: Record<string, string> = { GT: '0/1', DP: '30', GQ: '99', AD: '20,10', PL: '255,0,255' };
const formatDefs = new Map<string, FormatDefinition>([
  ['GT', { id: 'GT', number: '1', type: 'String', description: '' }],
  ['DP', { id: 'DP', number: '1', type: 'Integer', description: '' }],
  ['GQ', { id: 'GQ', number: '1', type: 'Integer', description: '' }],
  ['AD', { id: 'AD', number: 'R', type: 'Integer', description: '' }],
  ['PL', { id: 'PL', number: 'G', type: 'Integer', description: '' }],
]);
const ctx: FormatRecordContext = { ref: 'A', alts: ['G'], nAlleles: 2, formatKeys: FORMAT_KEYS, sampleName: 'S' };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

// Parse `nSamples` samples of one row exactly as VcfPreview.parseVcfLine does.
function parseRow(nSamples: number): void {
  for (let s = 0; s < nSamples; s++) parseSampleFormats(SAMPLE, formatDefs, ctx);
}

function timePerRow(nSamples: number): number {
  const ITER = nSamples > 500 ? 200 : 2000;
  // warmup
  for (let i = 0; i < 3; i++) parseRow(nSamples);
  const ts: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let i = 0; i < ITER; i++) parseRow(nSamples);
    ts.push((performance.now() - t0) / ITER); // ms per row
  }
  return median(ts);
}

const COHORTS = [2, 10, 50, 100, 500, 1000, 2504];
const VIEWPORT_ROWS = 500; // initial load

function main() {
  const rows: any[] = [];
  const displayedCost = timePerRow(10); // parsing only the 10 shown
  console.log('samples   parse_all_ms/row   parse_10_ms/row   wasted×   viewport500_all_ms   viewport500_10_ms');
  console.log('─'.repeat(96));
  for (const n of COHORTS) {
    const allMs = timePerRow(n);
    const shownMs = timePerRow(Math.min(n, 10));
    const row = {
      samples: n, parse_all_ms_row: allMs, parse_shown_ms_row: shownMs,
      wasted_x: allMs / shownMs,
      viewport500_all_ms: allMs * VIEWPORT_ROWS,
      viewport500_shown_ms: shownMs * VIEWPORT_ROWS,
    };
    rows.push(row);
    console.log(
      `${String(n).padStart(7)} ${allMs.toFixed(4).padStart(17)} ${shownMs.toFixed(4).padStart(17)} ` +
      `${(allMs / shownMs).toFixed(1).padStart(8)}x ${(allMs * VIEWPORT_ROWS).toFixed(0).padStart(19)} ${(shownMs * VIEWPORT_ROWS).toFixed(0).padStart(18)}`
    );
  }
  void displayedCost;
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bench_vcf_samples.json'),
    JSON.stringify({ meta: { formatKeys: FORMAT_KEYS, viewportRows: VIEWPORT_ROWS, sampleColumnLimit: 10, note: 'VcfPreview parses all S samples/row but shows only 10; cost is the all-samples column.' }, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows to results/bench_vcf_samples.json`);
}
main();
