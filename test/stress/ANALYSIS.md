# BioFmt — Large-File Performance Analysis

Real-code benchmarks of the BioFmt validation and preview engine on synthetic
omics files up to **1,000,000 records / ~110 MB**, plus the correctness fixes that
came out of a full-repository review. All figures are in [`figures/`](figures).

## Why this harness exists

The repository already had two performance artifacts, both with blind spots:

- `stress_test.py` measures only raw Python file I/O (`open().read()` + `split()`),
  not BioFmt's actual parsing or validation.
- `test/perf/*.perf.test.ts` benchmark **copies** of the parser pasted into the
  test file ("copied from server for isolated benchmarking"), which drift from the
  code that actually ships.

[`bench.ts`](bench.ts) instead imports and drives the **real production code** —
`getValidator(languageId)` from `server/src/validators/*` and the real VCF field
parsers from `webview/src/vcf/formatParsers.ts` — so the numbers describe what a
user actually experiences.

## Methodology

- **Deterministic** synthetic generators (seeded `mulberry32`) for VCF, BED, SAM,
  GFF3, GTF, PAF, bedGraph, FASTA, FASTQ; sizes swept `1K → 1M` lines.
- Each file is generated **valid** (0 diagnostics) so validators do full-file work
  rather than early-exiting at the `maxDiagnostics` cap. (The first GFF3 run
  exposed this: CDS-without-phase made GFF3 hit the 2000-diagnostic cap and stop —
  a good validator-correctness signal, and a benchmark bug that was then fixed.)
- Three validation modes are timed via the real `ValidatorContext` /
  `shouldValidateLine` machinery:
  - **open** — viewport at file top, 500-line buffer (cost of opening a file)
  - **scroll** — viewport in the middle (cost of a scroll/edit deep in the file)
  - **full** — whole-file strict validation (worst case / per-open cost)
- Median of warmup+measured runs; heap measured with `--expose-gc`.

Reproduce:

```bash
node --expose-gc --max-old-space-size=8192 -r ts-node/register/transpile-only test/stress/bench.ts
node --expose-gc -r ts-node/register/transpile-only test/stress/bench_header.ts
python3 test/stress/plot_figures.py     # needs matplotlib + numpy
```

## Key findings

### 1. Viewport-aware validation keeps per-edit latency bounded ([fig 1](figures/fig1_viewport_vs_full.png))

Full-file strict validation of a VCF is **O(n)** and reaches **~2.9 s at 1M
variants**. The viewport path validates only ~500 lines around the cursor and stays
**~70 ms** — about **40× cheaper per keystroke** at 1M lines. The residual growth in
the viewport path is the `text.split('\n')` floor (dashed line), which every
validation still pays.

### 2. `parseVcfHeader` was O(file); now O(header) ([fig 2](figures/fig2_header_parse_before_after.png))

`parseVcfHeader` split the **entire file** into a line array just to read a header
that is usually < 100 lines — and it runs on *every* hover, completion, definition,
symbol, folding, and validation request. Rewritten to scan for the first non-`#`
line and split only that prefix:

| VCF data lines | before (split file) | after (prefix scan) | speedup |
|---:|---:|---:|---:|
| 1M (~51 MB) | **23.6 ms** | **0.07 ms** | **360×** |

The new cost is flat regardless of file size. This is the single highest-leverage
optimization because of how often the header is parsed.

### 3. Throughput is honest and format-dependent ([fig 3](figures/fig3_throughput_by_format.png))

Measured on the real validators at ~0.5–1M lines. FASTA/FASTQ are near-linear
character scans (fast); VCF does the heaviest per-line work (INFO/FORMAT/genotype
cross-field checks) and GFF3 builds a full feature + `Parent` graph model, so both
are the slowest per MB. See the figure for the current ranking.

### 4. Validation latency is linear in file size ([fig 4](figures/fig4_linear_scaling.png), [fig 5](figures/fig5_memory_scaling.png))

Full-file latency and transient heap both scale ~linearly with input size (slope 1
on log-log), confirming there are no accidental O(n²) paths in the measured
validators. Memory is transient (the split array + diagnostics) and is avoided per
keystroke by the viewport path.

### 5. Genotype field parsers are fast ([fig 6](figures/fig6_field_parser_throughput.png))

The webview render path parses GT/AD/PL at **>13 M parses/second**, so a
500-row × 10-sample viewport (~5,000 genotype parses) renders in well under a
millisecond.

[fig 7](figures/fig7_results_dashboard.png) combines (1)–(4) into a single slide.

## Correctness fixes shipped alongside the analysis

Found via a full-repository review; each has a regression test (suite: **790 unit +
37 webview, all green**).

| # | Fix | Impact | Test |
|---|-----|--------|------|
| 1 | **CRLF handling** in all bulk validators (`split('\n')` → `split(/\r?\n/)`) | Windows/CRLF files no longer get spurious diagnostics — most severely, GFF3 flagged a control-character error on **every** feature line | `crlf-handling.test.ts` |
| 2 | **`parseVcfHeader`** scans header prefix instead of splitting the whole file | 360× faster header parse on large VCFs (fig 2) | `bench_header.ts` correctness assert |
| 3 | **VCF-X001** only fires when a sample has *more* values than FORMAT keys | Spec-legal dropped trailing sub-fields (e.g. gVCF `GT` only) no longer false-flagged | `vcf-validator.test.ts` |
| 4 | **VCF-S005** now flags non-numeric `POS` | A non-integer POS previously slipped through (`parseInt`→NaN skipped the guard) | `vcf-validator` demo fixture |
| 5 | **BEDPE** exempts the unknown-mate sentinel (`chrom='.'`, `start/end=-1`) | Single-breakend / translocation records no longer false-flagged, while genuine negatives still are | `bedpe-validator.test.ts` |
| 6 | **VCF sites-only grammar** — trailing tab after INFO made optional; REF accepts IUPAC codes | 8-column sites-only VCFs (dbSNP, gnomAD, ClinVar, 1000G) now get syntax highlighting | `vcf-grammar.test.ts` |
| 7 | **GtfGffPreview** tolerates a literal `%` in GFF3 attributes | `decodeURIComponent` no longer throws and unmounts the whole GFF3 table preview | `GtfGffPreview.test.ts` |
| 8 | **GenomicIndexRegistry** sort/search comparator unified to code-unit order | Cross-file "go to overlapping region" no longer misses overlaps when chrom names order differently under `localeCompare` vs `<` | `genomic-index-registry.test.ts` |

## Limitations

- Synthetic data approximates but does not reproduce every real-world edge (e.g.
  GFF3 `Parent` depth, VCF sample counts). Numbers are a faithful *lower bound* on
  per-line cost for well-formed files.
- Single machine, single Node version (recorded in each JSON's `meta`). Absolute
  milliseconds are machine-specific; the **shapes** and **ratios** are the result.
