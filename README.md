# BioFmt

BioFmt is a VS Code extension for inspecting genomics, transcriptomics, and proteomics files. It adds syntax highlighting, spec-referenced validation, and interactive previews for 27 bioinformatics formats, including indexed and binary files.

<img src="docs/VCF_preview.png" alt="VCF preview panel showing a sortable, filterable table of somatic structural variants" width="800">

## Highlights

| Capability | What you get |
|------------|--------------|
| Syntax highlighting | Grammars for headers, records, intervals, alignments, sequences, and track files. |
| Spec-linked diagnostics | Validation squiggles carry stable rule codes and links to public format specifications. |
| Interactive previews | Virtualized tables, search, sorting, resizable columns, format-specific renderers, and TSV export. |
| Indexed and binary files | Direct region queries for `.vcf.gz`, `.bed.gz`, `.gff3.gz`, and `.bam` files with matching indexes. |
| Workspace lint | Optional validation for supported files across the workspace, surfaced in the Problems panel. |

## Documentation

- [Feature gallery](docs/features.md)
- [Validation and diagnostics](docs/validation.md)
- [Diagnostic rule reference](docs/rules.md)
- [Indexed and binary files](docs/indexed-files.md)
- [Configuration](docs/configuration.md)

## Quick Start

1. Install **BioFmt** from the VS Code Extensions panel.
2. Open a supported file such as `.vcf`, `.sam`, `.bed`, `.gff3`, `.fasta`, `.fastq`, `.mgf`, or `.bam`.
3. Run **BioFmt: Open Preview** from the Command Palette, or click the preview icon in the editor title bar.
4. Hover diagnostics or VCF INFO/FORMAT keys to see rule, field, and specification details.

## Supported Formats

Validated formats with specialized previews: VCF, SAM/BAM, BED, BEDPE, GTF, GFF3, FASTA, FASTQ, PSL, PAF, WIG, bedGraph, narrowPeak, and broadPeak.

Specialized previews without validation: MAF alignment, MAF mutation, GenBank, MTX Matrix Market, mzTab, MGF, Chain, Net, and GFA.

Generic previews: PED, MAP, GCT, HTSeq, Salmon, and Kallisto.

## Requirements

VS Code 1.85.0 or higher.

## License

GPL-3.0. See [LICENSE](LICENSE).

## Changelog

See [CHANGELOG](CHANGELOG.md).
