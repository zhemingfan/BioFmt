# Changelog

All notable changes to BioFmt will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-02-21

### Added

- VCF preview: click CHROM or POS column header to sort ascending/descending (▲/▼ indicator); CHROM uses natural chromosome ordering (chr1 < chr2 < chr10 < chrX) with POS as tiebreaker
- VCF preview: global "Search all fields" text input searches the raw VCF line, covering INFO values, sample data, and every column at once
- VCF preview: "Export VCF" button reconstructs a valid VCF file (original header + filtered/sorted rows) and downloads it as `_filtered.vcf`

### Fixed

- VCF export: no trailing newline when exporting header-only (no matching rows)

### Tests

- Added 56 new unit tests covering sort, filter (including global search), export, and the NaN-POS guard (307 total, 0 failing)

## [0.1.1] - 2026-02-20

### Changed

- VCF preview: replaced Min QUAL and INFO field filters with ID text search (substring match)
- VCF preview: row click now opens a fixed bottom detail panel instead of expanding inline
- VCF preview: all table columns are now drag-resizable; table scrolls horizontally when columns exceed viewport width

## [0.1.0] - 2026-02-03

### Added

#### VCF Support
- TextMate grammar with syntax highlighting for all VCF fields
- Distinct coloring for CHROM, POS, ID, REF, ALT, QUAL, FILTER, INFO, FORMAT
- 15 FORMAT field type groups with color-blind friendly palette
- LSP hover showing INFO/FORMAT field definitions from header
- Real-time validation for:
  - Missing `##fileformat` declaration
  - Column count mismatches
  - Invalid QUAL values
  - Unknown INFO keys (strict mode)
- Interactive preview with:
  - Virtualized table (handles 200K+ variants)
  - Color-coded INFO key=value pairs
  - Color-coded FORMAT fields (GT, AD, DP, GQ, PL, etc.)
  - Expandable row details
  - Filter by chromosome, quality score, FILTER status
  - Filter by INFO field values with comparison operators
  - Sample column limiting (10 default, expandable)
  - Header panel with collapsible metadata sections

#### Additional Format Support
- SAM: Syntax highlighting, validation, table preview
- BED/BEDPE/narrowPeak/broadPeak: Syntax highlighting, validation, table preview
- GTF/GFF3: Syntax highlighting, validation, table preview
- PSL: Syntax highlighting, validation, table preview
- PAF: Syntax highlighting, validation, table preview
- WIG/bedGraph: Syntax highlighting, validation, track plot preview
- MAF (alignment): Syntax highlighting, block view preview
- MAF (mutation): Syntax highlighting, table preview
- GenBank: Syntax highlighting, outline preview
- MTX (Matrix Market): Syntax highlighting, sparse matrix preview
- mzTab: Syntax highlighting, table preview
- MGF: Syntax highlighting, spectrum plot preview
- Chain: Syntax highlighting, chain table with expandable alignment blocks
- Net: Syntax highlighting, hierarchical fill/gap tree view
- GFA: Syntax highlighting, tabbed view (Segments, Links, Paths, Header)

#### Core Features
- Single LSP server handling all formats
- Viewport-aware validation (validates ~500 lines around cursor)
- Chunked data loading protocol for large files
- react-window virtualization for preview performance
- VS Code theme integration (respects light/dark/high-contrast)
- Commands: Open Preview, Copy Row as TSV, Copy Cell as JSON
- Text search filtering across all preview tables
- TSV export for all preview tables
- Resizable columns in all preview tables

### Performance Targets Met
- Header parse: <50ms
- First render: <200ms
- Hover response: <100ms
