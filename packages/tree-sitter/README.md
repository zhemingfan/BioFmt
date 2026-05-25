# @biofmt/tree-sitter (planned)

Tree-sitter grammars for the bioinformatics formats BioFmt supports. **Not yet
implemented** — this directory is a placeholder describing the intended approach.

## Why tree-sitter

The [`@biofmt/textmate-grammars`](../grammars) package already gives VS Code, Zed,
Sublime Text, and GitHub Linguist syntax highlighting. Neovim and Helix instead use
[tree-sitter](https://tree-sitter.github.io/tree-sitter/), which provides incremental
parsing and structural queries (folds, indents, text objects). Shipping tree-sitter
grammars extends BioFmt's reach to those editors.

## Intended approach: generate, don't hand-write

The 25+ formats are too many to hand-author and maintain as separate tree-sitter
grammars. Instead, generate them from the **same declarative format specs** that
already drive the TextMate grammars:

- Source of truth: [`/formats/*.json`](../../formats) (`tokenize` block: delimiter,
  per-column types/scopes, comment and header line patterns).
- A generator (sibling to [`scripts/gen-formats.ts`](../../scripts/gen-formats.ts))
  would emit a `grammar.js` per format plus `highlights.scm` queries, mapping the
  declarative column/regex line-kinds to tree-sitter node rules.
- Output would land in `packages/tree-sitter/<format>/` and publish as
  `@biofmt/tree-sitter`.

Because the column/regex line-kind model in the spec is intentionally simple, the
same description that produces a TextMate `match` regex can produce tree-sitter node
rules — keeping TextMate and tree-sitter grammars in lockstep from one source.

## Status

- [ ] Generator: declarative spec → `grammar.js` + `highlights.scm`
- [ ] Build pipeline (`tree-sitter generate`, prebuilt parsers)
- [ ] Per-editor install docs (Neovim `nvim-treesitter`, Helix `languages.toml`)

Contributions welcome — start from the declarative specs, not hand-written grammars.
