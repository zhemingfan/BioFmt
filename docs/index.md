# BioFmt Documentation

BioFmt helps inspect bioinformatics files in VS Code with syntax highlighting, validation, interactive previews, and indexed region navigation.

<img src="VCF_preview.png" alt="VCF preview panel showing a sortable, filterable table of somatic structural variants" width="800">

## Guides

- [Feature gallery](features.md)
- [Validation and diagnostics](validation.md)
- [Diagnostic rule reference](rules.md)
- [Indexed and binary files](indexed-files.md)
- [Configuration](configuration.md)

## Core Capabilities

| Capability | What you get |
|------------|--------------|
| Syntax highlighting | Grammars for headers, fields, records, intervals, alignments, sequence data, and track files. |
| Spec-referenced diagnostics | Validation squiggles include stable rule codes and links to public format specifications. |
| Interactive previews | Virtualized tables, search, sorting, drag-resizable columns, format-specific renderers, and TSV export. |
| Indexed and binary files | Direct opening for `.vcf.gz`, `.bed.gz`, `.gff3.gz`, and `.bam` with genomic region navigation. |
| Workspace lint | Optional workspace-wide validation that reports file issues in the VS Code Problems panel. |

## Supported Formats

Validated formats with specialized previews: VCF, SAM/BAM, BED, BEDPE, GTF, GFF3, FASTA, FASTQ, PSL, PAF, WIG, bedGraph, narrowPeak, and broadPeak.

Specialized previews without validation: MAF alignment, MAF mutation, GenBank, MTX Matrix Market, mzTab, MGF, Chain, Net, and GFA.

Generic previews: PED, MAP, and GCT.
