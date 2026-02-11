# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BioFmt is a VS Code extension for viewing and validating genomics, transcriptomics, and proteomics text formats. It provides syntax highlighting, LSP features (hover, diagnostics, symbols), and high-performance webview previews.

**License**: GPL-3.0

## Build Commands

```bash
# Install dependencies (root + webview)
npm install && cd webview && npm install && cd ..

# Build everything (extension + LSP server + webview)
npm run build

# Build individual components
npm run build:extension   # builds src/extension.ts -> dist/extension.js
npm run build:server      # builds server/src/server.ts -> dist/server.js
npm run build:webview     # builds webview React app -> webview/dist/

# Run tests
npm run test:unit         # Mocha unit tests in test/unit/
npm run test:integration  # VS Code integration tests
npm run test:perf         # Performance benchmarks

# Run a single unit test file
npx mocha --require ts-node/register 'test/unit/vcf.test.ts'

# Watch mode for extension development
npm run watch

# Lint
npm run lint

# Package for marketplace
npm run package
```

## Architecture

### Three-Layer Design

1. **Layer 1: TextMate Grammars** (`syntaxes/*.tmLanguage.json`)
   - One grammar per format with `omics-` prefix language IDs
   - `firstLine` detection for ambiguous formats (VCF vs vCard, MAF alignment vs mutation)

2. **Layer 2: Single LSP Server** (`server/src/server.ts`)
   - One Node.js process handles all formats, dispatching by `languageId`
   - Provides: hover (VCF INFO/FORMAT keys), diagnostics, folding ranges, document symbols
   - Lazy per-request parsing, caches headers by `(uri, version)`

3. **Layer 3: React Webviews** (`webview/src/`)
   - All previews use React + react-window for virtualization
   - Chunked pull protocol: webview posts `requestRows(startLine, endLine)`, extension responds with `rowData`
   - App.tsx routes `languageId` to format-specific components (VcfPreview, BedPreview, TrackPlot, etc.)

### Key Files

- `src/extension.ts` - Extension entry point, LSP client, webview creation
- `server/src/server.ts` - LSP server with all format validators
- `webview/src/App.tsx` - Routes to format-specific preview components
- `webview/src/components/VirtualTable.tsx` - Shared virtualized grid component
- `test/fixtures.index.ts` - Registry mapping fixture IDs to paths
- `SPEC.md` - Complete specification with 29 documented design decisions

### Supported Formats (25 total)

Primary (with specialized previews): VCF, SAM, BED, BEDPE, GTF, GFF3, PSL, PAF, MAF (both alignment and mutation), WIG, bedGraph, narrowPeak, broadPeak, MTX, mzTab, MGF, GenBank

Secondary (generic preview): PED, MAP, GCT, chain, net, GFA, HTSeq, Salmon, Kallisto

## Key Design Decisions

- **No theme hijacking**: Uses VS Code CSS variables, never overrides global themes
- **Lazy parsing**: Never parses full file eagerly; parses header + viewport with caching
- **Sample column cap**: VCF shows max 10 samples initially, "Show all" toggle available
- **Downsampling**: Track plots downsample at 5K points, hard cap at 200K
- **Viewport-aware validation**: LSP validates ~500 lines around cursor, not entire file
- **One preview per file**: Opens beside text editor, auto-closes when source closes

## Testing

- Unit tests: `test/unit/` - Parser and validation tests using fixtures
- Fixtures: `test/fixtures/` - Real sample files for all formats (see `test/fixtures.index.ts` for registry)
- No network access in tests (offline fixtures only)
- Performance thresholds: header parse <50ms, first render <200ms, hover <100ms
