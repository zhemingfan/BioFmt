# BioFmt vs the VS Code competitors — runtime comparison

Head-to-head runtimes against the three VS Code Marketplace extensions that overlap
with BioFmt, on the features that actually overlap. Figures in [`figures/`](figures)
(`cmp1`–`cmp4`).

## What was compared, and how (honesty first)

The competitive research established each extension's **mechanism**, so each is
reproduced faithfully and timed against BioFmt's actual mechanism — not the
extensions running live in VS Code (which would add the same editor/IPC overhead to
both sides). The comparisons are only made where a feature genuinely overlaps.

| Competitor | Overlapping feature | How its mechanism was reproduced |
|---|---|---|
| **BAM Reader** | Viewing a BAM | `samtools view <bam>` → CSV over the **whole file** (its Marketplace page: "the entire BAM file is converted"). Timed via samtools 1.9. |
| **bioSyntax** | Syntax highlighting | Its actual TextMate grammar, fetched from its repo, tokenized by the **same** `vscode-textmate`+`vscode-oniguruma` engine VS Code uses — isolating grammar efficiency. |
| **BioCoderX** | (none, runtime-wise) | It does sequence analysis / 3D-molecular viz — none of BioFmt's large-file capabilities — so it appears only in the capability matrix, not the runtime charts. |

BioFmt side: the BAM path uses `@gmod/bam` `getRecordsForRange` capped at 10 000
records, exactly as `src/providers/BamProvider.ts` does; the highlighting path uses
BioFmt's own `syntaxes/*.tmLanguage.json` through the same engine.

## Result 1 — Opening a BAM: indexed query vs whole-file conversion ([cmp1](figures/cmp1_bam_open_time.png))

BAM Reader must decompress and convert the **entire** file before anything appears;
BioFmt reads only the records overlapping the queried window via the `.bai` index.

| BAM size | BAM Reader (whole file) | BioFmt open (chr1:0–1Mb) | BioFmt navigate (100 kb) | Speedup (open) |
|---:|---:|---:|---:|---:|
| 100 K reads | 1.0 s | 1.5 ms | 0.03 ms | ~670× |
| 1 M reads | 10.3 s | 3.0 ms | 1.1 ms | ~3 400× |
| 2 M reads | 19.9 s | 5.2 ms | 2.6 ms | **~3 800×** |
| 3 M reads | 29.7 s | ~1–5 ms | ~0.2 ms | ~6 000–20 000× |

BAM Reader scales linearly with file size (O(n)); BioFmt stays in the low
single-digit milliseconds (bounded by the queried window + 10 000-record cap). This
is the clearest, most defensible competitive result: it's an architectural
difference (indexed random-access vs full conversion), not a micro-optimization.
*Caveat:* the real BAM Reader also writes the CSV to disk and renders it, adding
more time; BioFmt's real extension adds VS Code IPC/render overhead — both small
relative to a multi-second conversion.

## Result 2 — Syntax-highlighting throughput (same engine) ([cmp2](figures/cmp2_highlight_throughput.png), [cmp3](figures/cmp3_tokens_per_line.png))

Both tools are TextMate grammars run by the identical engine, so this isolates
grammar efficiency. It is **not** a clean sweep — which is what makes it credible:

| Format | BioFmt (k lines/s) | bioSyntax (k lines/s) | Winner |
|---|---:|---:|---|
| VCF | 75 | 98 | bioSyntax ~1.3× (BioFmt emits 60% more tokens — richer highlighting) |
| SAM | 122 | 69 | BioFmt 1.8× |
| BED | 398 | 188 | BioFmt 2.1× |
| GTF | 271 | 42 | BioFmt 6.5× |
| FASTA | 423 | 15 | **BioFmt 29×** |
| FASTQ | 466 | 15 | **BioFmt 32×** |

The FASTA/FASTQ gap is explained by cmp3: bioSyntax emits ~60 tokens per line (it
colors **every nucleotide**), BioFmt ~1 (line-level). bioSyntax's per-base coloring
is prettier on short sequences but does not scale to genome-sized files; BioFmt
trades per-base color for large-file speed. On VCF, BioFmt deliberately emits more
tokens (finer field highlighting) and pays ~30% for it. Honest takeaway: **BioFmt's
grammars are built for large-file throughput; bioSyntax's are built for per-residue
color on smaller inputs.**

## Result 3 — Capability coverage ([cmp4](figures/cmp4_capability_matrix.png))

Where a runtime comparison is *impossible* because only BioFmt offers the feature:

| Capability | BioFmt | bioSyntax | BAM Reader | BioCoderX |
|---|:---:|:---:|:---:|:---:|
| Syntax highlighting | ✅ | ✅ | ❌ | ❌ |
| Validation / diagnostics | ✅ | ❌ | ❌ | ❌ |
| Interactive large-file preview | ✅ | ❌ | ~ (CSV dump) | ❌ |
| Indexed BAM/tabix access | ✅ | ❌ | ❌ | ❌ |
| Proteomics (mzTab/MGF) | ✅ | ❌ | ❌ | ❌ |
| Formats supported | ~27 | ~11 | 1 | ~8 |

Validation and indexed access are **uncontested** among these three — there is no
competitor to benchmark against, so those are coverage wins, not speed wins.

## Bottom line for positioning

- **BAM opening** is the one runtime comparison where BioFmt wins by orders of
  magnitude *and* it's an honest architectural difference — lead with cmp1.
- **Highlighting** is a mixed, credible result — use cmp2+cmp3 together; claiming a
  clean sweep would be false (bioSyntax edges VCF).
- **Validation / indexed / preview / proteomics** have no in-editor competitor —
  present these as the capability matrix (cmp4), not as speed races.

## Caveats

- Mechanisms are reproduced outside VS Code; absolute numbers exclude editor
  overhead (applied equally to both sides). Shapes and ratios are the result.
- BAM test files are synthetic (uniform coverage over chr1); real BAMs vary in
  coverage depth, which changes how many records a window returns — but never
  changes that BAM Reader reads the whole file while BioFmt reads a window.
- bioSyntax grammars were tokenized with their own sub-grammars resolved; a couple
  of its scopes emit near-zero tokens on synthetic lines (e.g. SAM), which may
  under-represent its real token count on richer inputs.
- Single machine, samtools 1.9, snapshot install counts (bioSyntax ~71.7K / 2021,
  BAM Reader ~434 / 2024, BioCoderX ~878 / 2026).
