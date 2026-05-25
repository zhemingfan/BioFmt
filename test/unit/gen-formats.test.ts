// SPDX-License-Identifier: GPL-3.0-or-later

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

function demoSpec(): FormatSpec {
  return {
    specVersion: 1,
    identity: {
      languageId: 'omics-demo',
      displayName: 'Demo Format',
      aliases: ['Demo'],
      extensions: ['.demo'],
      firstLine: null,
      scopeName: 'source.demo',
      languageConfiguration: { lineComment: '#', wordPattern: '[A-Za-z0-9_.]+' },
    },
    tokenize: {
      delimiter: 'tab',
      comment: { match: '^#.*$', scope: 'comment.line.number-sign' },
      lineKinds: [
        {
          name: 'data',
          kind: 'columns',
          columns: [
            { name: 'a', type: 'string', scope: 'string.unquoted.a' },
            { name: 'b', type: 'int', scope: 'constant.numeric.b' },
          ],
        },
      ],
    },
    validate: {
      skipPrefixes: [],
      rules: [
        {
          id: 'minColumns',
          code: 'DEMO-001',
          min: 2,
          severity: 'error',
          message: 'needs 2 columns',
          spec: { href: 'https://example.com', summary: 'two columns' },
        },
      ],
    },
    render: {
      renderer: 'table',
      commentPrefixes: ['#'],
      columns: [
        { key: 'a', label: 'a', type: 'string' },
        { key: 'b', label: 'b', type: 'int' },
      ],
      navigation: null,
    },
  };
}

describe('gen-formats: formatKey', () => {
  it('strips the omics- prefix', () => {
    assert.strictEqual(formatKey(demoSpec()), 'demo');
  });
});

describe('gen-formats: specToGrammar', () => {
  it('uses the spec scopeName and display name', () => {
    const g = specToGrammar(demoSpec());
    assert.strictEqual(g.scopeName, 'source.demo');
    assert.strictEqual(g.name, 'Demo Format');
  });

  it('includes a comment rule and the data rule in order', () => {
    const g = specToGrammar(demoSpec());
    assert.deepStrictEqual(g.patterns, [{ include: '#comment' }, { include: '#data' }]);
    assert.strictEqual(g.repository.comment.match, '^#.*$');
    assert.strictEqual(g.repository.comment.name, 'comment.line.number-sign.demo');
  });

  it('builds a tab-delimited data match with per-column capture scopes', () => {
    const g = specToGrammar(demoSpec());
    assert.strictEqual(g.repository.data.match, '^([^\\t]+)\\t([0-9]+)$');
    assert.deepStrictEqual(g.repository.data.captures, {
      '1': { name: 'string.unquoted.a.demo' },
      '2': { name: 'constant.numeric.b.demo' },
    });
  });

  it('omits the comment include when no comment is defined', () => {
    const spec = demoSpec();
    delete spec.tokenize.comment;
    const g = specToGrammar(spec);
    assert.deepStrictEqual(g.patterns, [{ include: '#data' }]);
    assert.ok(!('comment' in g.repository));
  });

  it('passes regex line kinds through with suffixed capture scopes', () => {
    const spec = demoSpec();
    spec.tokenize.comment = undefined;
    spec.tokenize.lineKinds = [
      { name: 'header', kind: 'regex', match: '^(@HD)\\b', captures: { '1': 'keyword.control.header' } },
    ];
    const g = specToGrammar(spec);
    assert.strictEqual(g.repository.header.match, '^(@HD)\\b');
    assert.deepStrictEqual(g.repository.header.captures, { '1': { name: 'keyword.control.header.demo' } });
  });
});

describe('gen-formats: specToLangConfig', () => {
  it('emits comments and wordPattern from the spec', () => {
    assert.deepStrictEqual(specToLangConfig(demoSpec()), {
      comments: { lineComment: '#' },
      wordPattern: '[A-Za-z0-9_.]+',
    });
  });

  it('defaults to a basic wordPattern and no comments when unspecified', () => {
    const spec = demoSpec();
    spec.identity.languageConfiguration = undefined;
    assert.deepStrictEqual(specToLangConfig(spec), { wordPattern: '[A-Za-z0-9_]+' });
  });
});

