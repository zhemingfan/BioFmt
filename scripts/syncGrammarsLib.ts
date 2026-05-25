// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pure transforms for the standalone grammar package sync.
 *
 * scripts/sync-grammars.ts is the thin CLI that copies the canonical grammars
 * (syntaxes/ + language-configuration/, including the generated/ subdirs) into
 * packages/grammars/ and writes manifest.json. buildManifest is kept here so it
 * is unit-testable and the manifest can be drift-checked.
 */

export interface ManifestEntry {
  scopeName: string;
  language: string;
  grammar: string;
  languageConfiguration: string | null;
  extensions: string[];
  aliases: string[];
}

function basename(p: string): string {
  return p.split('/').pop() as string;
}

/**
 * Build the grammar-package manifest from the extension's package.json contributes.
 * Paths are flattened to the package's grammars/ and language-configuration/ dirs so
 * non-VS Code consumers (Zed, Sublime, Linguist) can resolve them directly.
 */
export function buildManifest(pkg: any): ManifestEntry[] {
  const languagesById = new Map<string, any>(
    (pkg.contributes?.languages ?? []).map((l: any) => [l.id, l]),
  );

  return (pkg.contributes?.grammars ?? [])
    .map((g: any): ManifestEntry => {
      const lang = languagesById.get(g.language);
      return {
        scopeName: g.scopeName,
        language: g.language,
        grammar: `grammars/${basename(g.path)}`,
        languageConfiguration: lang?.configuration
          ? `language-configuration/${basename(lang.configuration)}`
          : null,
        extensions: lang?.extensions ?? [],
        aliases: lang?.aliases ?? [],
      };
    })
    .sort((a: ManifestEntry, b: ManifestEntry) => a.scopeName.localeCompare(b.scopeName));
}

/** Source grammar/language-configuration files (repo-relative) to copy into the package. */
export function collectSourceFiles(pkg: any): { grammars: string[]; languageConfigs: string[] } {
  const grammars: string[] = (pkg.contributes?.grammars ?? []).map((g: any) =>
    String(g.path).replace(/^\.\//, ''),
  );
  const configSet = new Set<string>();
  for (const lang of pkg.contributes?.languages ?? []) {
    if (typeof lang.configuration === 'string') {
      configSet.add(lang.configuration.replace(/^\.\//, ''));
    }
  }
  return { grammars, languageConfigs: Array.from(configSet) };
}
