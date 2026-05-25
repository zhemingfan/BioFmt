// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Declarative format generator (CLI).
 *
 * Reads /formats/*.json and fans each spec out to:
 *   - syntaxes/generated/<key>.tmLanguage.json            (TextMate grammar)
 *   - language-configuration/generated/<key>.language-configuration.json
 *   - src/shared/generatedFormats.ts                      (GENERATED_FORMATS module)
 *   - package.json contributes.languages/grammars + activationEvents (idempotent merge)
 *
 * Validates each spec and refuses to shadow an existing hand-written format.
 * All transform logic lives in genFormatsLib.ts (unit-tested); this file is I/O.
 *
 * Run: npm run gen:formats
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FormatSpec } from '../src/shared/formatSpec';
import {
  specToGrammar,
  specToLangConfig,
  specsToModule,
  mergePackageJson,
  validateSpec,
  findCollisions,
  formatKey,
  serialize,
  type ExistingRegistry,
} from './genFormatsLib';

const ROOT = path.join(__dirname, '..');
const FORMATS_DIR = path.join(ROOT, 'formats');
const SYNTAXES_GEN_DIR = path.join(ROOT, 'syntaxes', 'generated');
const LANGCFG_GEN_DIR = path.join(ROOT, 'language-configuration', 'generated');
const GENERATED_MODULE = path.join(ROOT, 'src', 'shared', 'generatedFormats.ts');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

function loadSpecs(): FormatSpec[] {
  const files = fs
    .readdirSync(FORMATS_DIR)
    .filter((f) => f.endsWith('.json') && f !== '_schema.json')
    .sort();
  const specs: FormatSpec[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(FORMATS_DIR, file), 'utf8'));
    const specErrors = validateSpec(raw);
    if (specErrors.length > 0) {
      errors.push(`formats/${file}:\n  - ${specErrors.join('\n  - ')}`);
    } else {
      specs.push(raw as FormatSpec);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Invalid format spec(s):\n${errors.join('\n')}`);
  }
  return specs;
}

function existingRegistry(pkg: any, specIds: Set<string>): ExistingRegistry {
  const langs = (pkg.contributes?.languages ?? []).filter((l: any) => !specIds.has(l.id));
  const grammars = (pkg.contributes?.grammars ?? []).filter((g: any) => !specIds.has(g.language));
  return {
    languageIds: langs.map((l: any) => l.id),
    extensions: langs.flatMap((l: any) => l.extensions ?? []),
    scopeNames: grammars.map((g: any) => g.scopeName),
  };
}

function writeIfChanged(file: string, contents: string): boolean {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === contents) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return true;
}

function main(): void {
  const specs = loadSpecs();

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const specIds = new Set(specs.map((s) => s.identity.languageId));
  const collisions = findCollisions(specs, existingRegistry(pkg, specIds));
  if (collisions.length > 0) {
    throw new Error(`Declarative format collisions:\n  - ${collisions.join('\n  - ')}`);
  }

  const written: string[] = [];

  for (const spec of specs) {
    const key = formatKey(spec);
    if (writeIfChanged(path.join(SYNTAXES_GEN_DIR, `${key}.tmLanguage.json`), serialize(specToGrammar(spec)))) {
      written.push(`syntaxes/generated/${key}.tmLanguage.json`);
    }
    if (
      writeIfChanged(
        path.join(LANGCFG_GEN_DIR, `${key}.language-configuration.json`),
        serialize(specToLangConfig(spec)),
      )
    ) {
      written.push(`language-configuration/generated/${key}.language-configuration.json`);
    }
  }

  if (writeIfChanged(GENERATED_MODULE, specsToModule(specs))) {
    written.push('src/shared/generatedFormats.ts');
  }

  const merged = mergePackageJson(pkg, specs);
  if (writeIfChanged(PACKAGE_JSON, JSON.stringify(merged, null, 2) + '\n')) {
    written.push('package.json');
  }

  const ids = specs.map((s) => s.identity.languageId).join(', ');
  console.log(`gen-formats: ${specs.length} declarative format(s) [${ids}]`);
  if (written.length === 0) {
    console.log('gen-formats: all generated files already up to date');
  } else {
    console.log(`gen-formats: updated ${written.length} file(s):\n  - ${written.join('\n  - ')}`);
  }
}

main();
