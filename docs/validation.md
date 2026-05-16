# Validation and Diagnostics

BioFmt diagnostics use stable rule codes and source links so errors can be traced back to format documentation.

## Validation Levels

| Level | What it catches |
|-------|-----------------|
| `off` | No validation |
| `basic` | Structural errors such as wrong column counts, invalid coordinates, and missing delimiters |
| `strict` (default) | Everything in `basic`, plus format-specific checks such as REF/ALT syntax, CIGAR consistency, header declarations, genotype allele bounds, GFF3 references, and duplicate or conflicting IDs |

## Strict Cross-Field Checks

| Format | Examples |
|--------|----------|
| VCF | Sample column count vs header, genotype allele bounds, AD length vs allele count, INFO/FORMAT/FILTER declarations |
| SAM | CIGAR query length vs SEQ length, FLAG conflicts |
| GFF3 | Attribute grammar, Parent and Derives_from resolution, repeated-ID consistency, parent cycles, sequence-region bounds |

## Diagnostic Actions

Diagnostics expose actions from the VS Code Problems panel and editor quick-fix menu:

- Open a BioFmt rule explanation.
- Open the exact upstream specification reference.
- Copy the rule code and diagnostic summary.
- Apply safe fixes when BioFmt can make a deterministic, non-destructive edit.

BioFmt intentionally avoids automatic edits that guess scientific data values, reorder records, or delete content.

See the [diagnostic rule reference](rules.md) for documented safe fixes and common rule explanations.
