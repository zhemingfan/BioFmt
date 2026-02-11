# SPEC.md — BioFmt VS Code Extension

## Overview

BioFmt is a VS Code extension for viewing and validating common omics text formats. It provides:

- **Language detection** and **syntax highlighting** via TextMate grammars
- **Semantic editor features** (hover, diagnostics, symbols, folding) via a single multi-format LSP
- **High-performance previews** via webviews (virtualized tables, track plots, block/spectrum viewers)

This project is a **clean-room implementation** under **MIT license**. Do not copy code, grammars, or themes from GPL projects (including bioSyntax).

---

## Goals

1. Correctly identify common genomics, transcriptomics, and proteomics text formats.
2. Provide strong readability in-editor (syntax + semantics).
3. Provide a high-performance preview that feels purpose-built (not "CSV in an editor").

## Non-Goals

- No binary viewer (BAM/CRAM/BCF/bigWig etc.).
- No full-fidelity replacement for IGV or dedicated genome browsers.
- No guarantee to parse every edge case produced by every toolchain.
- No workflow runner beyond optional actions that call external tools if installed.

---

## Core UX Requirements

1. **No theme hijacking.** Never override global themes.
2. **Correct file identification**, especially `.vcf` ambiguity (Variant Call Format vs vCard) using first-line detection.
3. **Fast on large files.** Never parse the full file eagerly. Parse header + viewport with caching.
4. **One keystroke preview** via command: `BioFmt: Open Preview`.

---

## Supported Formats

### Primary (tabular preview)

| Format | Extension(s) | Detection |
|--------|--------------|-----------|
| VCF | `.vcf` | firstLine: `##fileformat=VCF` |
| SAM | `.sam` | extension |
| BED | `.bed` | extension |
| GTF | `.gtf` | extension |
| GFF3 | `.gff`, `.gff3` | extension |
| PSL | `.psl` | extension |
| PAF | `.paf` | extension |
| MAF (alignment) | `.maf` | firstLine: `##maf` or line starts with `a score=` |
| MAF (mutation) | `.maf` | firstLine contains `Hugo_Symbol` or tab-separated mutation columns |
| PED/MAP | `.ped`, `.map` | extension |
| GCT | `.gct` | extension (firstLine: `#1.2`) |
| MTX bundle | `.mtx` | extension + sidecar detection |
| HTSeq counts | `*counts.txt`, `*htseq*` | extension pattern |
| Salmon quant | `quant.sf` | filename |
| Kallisto abundance | `abundance.tsv` | filename |
| mzTab | `.mztab` | extension |
| MGF | `.mgf` | extension |
| bedGraph | `.bedGraph`, `.bdg` | extension |
| WIG | `.wig` | extension |
| narrowPeak | `.narrowPeak` | extension (BED6+4 variant) |
| broadPeak | `.broadPeak` | extension (BED6+3 variant) |

### Secondary (outline + readability)

| Format | Extension(s) |
|--------|--------------|
| GenBank | `.gbk`, `.gb`, `.genbank` |
| chain | `.chain` |
| net | `.net` |
| GFA | `.gfa` |

Binary formats are out of scope.

---

## Architecture

### Layer 1: Detection + TextMate Grammars

- One language ID per format with `omics-` prefix (e.g., `omics-vcf`, `omics-sam`).
- File extension mapping where unambiguous.
- `firstLine` detection for ambiguous formats (VCF vs vCard, MAF alignment vs mutation).
- Grammars must be lightweight and safe on large files.
- No forced themes, no theme resets.

**VCF vs vCard Detection:**
- If first non-empty line starts with `##fileformat=VCF` → classify as VCF
- If first line starts with `BEGIN:VCARD` → do not classify as VCF (leave as default)

**MAF Detection:**
- If first lines contain `##maf` or a line starts with `a score=` → alignment MAF
- If header line contains `Hugo_Symbol`, `Chromosome`, `Start_Position` → mutation MAF
- Both formats share `.maf` extension but have separate language IDs

**VCF Grammar Strategy:**
- Tokenize the 8 fixed columns (CHROM through INFO) with distinct scopes
- Tokenize the FORMAT column
- Treat all sample columns as a single scope (`meta.samples.vcf`)
- This keeps grammar O(1) per line regardless of sample count

