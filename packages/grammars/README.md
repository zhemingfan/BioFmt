# @biofmt/textmate-grammars

TextMate grammars and language configurations for genomics, transcriptomics, and
proteomics text formats — extracted from the [BioFmt](https://github.com/zhemingfan/BioFmt)
VS Code extension so any TextMate-compatible editor can reuse them.

Covers VCF, SAM, BED/BEDPE, GTF, GFF3, PSL, PAF, MAF, WIG, bedGraph, narrowPeak,
broadPeak, MTX, mzTab, MGF, GenBank, chain, net, GFA, FASTA, FASTQ, chrom.sizes,
Picard interval_list, and more.

> These grammars are generated/mirrored from the BioFmt repository. The canonical
> sources live under `syntaxes/` and `language-configuration/` in that repo; this
> package is kept byte-for-byte in sync by `scripts/sync-grammars.ts`.

## Install

```bash
npm install @biofmt/textmate-grammars
```

Grammars land at `node_modules/@biofmt/textmate-grammars/grammars/*.tmLanguage.json`
and language configurations at `.../language-configuration/*.json`.

## Layout

- `grammars/*.tmLanguage.json` — one TextMate grammar per format.
- `language-configuration/*.json` — VS Code-style language configs (comments, word patterns).
- `manifest.json` — machine-readable index: for each format, its `scopeName`,
  `grammar` path, `languageConfiguration` path, file `extensions`, and `aliases`.

`manifest.json` is the entry point for tooling — iterate it to discover every
grammar without hardcoding filenames:

```json
[
  {
    "scopeName": "source.vcf",
    "language": "omics-vcf",
    "grammar": "grammars/vcf.tmLanguage.json",
    "languageConfiguration": "language-configuration/vcf.language-configuration.json",
    "extensions": [".vcf"],
    "aliases": ["VCF", "Variant Call Format"]
  }
]
```

## Use it in your editor

### Zed

Zed consumes TextMate grammars. In an extension, reference the `.tmLanguage.json`
for the format you want and map its `scopeName` from `manifest.json`.

### Sublime Text

`.tmLanguage.json` files work with Sublime's TextMate-compatible syntax support.
Place a grammar under `Packages/User/` (converting to `.tmLanguage` plist if your
Sublime version requires it).

### GitHub Linguist

Linguist resolves highlighting by `scopeName`. Point a `grammars.yml` entry at the
grammar file and reference the matching `scopeName` from `manifest.json`.

### Neovim / Helix (tree-sitter)

These editors use tree-sitter rather than TextMate. Tree-sitter grammars are
planned — see [`packages/tree-sitter`](../tree-sitter) — and will be generated from
the same declarative format specs that drive these TextMate grammars.

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
