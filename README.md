# BioFmt

**High-fidelity viewer for bioinformatics file formats in VS Code**

BioFmt provides syntax highlighting, intelligent hover tooltips, real-time validation, and previews for genomics, transcriptomics, and proteomics file formats.

## Features

### VCF (Variant Call Format)

- **Rich syntax highlighting** with distinct colors for CHROM, POS, REF, ALT, QUAL, FILTER, INFO, and FORMAT fields
- **Intelligent hover** showing INFO/FORMAT field descriptions from VCF header
- **Real-time validation** detecting malformed lines, invalid QUAL values, and column count mismatches
- **Interactive preview** with:
  - Virtualized table handling 200K+ variants
  - Color-coded INFO and FORMAT fields
  - Expandable row details
  - Filter by chromosome, quality, or INFO fields
  - Sample column limiting (10 by default, expandable)

### Additional Formats

BioFmt also supports:

| Format | Highlighting | Validation | Preview |
|--------|-------------|------------|---------|
| SAM    | Yes | Yes | Table |
| BED    | Yes | Yes | Table |
| BEDPE  | Yes | Yes | Table |
| GTF/GFF3 | Yes | Yes | Table |
| PSL    | Yes | Yes | Table |
| PAF    | Yes | Yes | Table |
| WIG/bedGraph | Yes | Yes | Track Plot |
| MAF (alignment) | Yes | - | Block View |
| MAF (mutation) | Yes | - | Table |
| GenBank | Yes | - | Outline |
| MTX    | Yes | - | Sparse Matrix |
| mzTab  | Yes | - | Table |
| MGF    | Yes | - | Spectrum Plot |

## Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "BioFmt"
4. Click Install

## Usage

### Open a File

Simply open any supported file format (`.vcf`, `.sam`, `.bed`, etc.). BioFmt automatically activates based on file extension.

### Open Preview

Click the preview icon in the editor title bar, or:
- Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
- Type "BioFmt: Open Preview"

### Hover for Field Info

In VCF files, hover over INFO or FORMAT field keys to see their definitions from the file header.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `biofmt.preview.maxLines` | 200000 | Maximum lines to load in preview |
| `biofmt.preview.sampleColumnLimit` | 10 | VCF samples shown initially |
| `biofmt.validation.level` | "basic" | Validation strictness (off/basic/strict) |
| `biofmt.validation.maxDiagnostics` | 2000 | Maximum diagnostics per file |


## Requirements

- VS Code 1.85.0 or higher

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Issues and pull requests welcome at [GitHub](https://github.com/biofmt/biofmt).

## Release Notes

See [CHANGELOG](CHANGELOG.md) for version history.
