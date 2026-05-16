# Feature Gallery

## Diagnostics

| Spec-linked diagnostics | Strict validation |
|-------------------------|-------------------|
| <img src="gallery-spec-validation.png" alt="Hovering a diagnostic squiggle shows the rule code with a clickable link to the format specification" width="390"> | <img src="gallery-strict-validation.png" alt="Strict validation diagnostics showing multiple format-specific rule violations" width="390"> |
| Hover a squiggle to see the violated rule and jump to the source specification. | Strict mode catches cross-field and semantic issues that basic structure checks miss. |

## Previews

| FASTQ quality view | Indexed region navigation |
|--------------------|---------------------------|
| <img src="gallery-fastq-heatmap.png" alt="FASTQ preview showing expanded read with per-base quality heatmap colored by Phred score" width="390"> | <img src="gallery-region-navigator.png" alt="Region navigator showing genomic coordinate input and record count for an indexed VCF file" width="390"> |
| Inspect per-base quality with a Phred score heatmap. | Query indexed genomic files by coordinates without decompressing them first. |

## Workspace Lint

<img src="workspace-lint.png" alt="Problems panel showing diagnostics for multiple bioinformatics files across the workspace" width="800">

Enable workspace lint with `biofmt.workspace.enableLint` to validate supported files across a workspace and review issues in the Problems panel.

## Format-Specific Preview Features

| Format family | Preview features |
|---------------|------------------|
| VCF | INFO/FORMAT parsing, sample hover tooltips, FILTER badges, chromosome sorting |
| SAM/BAM | FLAG decoding, tag parsing, alignment details |
| WIG/bedGraph | Downsampled track plots |
| MGF | Spectrum plots |
| GenBank | Feature outline view |
| GFA | Segments, links, and paths tabs |
| FASTA | Per-base coloring for A/T/G/C/N |
| FASTQ | Per-base quality heatmap |