### Layer 2: Single Multi-Format LSP

One LSP Node.js process supports all formats and dispatches handlers by `languageId`.

**Process Model:** Single process with all handlers loaded at startup (simpler, acceptable memory footprint).

**Responsibilities:**
- Header parsing (VCF, GCT, MTX, mzTab) and caching by document version
- **Hover:** VCF INFO/FORMAT keys show Number, Type, Description from header
- **Diagnostics:** Format-appropriate validation for visible ranges only
- **Document symbols:** VCF header entries, mzTab sections, etc.
- **Folding:** Header folding for VCF, block folding for MAF and MGF
- **Semantic tokens:** Highlight known vs unknown INFO/FORMAT keys (future)

**Viewport Awareness:**
- Use **lazy per-request** parsing (not viewport tracking)
- On hover: parse that line + context
- On diagnostics: parse a "working region" (~500 lines around cursor) on `textDocument/didChange`
- Cache parsed header and range results by `(uri, version, rangeKey)`

**Header Reparse:**
- **Lazy:** On next hover/diagnostic request after header edit
- Acceptable that newly-added INFO key shows "unknown" until next request triggers reparse

### Layer 3: Webview Previews

All previews use **React + react-window** for virtualization.

**Data Protocol:**
- **Chunked pull** (MVP): Webview requests ranges, extension responds with parsed data
- Streaming push optimization deferred to TODO

**Preview Lifecycle:**
- Opens **beside** text editor (split view)
- **Auto-closes** when source document closes
- **One panel per file** (multiple files = multiple preview panels)

**Shared Components:**
- `RowProvider`: Reads only needed lines from VS Code TextDocument
- Format-specific parsers return display columns + structured subfields
- Virtualized grid via react-window

**Specialized Preview Modes:**
- **Table preview:** Most formats
- **Track plot:** WIG and bedGraph (downsampled)
- **Block viewer:** MAF alignment
- **Spectrum viewer:** MGF
- **Sparse bundle summary:** MTX + barcodes + features

---

## VS Code Contributions

### Language IDs

```
omics-vcf, omics-sam, omics-bed, omics-gtf, omics-gff3, omics-psl, omics-paf,
omics-maf-alignment, omics-maf-mutation, omics-ped, omics-map, omics-gct,
omics-mtx, omics-htseq, omics-salmon, omics-kallisto, omics-mztab, omics-mgf,
omics-bedgraph, omics-wig, omics-narrowpeak, omics-broadpeak,
omics-genbank, omics-chain, omics-net, omics-gfa
```

### Commands

| Command | Description |
|---------|-------------|
| `BioFmt: Open Preview` | Opens structured preview for current file |
| `BioFmt: Open Fixture` | (dev-only) Quick-pick files from test/fixtures |
| `BioFmt: Copy Row as TSV` | Copy selected row as TSV |
| `BioFmt: Copy Cell as JSON` | Copy structured cell (INFO, FORMAT) as JSON |
| `BioFmt: Jump to Header Definition` | Jump to INFO/FORMAT/FILTER definition |
| `BioFmt: Export Filtered View` | Export small filtered subset (future) |

**Context Menu Placement:**
- Commands appear in **Command Palette** and **Editor Title Menu** (icon button)
- Right-click context menus deferred to TODO

### Configuration Settings

```jsonc
{
  "biofmt.preview.maxLines": 200000,
  "biofmt.preview.maxBytes": 52428800,  // 50MB
  "biofmt.preview.downsampleLimit": 200000,
  "biofmt.preview.sampleColumnLimit": 10,
  "biofmt.validation.level": "basic",  // off | basic | strict
  "biofmt.validation.maxDiagnostics": 2000,
  "biofmt.lsp.viewportBufferLines": 500
}
```

### Activation

- `onLanguage:<id>` for each supported format
- `onCommand:biofmt.openPreview`
- `onCommand:biofmt.openFixture`

---

## Format-Specific Requirements

### VCF (Flagship MVP)

**Grammar:**
- Header lines: `##` meta-information lines with structured highlighting
- Column header: `#CHROM` line with fixed column names
- Data lines: 8 fixed columns + FORMAT + samples (samples as single scope)

