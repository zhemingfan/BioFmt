// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import type { FormatSpec } from '../../src/shared/formatSpec';
import {
  specToGrammar,
  specToLangConfig,
  specsToModule,
  mergePackageJson,
  validateSpec,
  findCollisions,
  formatKey,
  serialize,
} from '../../scripts/genFormatsLib';

/**
 * Offline drift gate: re-runs the generator transforms in memory and asserts the
 * committed generated files match. Mirrors the CI `git diff --exit-code` check so
 * an edited /formats spec without `npm run gen:formats` fails the unit suite too.
 */

const ROOT = path.join(__dirname, '..', '..');
const FORMATS_DIR = path.join(ROOT, 'formats');

function loadSpecs(): { file: string; spec: FormatSpec }[] {
  return fs
    .readdirSync(FORMATS_DIR)
    .filter((f) => f.endsWith('.json') && f !== '_schema.json')
    .sort()
    .map((file) => ({
      file,
      spec: JSON.parse(fs.readFileSync(path.join(FORMATS_DIR, file), 'utf8')) as FormatSpec,
    }));
}

describe('generated files are up to date', () => {
  const specs = loadSpecs();
  const specList = specs.map((s) => s.spec);

  it('has at least one declarative format spec', () => {
    assert.ok(specs.length > 0, 'expected at least one /formats/*.json spec');
  });

  for (const { file, spec } of specs) {
    describe(`spec ${file}`, () => {
      it('is structurally valid', () => {
        assert.deepStrictEqual(validateSpec(spec), []);
      });

      it('has an up-to-date generated grammar', () => {
        const p = path.join(ROOT, 'syntaxes', 'generated', `${formatKey(spec)}.tmLanguage.json`);
        assert.ok(fs.existsSync(p), `missing ${p}`);
        assert.strictEqual(
          fs.readFileSync(p, 'utf8'),
          serialize(specToGrammar(spec)),
          `${file}: grammar out of date — run npm run gen:formats`,
        );
      });

      it('has an up-to-date generated language-configuration', () => {
        const p = path.join(
          ROOT,
          'language-configuration',
          'generated',
          `${formatKey(spec)}.language-configuration.json`,
        );
        assert.ok(fs.existsSync(p), `missing ${p}`);
        assert.strictEqual(
          fs.readFileSync(p, 'utf8'),
          serialize(specToLangConfig(spec)),
          `${file}: language-configuration out of date — run npm run gen:formats`,
        );
      });
    });
  }

  it('has an up-to-date generated module', () => {
    const p = path.join(ROOT, 'src', 'shared', 'generatedFormats.ts');
    assert.strictEqual(
      fs.readFileSync(p, 'utf8'),
      specsToModule(specList),
      'src/shared/generatedFormats.ts out of date — run npm run gen:formats',
    );
  });

  it('has package.json contributions in sync (re-merge is a no-op)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.deepStrictEqual(
      mergePackageJson(pkg, specList),
      pkg,
      'package.json contributions out of date — run npm run gen:formats',
    );
  });

  it('has no collisions between declarative and hand-written formats', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const ids = new Set(specList.map((s) => s.identity.languageId));
    const langs = pkg.contributes.languages.filter((l: any) => !ids.has(l.id));
    const grammars = pkg.contributes.grammars.filter((g: any) => !ids.has(g.language));
    assert.deepStrictEqual(
      findCollisions(specList, {
        languageIds: langs.map((l: any) => l.id),
        extensions: langs.flatMap((l: any) => l.extensions ?? []),
        scopeNames: grammars.map((g: any) => g.scopeName),
      }),
      [],
    );
  });
});
