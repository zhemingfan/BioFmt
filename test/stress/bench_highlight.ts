// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Competitive syntax-highlighting benchmark: BioFmt vs the "bioSyntax" VS Code extension.
 *
 * Both ship TextMate grammars and both are tokenized by the SAME engine that VS Code
 * uses (vscode-textmate + vscode-oniguruma), so this isolates grammar efficiency: how
 * fast each grammar tokenizes the same large file. It is the one runtime axis where
 * bioSyntax (a highlighting-only tool) genuinely overlaps BioFmt.
 *
 * BioFmt grammars: repo syntaxes/*.tmLanguage.json
 * bioSyntax grammars: fetched from github.com/bioSyntax/bioSyntax vscode/syntaxes
 *
 * Run:  node -r ts-node/register/transpile-only test/stress/bench_highlight.ts
 * Out:  test/stress/results/bench_highlight.json
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const oniguruma = require('vscode-oniguruma');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vsctm = require('vscode-textmate');

const REPO = path.resolve(__dirname, '..', '..');
const BIOFMT_DIR = path.join(REPO, 'syntaxes');
const BIOSYNTAX_DIR = process.env.BS_DIR ||
  '/private/tmp/claude-502/-Users-owner-Documents-claude-OmicsPad/29abf9a4-8e6f-43a2-8feb-b72afc901eda/scratchpad/biosyntax';
const WASM = path.join(REPO, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');

const NLINES = 20_000;

// ---- representative sample content per format ----
function sampleLines(fmt: string): string[] {
  const B = 'ACGT';
  const seq = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += B[i & 3]; return s; };
  const out: string[] = [];
  if (fmt === 'vcf') {
    out.push('##fileformat=VCFv4.3', '##INFO=<ID=DP,Number=1,Type=Integer,Description="d">',
      '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tS1');
    for (let i = 0; i < NLINES; i++)
      out.push(`chr${(i % 22) + 1}\t${1000 + i}\trs${i}\tA\tG\t${30 + (i % 60)}\tPASS\tDP=${i % 200};AF=0.${i % 100}\tGT:DP\t0/1:${i % 90}`);
  } else if (fmt === 'sam') {
    out.push('@HD\tVN:1.6\tSO:coordinate', '@SQ\tSN:chr1\tLN:249250621');
    const s = seq(100), q = 'I'.repeat(100);
    for (let i = 0; i < NLINES; i++)
      out.push(`read_${i}\t${(i % 2) ? 16 : 0}\tchr${(i % 22) + 1}\t${1000 + i}\t60\t100M\t*\t0\t0\t${s}\t${q}`);
  } else if (fmt === 'bed') {
    for (let i = 0; i < NLINES; i++)
      out.push(`chr${(i % 22) + 1}\t${1000 + i}\t${1500 + i}\tfeature_${i}\t${i % 1000}\t${(i % 2) ? '+' : '-'}`);
  } else if (fmt === 'gtf') {
    for (let i = 0; i < NLINES; i++)
      out.push(`chr${(i % 22) + 1}\ttest\texon\t${1000 + i}\t${2000 + i}\t.\t${(i % 2) ? '+' : '-'}\t.\tgene_id "g${i}"; transcript_id "t${i}";`);
  } else if (fmt === 'fasta') {
    const s = seq(70);
    for (let i = 0; i < NLINES / 7; i++) { out.push(`>sequence_${i} synthetic`); for (let j = 0; j < 6; j++) out.push(s); }
  } else if (fmt === 'fastq') {
    const s = seq(100), q = 'I'.repeat(100);
    for (let i = 0; i < NLINES / 4; i++) { out.push(`@read_${i}`, s, '+', q); }
  }
  return out;
}

function buildRegistry(dir: string, onigLib: any) {
  // scopeName -> raw grammar text
  const byScope = new Map<string, { text: string; file: string }>();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.tmLanguage.json')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      const scope = JSON.parse(text).scopeName;
      if (scope) byScope.set(scope, { text, file: path.join(dir, f) });
    } catch { /* skip unparseable */ }
  }
  const registry = new vsctm.Registry({
    onigLib,
    loadGrammar: async (scopeName: string) => {
      const g = byScope.get(scopeName);
      return g ? vsctm.parseRawGrammar(g.text, g.file) : null;
    },
  });
  return registry;
}

function tokenizeAll(grammar: any, lines: string[]): number {
  let ruleStack = vsctm.INITIAL;
  let tokens = 0;
  for (const line of lines) {
    const r = grammar.tokenizeLine(line, ruleStack);
    ruleStack = r.ruleStack;
    tokens += r.tokens.length;
  }
  return tokens;
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }
function timeIt(fn: () => number, warmup: number, runs: number): { ms: number; tokens: number } {
  let tokens = 0;
  for (let i = 0; i < warmup; i++) tokens = fn();
  const ts: number[] = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); tokens = fn(); ts.push(performance.now() - t0); }
  return { ms: median(ts), tokens };
}

async function main() {
  await oniguruma.loadWASM(fs.readFileSync(WASM).buffer);
  const onigLib = {
    createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  };
  const regBioFmt = buildRegistry(BIOFMT_DIR, onigLib);
  const regBioSyntax = buildRegistry(BIOSYNTAX_DIR, onigLib);

  const scopeOf = (dir: string, fmt: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, `${fmt}.tmLanguage.json`), 'utf8')).scopeName;

  const formats = ['vcf', 'sam', 'bed', 'gtf', 'fasta', 'fastq'];
  const rows: any[] = [];
  console.log('format   lines   BioFmt(klines/s, tok)      bioSyntax(klines/s, tok)   BioFmt/bioSyntax');
  console.log('─'.repeat(92));

  for (const fmt of formats) {
    const lines = sampleLines(fmt);
    const gBio = await regBioFmt.loadGrammar(scopeOf(BIOFMT_DIR, fmt));
    const gBs = await regBioSyntax.loadGrammar(scopeOf(BIOSYNTAX_DIR, fmt));
    if (!gBio || !gBs) { console.log(`  ${fmt}: grammar load failed (bio=${!!gBio} bs=${!!gBs})`); continue; }

    const bio = timeIt(() => tokenizeAll(gBio, lines), 1, 3);
    const bs = timeIt(() => tokenizeAll(gBs, lines), 1, 3);
    const bioKl = lines.length / bio.ms; // k lines/sec (lines/ms == klines/s)
    const bsKl = lines.length / bs.ms;
    rows.push({
      format: fmt, lines: lines.length,
      biofmt_ms: bio.ms, biofmt_klines_s: bioKl, biofmt_tokens: bio.tokens,
      biosyntax_ms: bs.ms, biosyntax_klines_s: bsKl, biosyntax_tokens: bs.tokens,
      ratio_biofmt_over_biosyntax: bioKl / bsKl,
    });
    console.log(
      `${fmt.padEnd(8)} ${String(lines.length).padStart(6)}   ` +
      `${(bioKl.toFixed(0) + ' / ' + bio.tokens).padStart(22)}   ${(bsKl.toFixed(0) + ' / ' + bs.tokens).padStart(22)}   ${(bioKl / bsKl).toFixed(2)}x`
    );
  }

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bench_highlight.json'),
    JSON.stringify({ meta: { engine: 'vscode-textmate + vscode-oniguruma (same as VS Code)', linesPerFormat: NLINES, note: 'Both are TextMate grammars tokenized by the identical engine; this isolates grammar efficiency.' }, rows }, null, 2));
  console.log(`\nWrote ${rows.length} rows to results/bench_highlight.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
