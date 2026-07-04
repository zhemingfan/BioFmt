// SPDX-License-Identifier: GPL-3.0-or-later
//
// DEV-ONLY. Downloads and slices real-world fixtures declared in
// test/fixtures/real/sources.json, writes provenance, and pins sha256 back into
// the manifest. Requires network and (for indexed entries) `tabix`/`bgzip`.
//
// This script is NEVER run by the test suite or CI — tests read only the
// committed artifacts. Run manually:
//
//   npm run fetch:fixtures            # all entries
//   npm run fetch:fixtures -- --only giab_hg002_vcf kg_1000g_chr22_vcf
//
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { spawn, spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'test', 'fixtures', 'real', 'sources.json');
const PROVENANCE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'real', 'provenance');

interface Entry {
  id: string;
  languageId: string;
  license: string;
  attribution: string;
  build: string;
  obtain: 'direct' | 'head' | 'grep-slice' | 'gunzip-grep-slice' | 'tabix';
  source: string;
  region?: string;
  sliceChromPrefix?: string;
  sliceRows?: number;
  headDataRows?: number;
  out: string;
  sha256: string;
  expect: Record<string, unknown>;
}

interface Manifest {
  version: number;
  root: string;
  entries: Entry[];
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function curlTo(url: string, dest: string): void {
  ensureDir(dest);
  const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '600', url, '-o', dest], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error(`curl failed (${r.status}) for ${url}`);
}

/** Stream lines from a plain or gzipped file, keeping comments plus a bounded
 *  set of data lines, then stop early. Returns the number of data lines kept. */
async function sliceLines(
  srcFile: string,
  outFile: string,
  opts: { gzip: boolean; chromPrefix?: string; dataRows: number }
): Promise<number> {
  ensureDir(outFile);
  const input = opts.gzip
    ? spawn('gzip', ['-dc', srcFile]).stdout!
    : fs.createReadStream(srcFile);
  const out = fs.createWriteStream(outFile);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let kept = 0;
  for await (const line of rl) {
    if (line.startsWith('#')) {
      out.write(line + '\n');
      continue;
    }
    if (opts.chromPrefix && !line.startsWith(opts.chromPrefix)) continue;
    out.write(line + '\n');
    if (++kept >= opts.dataRows) break;
  }
  // Break-then-close avoids "readline was closed" from closing mid-iteration.
  rl.close();
  (input as unknown as { destroy?: () => void }).destroy?.();
  await new Promise<void>((res) => out.end(res));
  return kept;
}

function tabixSlice(source: string, region: string, outGz: string): void {
  ensureDir(outGz);
  // `tabix -h <url> <region>` fetches the remote .tbi and range-reads over HTTP.
  const r = spawnSync('bash', ['-c', `tabix -h "${source}" "${region}" | bgzip -c > "${outGz}"`], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Remote tabix caches the downloaded index as <basename>.tbi in the cwd; drop it.
  const cachedIndex = path.join(process.cwd(), path.basename(source) + '.tbi');
  if (fs.existsSync(cachedIndex)) fs.rmSync(cachedIndex, { force: true });
  if (r.status !== 0) throw new Error(`tabix slice failed for ${source} ${region}`);
  const idx = spawnSync('tabix', ['-f', '-p', 'vcf', outGz], { stdio: 'inherit' });
  if (idx.status !== 0) throw new Error(`tabix reindex failed for ${outGz}`);
}

function nonCommentRows(file: string, gzip: boolean): number {
  const data = gzip
    ? spawnSync('gzip', ['-dc', file], { maxBuffer: 1 << 30 }).stdout.toString()
    : fs.readFileSync(file, 'utf8');
  return data.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith('#')).length;
}

async function processEntry(entry: Entry, tmpDir: string): Promise<void> {
  const outAbs = path.join(REPO_ROOT, entry.out);
  const tmp = path.join(tmpDir, entry.id);
  let command = '';

  if (entry.obtain === 'direct') {
    curlTo(entry.source, outAbs);
    command = `curl -sSL ${entry.source} -o ${entry.out}`;
  } else if (entry.obtain === 'head') {
    curlTo(entry.source, tmp);
    const kept = await sliceLines(tmp, outAbs, { gzip: false, dataRows: entry.headDataRows ?? 50 });
    command = `curl ${entry.source} | head (kept ${kept} data rows)`;
  } else if (entry.obtain === 'grep-slice') {
    curlTo(entry.source, tmp);
    const kept = await sliceLines(tmp, outAbs, {
      gzip: false,
      chromPrefix: entry.sliceChromPrefix,
      dataRows: entry.sliceRows ?? 200,
    });
    command = `curl ${entry.source} | grep "^${entry.sliceChromPrefix}" (kept ${kept})`;
  } else if (entry.obtain === 'gunzip-grep-slice') {
    curlTo(entry.source, tmp + '.gz');
    const kept = await sliceLines(tmp + '.gz', outAbs, {
      gzip: true,
      chromPrefix: entry.sliceChromPrefix,
      dataRows: entry.sliceRows ?? 300,
    });
    command = `curl ${entry.source} | gzip -dc | grep "^${entry.sliceChromPrefix}" (kept ${kept})`;
  } else if (entry.obtain === 'tabix') {
    tabixSlice(entry.source, entry.region!, outAbs);
    command = `tabix -h ${entry.source} ${entry.region} | bgzip; tabix -p vcf`;
  } else {
    throw new Error(`Unknown obtain type: ${entry.obtain}`);
  }

  const hash = sha256(outAbs);
  entry.sha256 = hash;

  fs.mkdirSync(PROVENANCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PROVENANCE_DIR, `${entry.id}.json`),
    JSON.stringify(
      {
        id: entry.id,
        source: entry.source,
        obtain: entry.obtain,
        command,
        out: entry.out,
        sha256: hash,
        license: entry.license,
        attribution: entry.attribution,
        build: entry.build,
        generated_at_utc: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );

  const rows = nonCommentRows(outAbs, outAbs.endsWith('.gz'));
  console.log(`  ok ${entry.id}: ${rows} data rows, sha256=${hash.slice(0, 12)}…`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(args.slice(onlyIdx + 1)) : null;

  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'biofmt-fixtures-'));

  let ok = 0;
  let failed = 0;
  for (const entry of manifest.entries) {
    if (only && !only.has(entry.id)) continue;
    console.log(`==> ${entry.id} (${entry.obtain})`);
    try {
      await processEntry(entry, tmpDir);
      ok++;
    } catch (err) {
      failed++;
      console.error(`  FAILED ${entry.id}: ${(err as Error).message}`);
    }
  }

  // Pin checksums for whatever succeeded.
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nDone: ${ok} ok, ${failed} failed. Checksums pinned in sources.json.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