describe('gen-formats: specsToModule', () => {
  it('emits a typed, banner-marked module without $schema', () => {
    const src = specsToModule([demoSpec()]);
    assert.ok(src.includes('AUTO-GENERATED'), 'has banner');
    assert.ok(src.includes("import type { FormatSpec } from './formatSpec'"), 'imports type');
    assert.ok(src.includes('export const GENERATED_FORMATS: FormatSpec[] ='), 'exports array');
    assert.ok(src.includes('omics-demo'), 'includes the spec');
    assert.ok(!src.includes('$schema'), 'strips $schema');
  });

  it('is deterministic and sorted by languageId', () => {
    const a = demoSpec();
    const b = demoSpec();
    b.identity.languageId = 'omics-aaa';
    b.identity.scopeName = 'source.aaa';
    const src = specsToModule([a, b]);
    assert.ok(src.indexOf('omics-aaa') < src.indexOf('omics-demo'), 'aaa sorts before demo');
  });
});

describe('gen-formats: mergePackageJson', () => {
  function basePkg(): any {
    return {
      contributes: {
        languages: [{ id: 'omics-existing', aliases: ['E'], extensions: ['.e'] }],
        grammars: [{ language: 'omics-existing', scopeName: 'source.e', path: './syntaxes/e.tmLanguage.json' }],
      },
      activationEvents: ['onLanguage:omics-existing'],
    };
  }

  it('appends declarative entries without disturbing existing ones', () => {
    const merged = mergePackageJson(basePkg(), [demoSpec()]);
    const langIds = merged.contributes.languages.map((l: any) => l.id);
    assert.deepStrictEqual(langIds, ['omics-existing', 'omics-demo']);

    const demoLang = merged.contributes.languages.find((l: any) => l.id === 'omics-demo');
    assert.strictEqual(demoLang.configuration, './language-configuration/generated/demo.language-configuration.json');

    const demoGrammar = merged.contributes.grammars.find((g: any) => g.language === 'omics-demo');
    assert.strictEqual(demoGrammar.scopeName, 'source.demo');
    assert.strictEqual(demoGrammar.path, './syntaxes/generated/demo.tmLanguage.json');

    assert.ok(merged.activationEvents.includes('onLanguage:omics-demo'));
    assert.ok(merged.activationEvents.includes('onLanguage:omics-existing'));
  });

  it('is idempotent (re-merging produces an identical manifest)', () => {
    const once = mergePackageJson(basePkg(), [demoSpec()]);
    const twice = mergePackageJson(once, [demoSpec()]);
    assert.deepStrictEqual(twice, once);
  });

  it('does not mutate the input package object', () => {
    const pkg = basePkg();
    mergePackageJson(pkg, [demoSpec()]);
    assert.strictEqual(pkg.contributes.languages.length, 1);
  });
});

describe('gen-formats: validateSpec', () => {
  it('accepts a well-formed spec', () => {
    assert.deepStrictEqual(validateSpec(demoSpec()), []);
  });

  it('rejects a languageId without the omics- prefix', () => {
    const spec = demoSpec();
    spec.identity.languageId = 'demo';
    const errors = validateSpec(spec);
    assert.ok(errors.some((e: string) => e.includes('languageId')), errors.join('; '));
  });

  it('rejects a rule missing a code', () => {
    const spec = demoSpec();
    delete (spec.validate.rules[0] as any).code;
    const errors = validateSpec(spec);
    assert.ok(errors.some((e: string) => e.includes('code')), errors.join('; '));
  });
});

describe('gen-formats: findCollisions', () => {
  const existing = {
    languageIds: ['omics-bed'],
    extensions: ['.bed'],
    scopeNames: ['source.bed'],
  };

  it('returns no errors when a declarative spec is distinct', () => {
    assert.deepStrictEqual(findCollisions([demoSpec()], existing), []);
  });

  it('flags a languageId that shadows an existing format', () => {
    const spec = demoSpec();
    spec.identity.languageId = 'omics-bed';
    const errors = findCollisions([spec], existing);
    assert.ok(errors.some((e: string) => e.includes('omics-bed')), errors.join('; '));
  });

  it('flags an extension that collides with an existing format', () => {
    const spec = demoSpec();
    spec.identity.extensions = ['.bed'];
    const errors = findCollisions([spec], existing);
    assert.ok(errors.some((e: string) => e.includes('.bed')), errors.join('; '));
  });

  it('flags duplicate languageIds among declarative specs', () => {
    const a = demoSpec();
    const b = demoSpec();
    const errors = findCollisions([a, b], { languageIds: [], extensions: [], scopeNames: [] });
    assert.ok(errors.some((e: string) => e.includes('omics-demo')), errors.join('; '));
  });
});

describe('gen-formats: serialize', () => {
  it('produces 2-space JSON with a trailing newline', () => {
    assert.strictEqual(serialize({ a: 1 }), '{\n  "a": 1\n}\n');
  });
});
