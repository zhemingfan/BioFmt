# BioFmt — remediation plan for measured weaknesses

Each item is grounded in a figure (`test/stress/figures/weak*.png`) and a root cause
in the code. Ordered by **impact ÷ effort** — do them top-down. None of these are
1:1 competitor chasing; each makes BioFmt materially better on a path that real users
hit (population cohorts, deep-coverage BAMs, large annotations, per-keystroke latency).

| # | Weakness | Fixed impact (measured) | Effort | Risk |
|---|----------|------------------------|--------|------|
| W4 | VCF parses all samples, shows 10 | 636 ms → ~3 ms per viewport (2504 samples) | **Low** | Low |
| W1 | BAM reads whole window before cap | 178 ms / 186 MB → ~4 ms / ~4 MB (500× depth) | Med | Med |
| W2 | Viewport validation splits whole file | ~70 ms → ~5 ms per keystroke (1M lines) | Med | Med |
| W3 | GFF3 rebuilds full model per keystroke | ~1.1 GB → bounded heap (1M lines) | Med-High | Med |

---

## W4 — Parse only visible VCF samples  ·  *quick win, do first*  ·  [weak4](figures/weak4_vcf_samples.png)

**Measured:** a 2504-sample VCF wastes **636 ms per 500-row viewport** (252× the 10
columns shown), recurring on every scroll.

**Root cause:** `webview/src/components/VcfPreview.tsx` `parseVcfLine` (~:526) loops
**all** `headerInfo.samples` and calls `parseSampleFormats` for each, and rebuilds a
fresh `formatDefs` Map per line (~:521) instead of reusing the memoized one.

**Fix:**
1. Parse only the sample columns currently rendered (`sampleColumnLimit`, default 10,
   plus whatever the "Show all" toggle/scroll exposes); parse the rest lazily on demand.
2. Hoist the `formatDefs` Map out of the per-line loop (build once from the header).

**Expected impact:** viewport parse ∝ *visible* samples, not cohort size → ~3 ms
regardless of cohort. Removes the per-line Map allocation entirely.

**Verify:** extend `bench_vcf_samples.ts` to parse only `min(S,10)` and confirm the
"all" line collapses onto the "shown" line. **Risk:** low — display already caps at 10;
this only stops parsing hidden columns.

---

## W1 — Cap BAM records during the scan, not after  ·  [weak1](figures/weak1_bam_depth.png)

**Measured:** a 1 Mb window at 50× depth (500K reads — routine for exomes/amplicons)
costs **178 ms and 186 MB to display 10K of 500K records**. Cost scales with coverage
depth, not the display cap. cmp1's uniform low-depth data hid this.

**Root cause:** `src/providers/BamProvider.ts` `getRegion` (~:185) does
`await this.bam.getRecordsForRange(...)` (materializes **every** overlapping record)
then `capRegionRows(records, maxRows)` (~:187). The cap bounds output, not work.
`TabixProvider` has the sibling issue: its `lineCallback` sets `truncated` but @gmod
keeps decompressing the rest of the region (review P4).

**Fix:**
1. Stream instead of materialize: use `@gmod/bam`'s record-streaming / async-iterator
   path and **break at `maxRows`**, so at most `cap` (+ a small margin) records are
   ever held. For tabix, `throw`/`AbortController` out of the callback once capped.
2. Make the auto-query-on-open window **adaptive**: start with a small span and widen
   only until `cap` is reached, instead of a fixed 1 Mb that can be arbitrarily deep.

**Expected impact:** open/navigate cost becomes O(cap) — ~4 ms / ~4 MB (the 10K-record
cost) regardless of depth; the red "materialized" line in weak1 flattens onto the cap.
**Effort:** medium (verify @gmod streaming API). **Risk:** medium — must keep sort
order and `hasMore` semantics; add a fixture test for a capped high-depth region.

---