**LSP:**
- Parse header for INFO, FORMAT, FILTER, contig definitions
- **Hover:** On INFO/FORMAT key in data row → show Number, Type, Description (minimal)
- **Diagnostics:**
  - Unknown INFO/FORMAT keys (not in header)
  - Malformed INFO entries (missing `=`, type mismatches)
  - Wrong column count
  - Invalid QUAL (non-numeric, not `.`)
  - Invalid header lines

**Preview:**
- Header panel: fileformat, contig count, INFO/FORMAT/FILTER dictionaries, sample count
- Main table: CHROM, POS, ID, REF, ALT, QUAL, FILTER, INFO (expandable), FORMAT, samples
- **Sample display:** Cap at 10 columns, "Show all samples" toggle
- **Expandable INFO:** Key-value parsing into sub-table
- **Expandable FORMAT + samples:** FORMAT keys mapped to sample values with typed parsing
- **Filtering:** Hybrid approach
  - Client-side by default (filter loaded rows)
  - Explicit "Search entire file" action for full-file streaming search

**FORMAT Field Support:**

First-class typed parsing and rendering for the following FORMAT tags:

| Tag | Type | Description | Display Features |
|-----|------|-------------|------------------|
| GT | Genotype | Phased (`\|`) vs unphased (`/`), variable ploidy, missing alleles | Color-coded by zygosity (hom-ref green, het yellow, hom-alt red), phase marker, allele letters |
| GQ | Integer | Genotype Quality (Phred-scaled) | Color-coded by quality threshold (≥99 green, ≥30 yellow, <20 red) |
| DP | Integer | Read Depth | Numeric display |
| AD | Integer[] | Allelic Depths [REF, ALT1, ALT2, ...] | REF/ALT color-coded, total sum displayed |
| PL | Integer[] | Phred-scaled Likelihoods | Min PL highlighted, index shown, biallelic diploid genotype labels |
| PS | Integer | Phase Set identifier | Phase block hint displayed when GT is phased |
| FT | String | Sample Filter | PASS (green) vs filter names (red) |

**Parsed Data Model:**
- `ParsedGenotype`: `{ isPhased, alleles: (number|null)[], ploidy, hasMissing }`
- `ParsedAD`: `{ values[], refDepth, altDepths[], total }`
- `ParsedPL`: `{ values[], minPL, minPLIndex, firstThree }`
- `ParsedPS`: `{ value }`
- `ParsedFT`: `{ isPassing, filters[] }`

**Generic Fallback:**
- Unknown FORMAT tags use header definitions (Type/Number) for type coercion
- If no header definition exists, treated as String with Number='.'
- Arrays displayed as comma-separated values
- Tooltip shows header Description when available

**Extensibility:**
- Renderer registry pattern allows adding new specialized renderers
- SV-specific tags (CN, CNQ, CICN, etc.) can be added in future phases
- Base modification tags reserved for later implementation

### GTF/GFF3

**Preview:**
- Flat table of 9 fields
- Attributes parsed into key-value dictionary with search

**LSP:**
- Diagnostics: malformed attributes, missing required fields, start > end, invalid strand

**TODO:** Tree view with Parent-child hierarchy

### BED (including narrowPeak/broadPeak)

**Preview:**
- Table: chrom, start, end, plus optional columns
- narrowPeak/broadPeak: Show format-specific column labels (signalValue, pValue, qValue, peak)

**LSP:**
- Diagnostics: start >= end, negative coordinates, non-integer start/end

### WIG and bedGraph

**Preview:**
- Track plot with downsampling (cap: 200K points)
- **Multi-track WIG:** Track selector dropdown, cap at 10 tracks
- Zoom controls within loaded data

**LSP:**
- Diagnostics: malformed directives, invalid span/step, malformed data lines

### SAM

**Preview:**
- Table with standard fields
- TAGS expandable into key:type:value list

**LSP:**
- Diagnostics: invalid numeric fields, malformed tags, invalid CIGAR (best-effort)

### MAF (Multiple Alignment Format)

**Preview:**
- Block viewer: one alignment block at a time
- Navigation: next/prev, search by sequence ID
- Monospace aligned sequences

**LSP:**
- Diagnostics: malformed block lines

