// SPDX-License-Identifier: GPL-3.0-or-later
//
// Offline verification of the committed real-world fixtures. Never touches the
// network (that is scripts/fetch-real-fixtures.ts, run manually). For each
// manifest entry with a committed file, this asserts the packaging contract and
// that BioFmt's real validator processes the real file without crashing.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { unzip } from '@gmod/bgzf-filehandle';
import { TabixIndexedFile } from '@gmod/tabix';
import { getValidator } from '../../server/src/validators';
import { defaultSettings, type ValidatorContext } from '../../server/src/validators/types';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(REPO_ROOT, 'test', 'fixtures', 'real', 'sources.json');

interface Entry {
  id: string;
  languageId: string;
  out: string;
  sha256: string;
  expect: { minRows: number; regionQuery?: string; maxDiagnostics?: number };
}

const manifest: { entries: Entry[] } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

async function readText(abs: string): Promise<string> {
  const buf = fs.readFileSync(abs);
  if (abs.endsWith('.gz')) {
    const out = await unzip(buf);
    return Buffer.from(out).toString('utf8');
  }
  return buf.toString('utf8');
}

function sha256(abs: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function dataRows(text: string): number {
  return text.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith('#')).length;
}

describe('real-world fixtures', () => {
  // Guard against the committed set silently shrinking: a manifest entry that has
  // a pinned sha256 was fetched and committed, so its file (and index, for
  // indexed entries) must still be present. Removing a fixture therefore requires
  // a visible edit to sources.json — it can't quietly vanish while tests stay
  // green (the per-entry checks below skip absent files by design).
  it('every pinned fixture (and its index) is committed', () => {
    const missing: string[] = [];
    for (const entry of manifest.entries) {
      if (!entry.sha256) continue; // not yet fetched/pinned — allowed to be absent
      const abs = path.join(REPO_ROOT, entry.out);
      if (!fs.existsSync(abs)) missing.push(entry.out);
      if (entry.expect.regionQuery && !fs.existsSync(`${abs}.tbi`)) {
        missing.push(`${entry.out}.tbi`);
      }
    }
    assert.deepStrictEqual(
      missing,
      [],
      `pinned fixtures missing from the repo (clear their sha256 in sources.json to intentionally drop them): ${missing.join(', ')}`
    );
  });

  for (const entry of manifest.entries) {
    const abs = path.join(REPO_ROOT, entry.out);

    describe(entry.id, () => {
      if (!fs.existsSync(abs)) {
        it('is fetched (run: npm run fetch:fixtures)', function () {
          this.skip();
        });
        return;
      }

      it('matches the pinned sha256', () => {
        if (!entry.sha256) return; // not pinned yet
        assert.strictEqual(sha256(abs), entry.sha256, `checksum drift in ${entry.out}`);
      });

      it('is a format BioFmt supports', () => {
        assert.strictEqual(
          typeof getValidator(entry.languageId),
          'function',
          `no validator for ${entry.languageId}`
        );
      });

      it('validates without throwing (robustness)', async () => {
        const text = await readText(abs);
        const validator = getValidator(entry.languageId)!;
        const lineCount = text.split(/\r?\n/).length;
        const ctx: ValidatorContext = {
          uri: `file://${abs}`,
          lineCount,
          headerEndLine: 0,
          bufferLines: 5000,
          visibleRanges: [{ startLine: 0, endLine: lineCount }],
        };
        let diags: unknown;
        assert.doesNotThrow(() => {
          diags = validator(text, defaultSettings, ctx);
        });
        assert.ok(Array.isArray(diags), 'validator did not return a diagnostics array');
      });

      it('produces no false-positive diagnostics (canonical data is valid)', async () => {
        // These fixtures are canonical output from the tools/portals themselves,
        // so a valid one should validate clean. Any diagnostic here is almost
        // certainly a validator false positive on real-world data. `maxDiagnostics`
        // (default 0) is the escape hatch if a fixture ever has a genuine advisory.
        const text = await readText(abs);
        const validator = getValidator(entry.languageId)!;
        const lineCount = text.split(/\r?\n/).length;
        const ctx: ValidatorContext = {
          uri: `file://${abs}`,
          lineCount,
          headerEndLine: 0,
          bufferLines: 5000,
          visibleRanges: [{ startLine: 0, endLine: lineCount }],
        };
        const diags = validator(text, defaultSettings, ctx);
        const allowed = entry.expect.maxDiagnostics ?? 0;
        const sample = diags
          .slice(0, 3)
          .map((d) => `L${d.range.start.line + 1} [${d.code || ''}] ${d.message}`)
          .join(' | ');
        assert.ok(
          diags.length <= allowed,
          `canonical fixture produced ${diags.length} diagnostic(s) (allowed ${allowed}): ${sample}`
        );
      });

      it(`has at least ${entry.expect.minRows} data rows`, async () => {
        const text = await readText(abs);
        const n = dataRows(text);
        assert.ok(n >= entry.expect.minRows, `expected >= ${entry.expect.minRows} rows, got ${n}`);
      });

      if (entry.expect.regionQuery) {
        it('answers an indexed region query via @gmod/tabix', async () => {
          const tbi = `${abs}.tbi`;
          assert.ok(fs.existsSync(tbi), `missing index: ${tbi}`);
          const [chrom, range] = entry.expect.regionQuery!.split(':');
          const [start, end] = range.split('-').map((v) => Number(v));
          const t = new TabixIndexedFile({ path: abs, tbiPath: tbi });
          const lines: string[] = [];
          await t.getLines(chrom, start, end, { lineCallback: (l: string) => lines.push(l) });
          assert.ok(lines.length > 0, 'region query returned no records');
        });
      }
    });
  }
});
