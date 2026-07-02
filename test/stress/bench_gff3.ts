// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * WEAKNESS W3 — GFF3 validation rebuilds the full feature + Parent graph model on
 * every keystroke, and retains lineText per feature (review finding P4).
 *
 * The earlier sweep used FLAT GFF3 (no Parent=), which understated this. Here we
 * generate realistic gene->mRNA->exon->CDS hierarchies (with ID/Parent), and measure
 * validateGff3 full-file time AND heap vs size, against a flat baseline. Unlike other
 * validators, GFF3 is NOT viewport-bounded — it scans and models the whole file.
 *
 * Run:  node --expose-gc -r ts-node/register/transpile-only test/stress/bench_gff3.ts
 * Out:  test/stress/results/bench_gff3.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { validateGff3 } from '../../server/src/validators/gff3';
import { defaultSettings, type ValidatorContext } from '../../server/src/validators/types';

function makeRng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Hierarchical GFF3: gene -> 2 mRNA -> (5 exon + 5 CDS) each = 23 lines/gene, all with Parent=
function genHier(targetLines: number): string {
  const out = ['##gff-version 3'];
  const perGene = 23;
  const genes = Math.max(1, Math.ceil(targetLines / perGene));
  const rng = makeRng(11);
  let base = 1000;
  for (let g = 0; g < genes; g++) {
    const chr = `chr${1 + Math.floor(rng() * 22)}`;
    const gs = base, ge = base + 20000;
    const strand = rng() < 0.5 ? '+' : '-';
    out.push(`${chr}\t.\tgene\t${gs}\t${ge}\t.\t${strand}\t.\tID=gene_${g};Name=G${g}`);
    for (let t = 0; t < 2; t++) {
      const mid = `mrna_${g}_${t}`;
      out.push(`${chr}\t.\tmRNA\t${gs}\t${ge}\t.\t${strand}\t.\tID=${mid};Parent=gene_${g}`);
      let p = gs;
      for (let e = 0; e < 5; e++) { out.push(`${chr}\t.\texon\t${p}\t${p + 300}\t.\t${strand}\t.\tID=exon_${g}_${t}_${e};Parent=${mid}`); p += 500; }
      p = gs;
      for (let c = 0; c < 5; c++) { out.push(`${chr}\t.\tCDS\t${p}\t${p + 300}\t.\t${strand}\t${c % 3}\tID=cds_${g}_${t}_${c};Parent=${mid}`); p += 500; }
    }
    base = ge + 5000;
  }
  return out.join('\n');
}

// Flat GFF3: standalone features, no Parent (valid CDS phase) — the easy case.
function genFlat(targetLines: number): string {
  const out = ['##gff-version 3'];
  const rng = makeRng(11);
  const types = ['gene', 'mRNA', 'exon', 'CDS'];
  for (let i = 0; i < targetLines - 1; i++) {
    const s = 1 + Math.floor(rng() * 250_000_000), e = s + 300;
    const t = types[i & 3];
    const phase = t === 'CDS' ? String(i % 3) : '.';
    out.push(`chr${1 + Math.floor(rng() * 22)}\t.\t${t}\t${s}\t${e}\t.\t${rng() < 0.5 ? '+' : '-'}\t${phase}\tID=${t}_${i}`);
  }
  return out.join('\n');
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

function measure(text: string, warmup: number, runs: number) {
  const lines = text.split(/\r?\n/);
  const ctx: ValidatorContext = { uri: 'file:///g.gff3', lineCount: lines.length, headerEndLine: 0, bufferLines: lines.length + 10 };
  const s = { ...defaultSettings, validation: { level: 'strict' as const, maxDiagnostics: 2000 } };
  for (let i = 0; i < warmup; i++) validateGff3(text, s, ctx);
  const ts: number[] = [];
  let diags = 0;
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); diags = validateGff3(text, s, ctx).length; ts.push(performance.now() - t0); }
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  const d = validateGff3(text, s, ctx);
  const heapMb = Math.max(0, (process.memoryUsage().heapUsed - h0) / 1048576) + (d.length === -1 ? 1 : 0);
  return { ms: median(ts), diags, heapMb, lines: lines.length };
}

const SIZES = [10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];

function main() {
  const rows: any[] = [];
  console.log('lines     flat_ms  flat_heapMB   hier_ms  hier_heapMB  hier/flat(time)  diags');
  console.log('─'.repeat(84));
  for (const n of SIZES) {
    const warmup = n >= 200_000 ? 0 : 1, runs = n >= 500_000 ? 2 : 3;
    const flat = measure(genFlat(n), warmup, runs);
    if (global.gc) global.gc();
    const hier = measure(genHier(n), warmup, runs);
    if (global.gc) global.gc();
    const row = { lines: flat.lines, flat_ms: flat.ms, flat_heap_mb: flat.heapMb, hier_ms: hier.ms, hier_heap_mb: hier.heapMb, ratio_time: hier.ms / flat.ms, hier_diags: hier.diags, flat_diags: flat.diags };
    rows.push(row);
    console.log(
      `${String(flat.lines).padStart(8)} ${flat.ms.toFixed(0).padStart(8)} ${flat.heapMb.toFixed(0).padStart(11)} ` +
      `${hier.ms.toFixed(0).padStart(9)} ${hier.heapMb.toFixed(0).padStart(12)} ${(hier.ms / flat.ms).toFixed(2).padStart(15)}x ${String(hier.diags).padStart(6)}`
    );
  }
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bench_gff3.json'),
    JSON.stringify({ meta: { note: 'flat = no Parent; hier = gene->mRNA->exon->CDS with Parent=. Both validated whole-file (GFF3 is not viewport-bounded).' }, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows to results/bench_gff3.json`);
}
main();