### MAF (Mutation Annotation Format)

**Preview:**
- Standard tabular view with column headers from file
- Filterable by Hugo_Symbol, Chromosome, Variant_Classification

**LSP:**
- Diagnostics: missing required columns, invalid coordinates

### PAF and PSL

**Preview:**
- Table with computed alignment length and identity estimate

**LSP:**
- Diagnostics: column count, numeric constraints

### PED/MAP

**Preview:**
- PED table with family/sample info
- Summary: family count, sample count

**LSP:**
- Diagnostics: missing fields, inconsistent IDs

### GCT

**Preview:**
- Matrix view with gene names and sample columns
- Summary: gene count, sample count

**LSP:**
- Diagnostics: mismatched column count vs header

### MTX Bundle

**Preview:**
- Auto-detect sidecars (`barcodes.tsv`, `features.tsv` / `genes.tsv`) in same directory
- Summary: dimensions, nnz, top features/barcodes by sum
- Do not render dense matrix

**LSP:**
- Diagnostics: header parse errors, row shape mismatches

### mzTab

**Preview:**
- Section-aware viewer with tabs: MTD, PRT, PEP, PSM, SML
- Each section as separate table

**LSP:**
- Diagnostics: malformed rows, missing required columns

### MGF

**Preview:**
- Spectrum navigator: one spectrum at a time
- Plot m/z vs intensity
- Header fields display (TITLE, PEPMASS, CHARGE)

**LSP:**
- Diagnostics: malformed BEGIN/END IONS, missing required fields

### GenBank

**Preview:**
- Outline/tree view: LOCUS, DEFINITION, ACCESSION, FEATURES (collapsible), ORIGIN
- Multi-line qualifiers concatenated

**LSP:**
- Folding for major sections

**TODO:** Structured features table view

### chain and net

**Preview:**
- Block outline, basic readability

**LSP:**
- Folding, minimal diagnostics

### GFA

**Preview:**
- Table view for S/L/P lines
- Optional small graph visualization (capped by N nodes)

**LSP:**
- Diagnostics: malformed segment/link lines

---

## UX Details

### Theming

- Use **VS Code CSS variables** (`--vscode-editor-background`, `--vscode-editor-foreground`, etc.)
- No custom semantic color mapping (deferred to TODO)
- Works correctly in both light and dark themes

### Truncation

- When file exceeds limits (200K lines or 50MB), show banner
- Banner includes **"Load more (next 50K rows)"** button
- Progressive loading with hard cap and performance warning
- Never auto-load entire file

### Error Presentation

- **MVP:** Errors appear in Problems panel only (standard LSP behavior)
- **TODO:** Inline decorations, preview row-level indicators

### Hover Content

- **MVP:** Minimal (Type, Number, Description)
- **TODO:** Examples from file, spec links, validation status

### Keyboard Navigation in Preview

- **MVP:** Mouse-primary
- **TODO:** Arrow keys, Ctrl+F search, Enter/Escape for expand/collapse

---

## Performance and Limits

### Hard Caps (Defaults)

| Setting | Default | Description |
|---------|---------|-------------|
| `preview.maxLines` | 200,000 | Max lines to load in preview |
| `preview.maxBytes` | 50 MB | Max file size for preview |
| `preview.downsampleLimit` | 200,000 | Max points in track plots |
| `preview.sampleColumnLimit` | 10 | VCF sample columns shown initially |
| `validation.maxDiagnostics` | 2,000 | Max diagnostics per file |
| `lsp.viewportBufferLines` | 500 | Lines around cursor for validation |

### Behavior

- Preview shows banner when truncated
- "Load more" action progressively loads with warnings
- All expensive operations are opt-in and reversible
- LSP never parses entire file on open

### Performance Thresholds (for tests)

| Metric | Threshold |
|--------|-----------|
| VCF header parse (1000-line header) | < 50ms |
| First preview render (10K rows visible) | < 200ms |
| Hover response latency | < 100ms |
| Memory for 1M-row file (header only) | < 50MB |

---

## Repository Layout

