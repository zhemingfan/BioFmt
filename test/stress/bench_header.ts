// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Focused before/after micro-benchmark for the parseVcfHeader optimization.
 *
 * BEFORE: parseVcfHeader did `text.split('\n')` over the ENTIRE file just to read
 *         a header that is usually <100 lines — O(file). This ran on every hover,
 *         completion, definition, symbol, folding, and validation request.
 * AFTER:  it scans for the first non-'#' line and splits only that prefix — O(header).
 *
 * We inline the OLD implementation and import the current (NEW) one, run both on
 * identical inputs (fixed 100-line header + N data lines), and confirm they return
 * the same header while timing the difference.
 *
 * Run:  node --expose-gc -r ts-node/register/transpile-only test/stress/bench_header.ts
 * Out:  test/stress/results/bench_header.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseVcfHeader as parseVcfHeaderNew } from '../../server/src/validators/vcf';
import type { ParsedHeader } from '../../server/src/validators/types';

// ---- OLD implementation (pre-fix): split the whole file, then break at header end ----
function parseStructuredField(line: string, prefix: string): Record<string, string> | null {
  const content = line.substring(prefix.length);
  const endIdx = content.lastIndexOf('>');
  if (endIdx === -1) return null;
  const inner = content.substring(0, endIdx);
  const result: Record<string, string> = {};
  let current = '', key = '', inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '=' && !inQuotes && !key) { key = current; current = ''; }
    else if (ch === ',' && !inQuotes) { if (key) { result[key] = current; key = ''; current = ''; } }
    else current += ch;
  }
  if (key) result[key] = current;
  return result;
}

function parseVcfHeaderOld(text: string): ParsedHeader {
  const header: ParsedHeader = {
    info: new Map(), format: new Map(), filter: new Map(), contigs: new Map(),
    samples: [], headerEndLine: 0,
  };
  const lines = text.split('\n'); // <-- the whole-file split being eliminated
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#')) { header.headerEndLine = i; break; }
    if (line.startsWith('##fileformat=')) header.fileformat = line.substring(13).trim();
    else if (line.startsWith('##INFO=<')) {
      const f = parseStructuredField(line, '##INFO=<');
      if (f && f.ID) header.info.set(f.ID, { id: f.ID, number: f.Number || '.', type: f.Type || 'String', description: f.Description || '', line: i });
    } else if (line.startsWith('##FORMAT=<')) {
      const f = parseStructuredField(line, '##FORMAT=<');
      if (f && f.ID) header.format.set(f.ID, { id: f.ID, number: f.Number || '.', type: f.Type || 'String', description: f.Description || '', line: i });
    } else if (line.startsWith('##FILTER=<')) {
      const f = parseStructuredField(line, '##FILTER=<');
      if (f && f.ID) header.filter.set(f.ID, { id: f.ID, description: f.Description || '', line: i });
    } else if (line.startsWith('##contig=<')) {
      const f = parseStructuredField(line, '##contig=<');
      if (f && f.ID) header.contigs.set(f.ID, { id: f.ID, length: f.length ? parseInt(f.length, 10) : undefined, line: i });
    } else if (line.startsWith('#CHROM')) {
      const cols = line.split('\t');
      if (cols.length > 9) header.samples = cols.slice(9);
      header.headerEndLine = i + 1;
    }
  }
  return header;
}

// ---- generator: fixed ~100-line header + N data lines ----
function makeRng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function genVcf(nData: number): string {
  const out: string[] = ['##fileformat=VCFv4.3'];
  for (let i = 0; i < 40; i++) out.push(`##INFO=<ID=I${i},Number=1,Type=Integer,Description="info ${i}">`);
  for (let i = 0; i < 20; i++) out.push(`##FORMAT=<ID=F${i},Number=1,Type=Integer,Description="fmt ${i}">`);
  for (let i = 0; i < 30; i++) out.push(`##contig=<ID=chr${i + 1},length=100000000>`);
  out.push('##FILTER=<ID=LowQual,Description="low">');
  out.push('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1\tS2');
  const rng = makeRng(7);
  const B = 'ACGT';
  for (let i = 0; i < nData; i++) {
    const c = `chr${1 + Math.floor(rng() * 22)}`;
    out.push(`${c}\t${1 + Math.floor(rng() * 2.5e8)}\t.\t${B[(rng() * 4) | 0]}\t${B[(rng() * 4) | 0]}\t50\tPASS\tI0=1;I1=2\tF0:F1\t1:2\t3:4`);
  }
  return out.join('\n');
}

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }
function timeIt(fn: () => void, warmup: number, runs: number): number {
  for (let i = 0; i < warmup; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); }
  return median(t);
}

const SIZES = [1_000, 10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];
const rows: any[] = [];
console.log('dataLines   size_MB   old_ms   new_ms   speedup');
console.log('─'.repeat(55));
for (const n of SIZES) {
  const text = genVcf(n);
  const sizeMb = Buffer.byteLength(text, 'utf8') / 1048576;
  // correctness: both implementations must agree
  const ho = parseVcfHeaderOld(text), hn = parseVcfHeaderNew(text);
  const agree = ho.headerEndLine === hn.headerEndLine && ho.info.size === hn.info.size &&
    ho.format.size === hn.format.size && ho.filter.size === hn.filter.size &&
    ho.contigs.size === hn.contigs.size && ho.samples.join(',') === hn.samples.join(',');
  if (!agree) throw new Error(`old/new parseVcfHeader disagree at n=${n}`);
  const warmup = n >= 200_000 ? 1 : 3, runs = n >= 500_000 ? 3 : 8;
  const oldMs = timeIt(() => parseVcfHeaderOld(text), warmup, runs);
  const newMs = timeIt(() => parseVcfHeaderNew(text), warmup, runs);
  rows.push({ dataLines: n, size_mb: sizeMb, old_ms: oldMs, new_ms: newMs, speedup: oldMs / newMs });
  console.log(`${String(n).padStart(9)} ${sizeMb.toFixed(1).padStart(8)} ${oldMs.toFixed(2).padStart(8)} ${newMs.toFixed(3).padStart(8)} ${(oldMs / newMs).toFixed(1).padStart(8)}x`);
  if (global.gc) global.gc();
}

const outDir = path.join(__dirname, 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'bench_header.json'), JSON.stringify({ meta: { node: process.version, note: 'parseVcfHeader old(split-whole-file) vs new(prefix-scan); fixed 92-line header' }, rows }, null, 2));
console.log(`\nWrote ${rows.length} rows to results/bench_header.json`);
