# BioFmt

**High-fidelity viewer for bioinformatics file formats in VS Code**

BioFmt provides syntax highlighting, intelligent hover tooltips, real-time validation, and interactive previews for 25 genomics, transcriptomics, and proteomics file formats.

## Features

- **Syntax highlighting** via TextMate grammars for all 25 formats
- **LSP-powered diagnostics** with viewport-aware validation (~500 lines around cursor)
- **Hover tooltips** for VCF INFO/FORMAT field definitions from file headers
- **Interactive previews** with virtualized tables handling 200K+ rows, resizable columns, text search, and TSV export
- **Automatic format detection** via file extension and `firstLine` content matching

## Supported Formats

| Format | Highlighting | Validation | Preview |
|--------|:-----------:|:----------:|---------|
| VCF | Yes | Yes | Interactive table with sample data, genotype coloring, expandable rows |
| SAM | Yes | Yes | Alignment table with FLAG decoding, optional tag expansion |
| BED | Yes | Yes | Table with chromosome filter |
| BEDPE | Yes | Yes | Paired-end table with chromosome filter |
| GTF | Yes | Yes | Annotation table with feature/source filter, attribute expansion |
| GFF3 | Yes | Yes | Annotation table with feature/source filter, attribute expansion |
| PSL | Yes | Yes | Alignment table with block visualization |
| PAF | Yes | Yes | Alignment table with tag expansion |
| MAF (alignment) | Yes | - | Multi-alignment block view with nucleotide coloring |
| MAF (mutation) | Yes | - | Mutation table |
| WIG | Yes | Yes | Track plot with downsampling |
| bedGraph | Yes | Yes | Track plot with downsampling |
| narrowPeak | Yes | Yes | Peak table |
| broadPeak | Yes | Yes | Peak table |
| GenBank | Yes | - | Feature outline |
| MTX | Yes | - | Sparse matrix view |
| mzTab | Yes | - | Section-tabbed table |
| MGF | Yes | - | Spectrum list |
| Chain | Yes | - | Chain table with expandable alignment blocks |
| Net | Yes | - | Hierarchical fill/gap tree view |
| GFA | Yes | - | Tabbed view (Segments, Links, Paths, Header) |
| PED | Yes | - | Table |
| MAP | Yes | - | Table |
| GCT | Yes | - | Table |

All preview tables support **text search** and **TSV export**.

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "BioFmt"
4. Click Install

## Usage

### Open a File

Open any supported file format (`.vcf`, `.sam`, `.bed`, etc.). BioFmt automatically activates based on file extension or first-line content.

### Open Preview

Click the preview icon in the editor title bar, or use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **BioFmt: Open Preview**.

### Hover for Field Info

In VCF files, hover over INFO or FORMAT field keys to see their definitions from the file header.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `biofmt.preview.maxLines` | 200,000 | Maximum lines to load in preview |
| `biofmt.preview.maxBytes` | 50 MB | Maximum file size for preview |
| `biofmt.preview.downsampleLimit` | 200,000 | Max points in track plots before downsampling |
| `biofmt.preview.sampleColumnLimit` | 10 | VCF sample columns shown initially |
| `biofmt.validation.level` | `basic` | Validation strictness (`off` / `basic` / `strict`) |
| `biofmt.validation.maxDiagnostics` | 2,000 | Maximum diagnostics per file |
| `biofmt.lsp.viewportBufferLines` | 500 | Lines around cursor to validate |

## Requirements

- VS Code 1.85.0 or higher

## License

GPL-3.0 License - see [LICENSE](LICENSE.txt) for details.

## Release Notes

See [CHANGELOG](CHANGELOG.md) for version history.