```
BioFmt/
├── LICENSE                    # MIT
├── SPEC.md                    # This file
├── TODO.md                    # Deferred features
├── README.md                  # Marketplace readme
├── CHANGELOG.md
├── CONTRIBUTING.md
├── package.json               # Extension manifest + scripts
├── tsconfig.json
├── .eslintrc.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── commands/              # Command implementations
│   ├── detect/                # Language detection
│   └── util/
├── server/
│   ├── src/
│   │   ├── server.ts          # LSP entry point
│   │   ├── dispatch.ts        # Route by languageId
│   │   ├── parsers/           # Format parsers
│   │   │   ├── vcf.ts
│   │   │   ├── sam.ts
│   │   │   └── ...
│   │   ├── diagnostics/
│   │   ├── hover/
│   │   ├── symbols/
│   │   └── folding/
│   └── tsconfig.json
├── webview/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── VirtualTable.tsx
│   │   │   ├── TrackPlot.tsx
│   │   │   ├── BlockViewer.tsx
│   │   │   └── SpectrumViewer.tsx
│   │   ├── providers/         # Format-specific row providers
│   │   └── hooks/
│   ├── package.json
│   └── tsconfig.json
├── syntaxes/
│   ├── vcf.tmLanguage.json
│   ├── sam.tmLanguage.json
│   └── ...
├── language-configuration/
│   ├── vcf.language-configuration.json
│   └── ...
├── docs/
│   └── screenshots/
└── test/
    ├── fixtures/              # Real sample files (existing)
    │   ├── example.vcf
    │   ├── toy.sam
    │   └── ...
    ├── fixtures.index.ts      # Registry mapping format -> paths
    ├── unit/
    │   ├── parsers/
    │   └── ...
    ├── integration/
    │   ├── lsp/
    │   └── preview/
    └── perf/
        ├── generators/
        │   ├── generate-bed.ts
        │   ├── generate-vcf.ts
        │   └── generate-sam.ts
        └── benchmarks/
```

---

## Scripts

```jsonc
// package.json scripts
{
  "build": "npm run build:extension && npm run build:server && npm run build:webview",
  "build:extension": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --platform=node",
  "build:server": "esbuild server/src/server.ts --bundle --outfile=dist/server.js --platform=node",
  "build:webview": "cd webview && npm run build",
  "lint": "eslint src server/src webview/src --ext .ts,.tsx",
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "mocha 'test/unit/**/*.test.ts'",
  "test:integration": "node ./test/runIntegration.js",
  "test:perf": "mocha 'test/perf/benchmarks/**/*.test.ts' --timeout 60000",
  "package": "vsce package"
}
```

---

## Testing Strategy

### Fixtures

- All tests use repo-relative paths under `test/fixtures/`
- No downloads in CI, no network access
- Existing fixtures cover all primary formats

### Unit Tests (Mocha)

- Parser line tests per format
- Header parsers: VCF INFO/FORMAT/FILTER, mzTab sections, GCT headers, MTX headers
- Diagnostics tests using small known-bad strings

### Integration Tests (Mocha + @vscode/test-electron)

- LSP: Open fixture, assert hover content for header-defined keys
- LSP: Assert diagnostics for intentionally malformed fixtures
- Preview: Validate row provider reads only requested ranges

### Webview Unit Tests (Jest + React Testing Library)

- Component rendering tests
- Virtual scroll behavior
- Filtering logic

### Performance Tests (Mocha)

- Synthetic generators create large files at test time (temp files, deterministic seed)
- Generators: large BED, large VCF, large SAM
- Benchmarks assert thresholds (header parse, render, hover, memory)

### CI Configuration

- **Node:** 20 LTS
- **OS Matrix:** Ubuntu + macOS
- **VS Code:** Stable only
- No network access during tests

---

## Milestones

### Milestone 0: Scaffold

- [x] Create extension skeleton in TypeScript
- [x] Add LICENSE (MIT) with SPDX headers
- [x] Add dev-only command `BioFmt: Open Fixture`
- [x] Add language ID for VCF with firstLine detection
- [x] Verify VCF vs vCard detection works

**Acceptance:**
- Opening VCF fixture sets language mode correctly
- "Open Preview" opens placeholder webview
- Tests locate fixtures via repo-relative paths

### Milestone 1: VCF MVP

