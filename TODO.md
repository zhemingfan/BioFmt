# TODO.md — BioFmt Deferred Features

This file tracks features explicitly deferred from the MVP to maintain simplicity and focus. These are not bugs or missing requirements—they are intentional deferrals based on interview decisions.

---

## Preview Enhancements

### Streaming Data Protocol
- **Current:** Chunked pull (webview requests ranges)
- **Deferred:** Streaming push (extension anticipates scroll and pushes data)
- **Benefit:** Lower perceived latency during fast scrolling
- **Complexity:** Significant state management

### Keyboard Navigation
- **Current:** Mouse-primary interaction
- **Deferred:**
  - Arrow key navigation between cells
  - `Ctrl+F` / `Cmd+F` for in-preview search
  - `Enter` to expand cell, `Escape` to collapse
  - `Ctrl+Shift+F` to focus filter bar
- **Benefit:** Power user efficiency

### Column Virtualization
- **Current:** Cap sample columns at 10 with "Show all" toggle
- **Deferred:** True horizontal virtualization for 100+ sample VCFs
- **Benefit:** Handle population-scale VCFs without memory issues

---

## LSP Enhancements

### Inline Error Decorations
- **Current:** Errors in Problems panel only
- **Deferred:**
  - Red underlines in editor
  - Gutter icons for rows with errors
  - Preview row-level error indicators (red background)
- **Benefit:** Faster error discovery

### Rich Hover Content
- **Current:** Minimal (Type, Number, Description for VCF INFO/FORMAT)
- **Deferred:**
  - Examples from current file
  - Links to format specification
  - Validation status per key
  - "Filter by this key" action button
  - "Go to definition" action button
- **Benefit:** More context without leaving hover

### Semantic Tokens
- **Current:** TextMate grammar only
- **Deferred:**
  - Differentiate known vs unknown INFO/FORMAT keys
  - Highlight attribute keys in GTF/GFF3
  - Dynamic coloring based on header definitions
- **Benefit:** Visual validation feedback

---

## Format-Specific Features

### GFF3 Tree View
- **Current:** Flat table of 9 fields
- **Deferred:** Hierarchical tree based on `Parent=` attributes
  - Collapsible gene → mRNA → exon → CDS hierarchy
  - Parent-child relationship visualization
- **Benefit:** Better biological context

### GenBank Structured Table
- **Current:** Outline/tree view mirroring file structure
- **Deferred:** Parsed FEATURES as structured table
  - Feature type column
  - Location column (parsed)
  - Qualifiers as expandable sub-table
- **Benefit:** Easier feature navigation

### GFA Graph Visualization
- **Current:** Table view for S/L/P lines
- **Deferred:** Interactive graph view (capped nodes)
  - Force-directed or hierarchical layout
  - Node selection → highlight in table
  - Export to DOT format
- **Benefit:** Assembly structure visualization

---

## UX Improvements

### Context Menus
- **Current:** Commands in Palette + editor title bar
- **Deferred:**
  - Right-click in editor → "Open in BioFmt Preview"
  - Right-click in Explorer → "Open in BioFmt Preview"
  - Right-click in preview → "Copy Row", "Filter by this value"
- **Benefit:** Discoverability

### Semantic Theming
- **Current:** VS Code CSS variables only
- **Deferred:**
  - Define semantic tokens (chromosome, quality score, etc.)
  - Map to VS Code theme colors dynamically
  - Color-code QUAL < 30 as warning
  - Highlight PASS vs non-PASS filters
- **Benefit:** Richer visual semantics

### Status Bar Indicators
- **Current:** None
- **Deferred:**
  - Show format name and version (e.g., "VCF 4.1")
  - Show record count / truncation status
  - Show validation status (errors/warnings count)
- **Benefit:** At-a-glance file info

---

## Testing Improvements

### Webview Integration Tests
- **Current:** Unit tests for React components only
- **Deferred:**
  - Full end-to-end tests launching VS Code
  - Automation to verify preview content matches expected
  - Screenshot comparison tests
- **Benefit:** Catch rendering regressions

### Visual Regression Tests
- **Current:** None
- **Deferred:**
  - Snapshot tests for grammar highlighting
  - Snapshot tests for preview rendering
- **Benefit:** Catch unintended visual changes

---

## Performance Optimizations

### Header Index Caching
- **Current:** Re-parse header on each document version
- **Deferred:**
  - Persistent header index per file
  - Invalidate only on header region changes
  - Cross-session caching (workspace storage)
- **Benefit:** Faster reopening of large files

### Background Indexing
- **Current:** On-demand parsing only
- **Deferred:**
  - Background worker for pre-indexing
  - Index CHROM positions for quick navigation
  - Build filter indexes asynchronously
- **Benefit:** Instant filtering on pre-indexed files

---

## Export Features

### Export Filtered View
- **Current:** Not implemented
- **Deferred:**
  - Export visible/filtered rows as TSV
  - Export with or without header
  - Configurable column selection
- **Benefit:** Quick data extraction

### Copy Enhancements
- **Current:** Basic copy row/cell commands
- **Deferred:**
  - Copy selection as TSV
  - Copy with column headers
  - Copy for different target formats (CSV, JSON)
- **Benefit:** Flexible data transfer

---

## Documentation

### Interactive Tutorials
- **Current:** README only
- **Deferred:**
  - Walkthrough for first-time users
  - Sample file tour
  - Feature discovery prompts
- **Benefit:** User onboarding

### Format Specification Links
- **Current:** None
- **Deferred:**
  - Links to official format specs in hover/preview
  - Quick reference cards per format
- **Benefit:** Educational value

---

## Priority Suggestions for Future Releases

### High Priority (v1.1)
1. Keyboard navigation in preview
2. Context menus
3. GFF3 tree view

### Medium Priority (v1.2)
1. Inline error decorations
2. Rich hover content
3. Status bar indicators

### Low Priority (v2.0)
1. Streaming data protocol
2. Column virtualization
3. GFA graph visualization
4. Background indexing
