// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mirror the canonical grammars into the standalone package (CLI).
 *
 * Copies every grammar (syntaxes/, incl. generated/) and language-configuration
 * referenced by package.json into packages/grammars/, flattened, and writes
 * manifest.json. The extension root stays the single source of truth; this keeps
 * the publishable @biofmt/textmate-grammars package in sync (drift-checked in CI).
 *
 * Run: npm run sync:grammars
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildManifest, collectSourceFiles } from './syncGrammarsLib';
import { serialize } from './genFormatsLib';

const ROOT = path.join(__dirname, '..');
const PKG_DIR = path.join(ROOT, 'packages', 'grammars');
const GRAMMARS_OUT = path.join(PKG_DIR, 'grammars');
const LANGCFG_OUT = path.join(PKG_DIR, 'language-configuration');

function writeIfChanged(file: string, contents: string): boolean {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === contents) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

function copyFlat(sources: string[], outDir: string): string[] {
  const written: string[] = [];
  const seen = new Map<string, string>();
  for (const src of sources) {
    const base = path.basename(src);
    const prior = seen.get(base);
    if (prior && prior !== src) {
      throw new Error(`grammar package filename collision: "${base}" from both ${prior} and ${src}`);
    }
    seen.set(base, src);
    const contents = fs.readFileSync(path.join(ROOT, src), 'utf8');
    if (writeIfChanged(path.join(outDir, base), contents)) {
      written.push(path.relative(ROOT, path.join(outDir, base)));
    }
  }
  return written;
}

function main(): void {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const { grammars, languageConfigs } = collectSourceFiles(pkg);

  const written: string[] = [];
  written.push(...copyFlat(grammars, GRAMMARS_OUT));
  written.push(...copyFlat(languageConfigs, LANGCFG_OUT));

  if (writeIfChanged(path.join(PKG_DIR, 'manifest.json'), serialize(buildManifest(pkg)))) {
    written.push('packages/grammars/manifest.json');
  }

  console.log(`sync-grammars: ${grammars.length} grammars, ${languageConfigs.length} language-configurations`);
  if (written.length === 0) {
    console.log('sync-grammars: package already up to date');
  } else {
    console.log(`sync-grammars: updated ${written.length} file(s)`);
  }
}

main();
