// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { buildManifest, collectSourceFiles } from '../../scripts/syncGrammarsLib';

const ROOT = path.join(__dirname, '..', '..');

function samplePkg(): any {
  return {
    contributes: {
      languages: [
        { id: 'omics-bed', aliases: ['BED'], extensions: ['.bed'], configuration: './language-configuration/basic.language-configuration.json' },
        { id: 'omics-chrom-sizes', aliases: ['chrom.sizes'], extensions: ['.sizes'], configuration: './language-configuration/generated/chrom-sizes.language-configuration.json' },
      ],
      grammars: [
        { language: 'omics-bed', scopeName: 'source.bed', path: './syntaxes/bed.tmLanguage.json' },
        { language: 'omics-chrom-sizes', scopeName: 'source.chrom-sizes', path: './syntaxes/generated/chrom-sizes.tmLanguage.json' },
      ],
    },
  };
}

describe('grammars manifest: buildManifest', () => {
  it('joins grammar and language metadata into flattened package paths', () => {
    const manifest = buildManifest(samplePkg());
    const bed = manifest.find((m) => m.scopeName === 'source.bed');
    assert.ok(bed);
    assert.strictEqual(bed!.language, 'omics-bed');
    assert.strictEqual(bed!.grammar, 'grammars/bed.tmLanguage.json');
    assert.strictEqual(bed!.languageConfiguration, 'language-configuration/basic.language-configuration.json');
    assert.deepStrictEqual(bed!.extensions, ['.bed']);
    assert.deepStrictEqual(bed!.aliases, ['BED']);
  });

  it('flattens generated subdirectory paths to a single grammars/ dir', () => {
    const manifest = buildManifest(samplePkg());
    const cs = manifest.find((m) => m.scopeName === 'source.chrom-sizes');
    assert.strictEqual(cs!.grammar, 'grammars/chrom-sizes.tmLanguage.json');
    assert.strictEqual(cs!.languageConfiguration, 'language-configuration/chrom-sizes.language-configuration.json');
  });

  it('is sorted by scopeName', () => {
    const manifest = buildManifest(samplePkg());
    const scopes = manifest.map((m) => m.scopeName);
    assert.deepStrictEqual(scopes, [...scopes].sort());
  });
});

describe('grammars manifest: committed package is in sync', () => {
  const pkgPath = path.join(ROOT, 'packages', 'grammars', 'manifest.json');

  it('exists', () => {
    assert.ok(fs.existsSync(pkgPath), 'packages/grammars/manifest.json missing — run npm run sync:grammars');
  });

  it('matches the manifest built from package.json contributes', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const committed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.deepStrictEqual(committed, buildManifest(rootPkg), 'manifest.json out of date — run npm run sync:grammars');
  });

  it('references grammar and language-configuration files that exist, with unique scopeNames', () => {
    const dir = path.join(ROOT, 'packages', 'grammars');
    const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Array<Record<string, any>>;
    const scopes = new Set<string>();
    for (const entry of manifest) {
      assert.ok(!scopes.has(entry.scopeName), `duplicate scopeName ${entry.scopeName}`);
      scopes.add(entry.scopeName);
      assert.ok(fs.existsSync(path.join(dir, entry.grammar)), `missing grammar file ${entry.grammar}`);
      if (entry.languageConfiguration) {
        assert.ok(
          fs.existsSync(path.join(dir, entry.languageConfiguration)),
          `missing language-configuration ${entry.languageConfiguration}`,
        );
      }
    }
  });

  it('covers every grammar contributed by the extension', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Array<Record<string, any>>;
    const manifestScopes = new Set(manifest.map((m) => m.scopeName));
    for (const g of rootPkg.contributes.grammars) {
      assert.ok(manifestScopes.has(g.scopeName), `manifest missing ${g.scopeName}`);
    }
  });

  it('has package copies byte-identical to the canonical sources', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const dir = path.join(ROOT, 'packages', 'grammars');
    const { grammars, languageConfigs } = collectSourceFiles(rootPkg);
    for (const src of [...grammars, ...languageConfigs]) {
      const sub = src.startsWith('syntaxes/') ? 'grammars' : 'language-configuration';
      const copy = path.join(dir, sub, path.basename(src));
      assert.ok(fs.existsSync(copy), `missing package copy of ${src} — run npm run sync:grammars`);
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        fs.readFileSync(path.join(ROOT, src), 'utf8'),
        `${src} drifted from its package copy — run npm run sync:grammars`,
      );
    }
  });
});