- [x] TextMate grammar for VCF
- [x] LSP: header parse, hover, diagnostics for INFO/FORMAT
- [x] Preview: virtualized table with expandable INFO/FORMAT
- [x] Basic filtering (client-side)

**Acceptance:**
- Hover on INFO key shows header metadata
- Preview scroll is smooth
- No theme changes, no full-file parsing

### Milestone 2: General Tabular Engine

- [x] Shared virtualized grid and row provider
- [x] Add BED, GTF, GFF3, SAM, PAF, PSL parsers and previews
- [x] narrowPeak/broadPeak as BED variants

**Acceptance:**
- Each fixture opens with correct column schema
- Basic diagnostics appear for obvious errors

### Milestone 3: Track Plotting

- [x] WIG and bedGraph plot preview
- [x] Downsampling for large tracks
- [x] Multi-track selector (cap 10)

**Acceptance:**
- Plot renders quickly and remains interactive

### Milestone 4: Block and Spectrum Viewers

- [x] MAF alignment block viewer
- [x] MAF mutation table viewer
- [x] MGF spectrum viewer

**Acceptance:**
- Navigation without loading entire file

### Milestone 5: MTX Bundle Support

- [x] Sidecar detection (barcodes.tsv, features.tsv)
- [x] Sparse summary display

**Acceptance:**
- Opening matrix.mtx finds sidecars and renders summary

### Milestone 6: Proteomics Tables

- [x] mzTab multi-section preview with tabs

**Acceptance:**
- mzTab fixtures render and are searchable

### Milestone 7: Secondary Formats

- [x] GenBank outline view
- [x] chain/net outline (using generic preview with syntax highlighting)
- [x] GFA table + optional graph (table view via generic preview)

### Milestone 8: Polish and Publish

- [ ] README with screenshots
- [ ] Settings, status bar indicators
- [ ] vsce packaging

**Acceptance:**
- Clean build, stable performance
- Marketplace-ready

---

## Definition of Done

- [ ] BioFmt supports all listed formats in preview or outline mode
- [ ] VCF hover and diagnostics work and are fast
- [ ] No global theme overrides
- [ ] Tests pass offline using test/fixtures and synthetic generators only
- [ ] Preview remains responsive with hard caps and clear truncation warnings
- [ ] MIT license with SPDX headers in source files

---

## Appendix: Decision Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Viewport awareness | Lazy per-request | Simple, no custom protocol |
| 2 | Header reparse | Lazy | Acceptable UX tradeoff |
| 3 | VCF grammar samples | Single scope | O(1) per line |
| 4 | VCF preview samples | Cap at 10 | Performance |
| 5 | LSP process model | Single process | Simpler |
| 6 | Webview data protocol | Chunked pull | MVP simplicity |
| 7 | Preview lifecycle | Split, auto-close, per-file | VS Code convention |
| 8 | Webview framework | React + react-window | Reliable virtualization |
| 9 | Filtering | Hybrid | Balance performance/capability |
| 10 | MAF formats | Both with auto-detect | User need |
| 11 | WIG multi-track | Track selector, cap 10 | Clean UX |
| 12 | GFF3 hierarchy | Flat first | Simplicity, tree in TODO |
| 13 | GenBank preview | Outline/tree | Mirrors file structure |
| 14 | Peak formats | BED variants | No separate language IDs |
| 15 | Theming | VS Code CSS vars | No semantic mapping |
| 16 | Truncation | Progressive load | Safe, useful |
| 17 | Error presentation | Problems panel | Standard LSP |
| 18 | Hover richness | Minimal | Simplicity |
| 19 | Keyboard nav | Mouse-primary | MVP |
| 20 | Test framework | Mocha | VS Code convention |
| 21 | Webview testing | Unit only | MVP |
| 22 | Perf thresholds | As specified | Reasonable |
| 23 | Generators | Temp, CLI, deterministic | Flexibility |
| 24 | CI | Node 20, Ubuntu+macOS | Coverage |
| 25 | Bundling | Single bundle | Smaller package |
| 26 | Telemetry | None | Privacy |
| 27 | Language IDs | omics- prefix | No conflicts |
| 28 | File associations | Smart firstLine | Avoid hijacking |
| 29 | Context menus | Palette + title bar | Clean |