## W2 — Bound viewport validation to the viewport  ·  [weak2](figures/weak2_split_floor.png)

**Measured:** at 1M lines, ~**half** of per-keystroke validation latency is the
full-file `split('\n')` — the viewport path allocates a million-element array to
validate ~500 lines.

**Root cause:** every validator does `text.split(/\r?\n/)` over the whole document and
loops `0..lines.length`; `shouldValidateLine` (`server/src/validators/types.ts:83`)
only skips the per-line *body*, not the split or the scan (review P1/P6).

**Fix:** when `visibleRanges` are present, compute the character offset span for
`[minStart-buffer, maxEnd+buffer]` and `slice`/scan only that window (reuse the
`indexOf('\n')` line-walk already applied to `parseVcfHeader`). Keep absolute line
indices for diagnostic ranges via a running line counter. On open (no ranges), stop
after `headerEndLine + bufferLines`.

**Expected impact:** viewport validation → O(viewport): ~70 ms → ~5 ms at 1M lines
(the green "viewport work" band in weak2, minus the red split). Every format benefits.
**Effort:** medium — factor a shared `forEachLineInWindow` helper. **Risk:** medium —
off-by-one in offset↔line mapping; guard with the existing validator unit tests plus a
CRLF case.

---

## W3 — Cache and bound the GFF3 model  ·  [weak3](figures/weak3_gff3_model.png)

**Measured:** GFF3 validation builds an O(n) feature+`Parent` graph and retains
`lineText` per feature, reaching **~0.8–1.1 GB heap at 1M lines** — rebuilt on every
keystroke, and (unlike VCF/BED/SAM) **not viewport-bounded**.

**Root cause:** `server/src/validators/gff3.ts` `validateGff3` (~:80) ignores the
viewport, accumulates `FeatureRecord[]`/`featuresById`/`parentGraph` each retaining
`lineText` (~:269), and rebuilds this model independently of the already-version-cached
`getGff3Index` (~:692).

**Fix (layered):**
1. **Split the checks:** run per-line grammar/coordinate/phase checks viewport-bounded
   (like the other validators); run the global cross-reference checks (Parent/Derives_from
   resolution, duplicate-ID, cycles) against a model **cached by `(uri, version)`** so
   an unchanged file reuses it across keystrokes.
2. **Drop retained `lineText`:** store line numbers only and re-read the line lazily when
   emitting a diagnostic — removes the largest heap contributor.
3. Optionally gate the full cross-reference pass behind a size threshold with a clear
   "cross-file checks skipped above N lines" notice (no silent cap).

**Expected impact:** per-keystroke heap bounded (no O(n) model rebuild on unchanged
content); repeat-edit latency drops to the per-line viewport cost. **Effort:**
medium-high. **Risk:** medium — the strict cross-field GFF3 tests must still pass;
implement behind the cache and diff diagnostics against the current fixtures.

---

## Also worth fixing (found in review, not charted here)

- **`BgzfTextProvider` synchronous `gunzipSync`** (`src/providers/BgzfTextProvider.ts`)
  blocks the entire extension host while decompressing an unindexed `.gz` — switch to
  streaming/async `zlib.gunzip`, or refuse without an index. High impact for `.fastq.gz`.
- **`GenomicIndexRegistry.indexDocument`** re-scans the whole document via
  `getText()+split` on every open/edit even when cross-file nav is unused — gate behind
  first use, or make it incremental.

## Suggested sequencing

1. **W4** (an afternoon, low risk) — immediate win for population VCFs.
2. **W2** (shared line-window helper) — benefits every validator; unlocks the biggest
   per-keystroke latency reduction at scale.
3. **W1** + the BGZF fix — makes the indexed/binary path safe on real high-depth data
   (the honest large-file risk the strengths figures don't show).
4. **W3** — the heaviest lift; do after W2's line-window helper exists, which it can reuse.

Each fix ships with an extension to its benchmark harness so the before/after is
measured, not asserted.
