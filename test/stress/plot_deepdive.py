#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Deep-dive figures: BioFmt strengths (curated, genuine wins) and weaknesses
(measured on paths that matter). Weakness data from the W1/W3/W4 harnesses plus
the split-floor derived from the main sweep.
"""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RES, FIG = os.path.join(HERE, 'results'), os.path.join(HERE, 'figures')
os.makedirs(FIG, exist_ok=True)
BLUE, AQUA, YELLOW, GREEN = '#2a78d6', '#1baf7a', '#eda100', '#008300'
VIOLET, RED, MAGENTA, ORANGE = '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'
INK, INK2, MUTED, GRID, SURFACE = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#fcfcfb'
plt.rcParams.update({
    'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE,
    'font.family': 'sans-serif', 'font.sans-serif': ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans'],
    'font.size': 11, 'axes.titlesize': 13, 'axes.titleweight': 'bold', 'axes.labelsize': 11,
    'axes.labelcolor': INK2, 'text.color': INK, 'axes.edgecolor': MUTED, 'axes.linewidth': 0.8,
    'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.grid': True, 'grid.color': GRID,
    'grid.linewidth': 0.7, 'grid.alpha': 0.9, 'legend.frameon': False,
    'axes.spines.top': False, 'axes.spines.right': False,
})
def load(n):
    with open(os.path.join(RES, n)) as f: return json.load(f)
def kfmt(x, _):
    return f'{x/1e6:.0f}M' if x >= 1e6 else (f'{x/1e3:.0f}K' if x >= 1e3 else f'{x:.0f}')
def save(fig, n):
    p = os.path.join(FIG, n); fig.savefig(p, dpi=200, bbox_inches='tight'); plt.close(fig); print(f'  wrote {os.path.relpath(p, HERE)}')
def vcf(rows): return sorted([r for r in rows if r['format'] == 'VCF'], key=lambda x: x['lines'])


# ══════════ STRENGTHS ══════════
def strengths_dashboard():
    after = load('bench_after.json')['rows']; hdr = load('bench_header.json')['rows']; bam = load('bench_bam.json')['rows']
    v = vcf(after)
    fig = plt.figure(figsize=(15, 9)); gs = fig.add_gridspec(2, 2, hspace=0.36, wspace=0.22)

    ax = fig.add_subplot(gs[0, 0])
    ln = [r['lines'] for r in v]
    ax.plot(ln, [r['validate_full_ms'] for r in v], '-o', color=RED, lw=2, ms=4, label='full file')
    ax.plot(ln, [r['validate_open_ms'] for r in v], '-D', color=BLUE, lw=2, ms=4, label='viewport')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(a) STRENGTH: viewport-aware validation')
    ax.set_xlabel('VCF records'); ax.set_ylabel('ms'); ax.legend(fontsize=9); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[0, 1])
    h = sorted(hdr, key=lambda x: x['dataLines']); n = [x['dataLines'] for x in h]
    ax.plot(n, [x['old_ms'] for x in h], '-o', color=RED, lw=2, ms=4, label='before O(file)')
    ax.plot(n, [x['new_ms'] for x in h], '-D', color=BLUE, lw=2, ms=4, label='after O(header)')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(b) STRENGTH: parseVcfHeader fix (360×)')
    ax.set_xlabel('VCF data lines'); ax.set_ylabel('header parse ms'); ax.legend(fontsize=9); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[1, 0])
    b = sorted(bam, key=lambda x: x['reads']); rd = [x['reads'] for x in b]
    ax.plot(rd, [x['bamReader_ms'] for x in b], '-o', color=RED, lw=2, ms=4, label='BAM Reader (whole file)')
    ax.plot(rd, [x['biofmt_open_ms'] for x in b], '-D', color=BLUE, lw=2, ms=4, label='BioFmt (indexed)')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(c) STRENGTH: indexed BAM open (vs BAM Reader)')
    ax.set_xlabel('reads'); ax.set_ylabel('ms'); ax.legend(fontsize=9); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[1, 1])
    fmts = ['FASTQ', 'FASTA', 'SAM', 'GTF', 'BED', 'PAF', 'bedGraph', 'VCF', 'GFF3']
    vals = []
    for f in fmts:
        rr = sorted([r for r in after if r['format'] == f], key=lambda x: x['lines']); vals.append(rr[-1]['full_throughput_mb_s'])
    ax.barh(fmts[::-1], vals[::-1], color=BLUE); ax.set_title('(d) STRENGTH: real-code validation throughput')
    ax.set_xlabel('MB/s'); ax.grid(False, axis='y')
    for i, val in enumerate(vals[::-1]): ax.text(val, i, f' {val:.0f}', va='center', fontsize=8, color=INK)
    fig.suptitle('BioFmt — where the design pays off (genuine performance wins)', fontsize=16, fontweight='bold', y=0.97)
    save(fig, 'strengths_dashboard.png')


# ══════════ WEAKNESSES ══════════
def weak1_bam_depth():
    r = load('bench_bam_depth.json')['rows']; d = [x['depth'] for x in r]; cap = load('bench_bam_depth.json')['meta']['cap']
    fig, (axL, axR) = plt.subplots(1, 2, figsize=(13.5, 5.2)); fig.subplots_adjust(wspace=0.28)
    # left: work done vs shown
    axL.plot(d, [x['materialized'] for x in r], '-o', color=RED, lw=2.2, ms=6, label='records materialized (read into memory)')
    axL.plot(d, [x['displayed'] for x in r], '-s', color=BLUE, lw=2.2, ms=6, label=f'records displayed (capped at {cap:,})')
    axL.axhline(cap, color=MUTED, ls='--', lw=1); axL.set_xscale('log'); axL.set_yscale('log')
    axL.set_xlabel('coverage depth (reads in the 1 Mb window)'); axL.set_ylabel('records')
    axL.set_title('(left) BioFmt reads everything, shows 10K'); axL.legend(fontsize=9, loc='upper left')
    axL.xaxis.set_major_formatter(FuncFormatter(kfmt))
    # right: cost (ms + MB overlay, same magnitude)
    axR.plot(d, [x['query_ms'] for x in r], '-o', color=ORANGE, lw=2.2, ms=6, label='query time (ms)')
    axR.plot(d, [x['heap_mb'] for x in r], '-D', color=VIOLET, lw=2.2, ms=6, label='heap allocated (MB)')
    axR.set_xscale('log'); axR.set_xlabel('coverage depth (reads in the 1 Mb window)')
    axR.set_ylabel('query time (ms)  /  heap (MB)'); axR.set_title('(right) cost scales with depth, not the cap')
    axR.legend(fontsize=9, loc='upper left'); axR.xaxis.set_major_formatter(FuncFormatter(kfmt))
    big = r[-1]
    axR.annotate(f"{big['query_ms']:.0f} ms, {big['heap_mb']:.0f} MB\nto show {cap:,} of {big['materialized']:,}",
                 xy=(big['depth'], big['query_ms']), xytext=(big['depth']*0.12, big['query_ms']*0.35),
                 fontsize=9, color=INK, ha='left', arrowprops=dict(arrowstyle='->', color=INK2, lw=1))
    fig.suptitle('WEAKNESS W1 — BAM region query materializes every read before applying the cap',
                 fontsize=14, fontweight='bold', y=1.0)
    save(fig, 'weak1_bam_depth.png')


def weak2_split_floor():
    v = vcf(load('bench_after.json')['rows']); ln = [r['lines'] for r in v]
    split = [r['split_ms'] for r in v]; openms = [r['validate_open_ms'] for r in v]
    work = [max(0, o - s) for o, s in zip(openms, split)]
    fig, ax = plt.subplots(figsize=(8.6, 5.2))
    ax.stackplot(ln, split, work, colors=[RED, AQUA], alpha=0.85,
                 labels=['full-file split(\\n) — fixable overhead', 'viewport validation work'])
    ax.set_xscale('log'); ax.set_xlabel('VCF records (lines)'); ax.set_ylabel('per-keystroke latency (ms)')
    ax.set_title('WEAKNESS W2 — viewport validation still splits the WHOLE file each keystroke')
    ax.legend(fontsize=9.5, loc='upper left'); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))
    pct = split[-1] / openms[-1] * 100
    ax.annotate(f'{pct:.0f}% of latency at 1M lines\nis just splitting the file',
                xy=(ln[-1], split[-1]/2), xytext=(ln[-3], openms[-1]*0.8),
                fontsize=9.5, color=INK, ha='center', arrowprops=dict(arrowstyle='->', color=INK2, lw=1))
    fig.text(0.5, -0.02, 'The viewport validates ~500 lines, but every keystroke still allocates a full line array. '
             'Fixable by slicing only the needed window.', ha='center', fontsize=8.5, color=INK2)
    save(fig, 'weak2_split_floor.png')


def weak3_gff3_model():
    r = load('bench_gff3.json')['rows']; ln = [x['lines'] for x in r]
    fig, (axL, axR) = plt.subplots(1, 2, figsize=(13.5, 5.2)); fig.subplots_adjust(wspace=0.26)
    axL.plot(ln, [x['flat_ms'] for x in r], '-o', color=BLUE, lw=2, ms=5, label='flat (no Parent)')
    axL.plot(ln, [x['hier_ms'] for x in r], '-D', color=RED, lw=2, ms=5, label='hierarchical (gene→…→CDS)')
    axL.set_xscale('log'); axL.set_yscale('log'); axL.set_xlabel('GFF3 lines'); axL.set_ylabel('validation time (ms)')
    axL.set_title('(left) time — rebuilt every keystroke'); axL.legend(fontsize=9); axL.xaxis.set_major_formatter(FuncFormatter(kfmt))
    axR.plot(ln, [x['flat_heap_mb'] for x in r], '-o', color=BLUE, lw=2, ms=5, label='flat')
    axR.plot(ln, [x['hier_heap_mb'] for x in r], '-D', color=RED, lw=2, ms=5, label='hierarchical')
    axR.set_xscale('log'); axR.set_xlabel('GFF3 lines'); axR.set_ylabel('heap per validation (MB)')
    axR.set_title('(right) memory — O(n) model, not viewport-bounded'); axR.legend(fontsize=9); axR.xaxis.set_major_formatter(FuncFormatter(kfmt))
    big = r[-1]
    axR.annotate(f"~{big['hier_heap_mb']:.0f} MB at 1M lines\n(every keystroke)",
                 xy=(big['lines'], big['hier_heap_mb']), xytext=(big['lines']*0.06, big['hier_heap_mb']*0.7),
                 fontsize=9, color=INK, ha='left', arrowprops=dict(arrowstyle='->', color=INK2, lw=1))
    fig.suptitle('WEAKNESS W3 — GFF3 rebuilds a full feature+Parent model (O(n) time & memory) per validation',
                 fontsize=13.5, fontweight='bold', y=1.0)
    save(fig, 'weak3_gff3_model.png')


def weak4_vcf_samples():
    r = load('bench_vcf_samples.json')['rows']; s = [x['samples'] for x in r]
    fig, ax = plt.subplots(figsize=(8.6, 5.2))
    ax.plot(s, [x['viewport500_all_ms'] for x in r], '-o', color=RED, lw=2.2, ms=6, label='parse ALL samples (what BioFmt does)')
    ax.plot(s, [x['viewport500_shown_ms'] for x in r], '-D', color=BLUE, lw=2.2, ms=6, label='parse only the 10 shown')
    ax.set_xscale('log'); ax.set_xlabel('cohort size (samples in the VCF)')
    ax.set_ylabel('time to parse a 500-row viewport (ms)')
    ax.set_title('WEAKNESS W4 — VcfPreview parses every sample of every row, shows 10')
    ax.legend(fontsize=9.5, loc='upper left'); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))
    big = r[-1]
    ax.annotate(f"{big['viewport500_all_ms']:.0f} ms vs {big['viewport500_shown_ms']:.0f} ms\n"
                f"({big['wasted_x']:.0f}× wasted at {big['samples']:,} samples)",
                xy=(big['samples'], big['viewport500_all_ms']), xytext=(s[1], big['viewport500_all_ms']*0.5),
                fontsize=9.5, color=INK, ha='left', arrowprops=dict(arrowstyle='->', color=INK2, lw=1))
    fig.text(0.5, -0.02, 'A 1000-Genomes-scale VCF (2504 samples) wastes ~0.6 s per viewport on samples never rendered. '
             'Fixable by parsing only visible sample columns.', ha='center', fontsize=8.5, color=INK2)
    save(fig, 'weak4_vcf_samples.png')


def weaknesses_dashboard():
    depth = load('bench_bam_depth.json'); dep = depth['rows']; cap = depth['meta']['cap']
    v = vcf(load('bench_after.json')['rows']); g = load('bench_gff3.json')['rows']; smp = load('bench_vcf_samples.json')['rows']
    fig = plt.figure(figsize=(15, 9)); gs = fig.add_gridspec(2, 2, hspace=0.38, wspace=0.24)

    ax = fig.add_subplot(gs[0, 0]); d = [x['depth'] for x in dep]
    ax.plot(d, [x['materialized'] for x in dep], '-o', color=RED, lw=2, ms=4, label='materialized')
    ax.plot(d, [x['displayed'] for x in dep], '-s', color=BLUE, lw=2, ms=4, label='displayed (cap)')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(a) W1: BAM reads all, shows 10K')
    ax.set_xlabel('coverage depth (reads/window)'); ax.set_ylabel('records'); ax.legend(fontsize=8.5); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[0, 1]); ln = [r['lines'] for r in v]
    split = [r['split_ms'] for r in v]; work = [max(0, r['validate_open_ms'] - r['split_ms']) for r in v]
    ax.stackplot(ln, split, work, colors=[RED, AQUA], alpha=0.85, labels=['full-file split', 'viewport work'])
    ax.set_xscale('log'); ax.set_title('(b) W2: split-floor in viewport validation')
    ax.set_xlabel('VCF records'); ax.set_ylabel('per-keystroke ms'); ax.legend(fontsize=8.5, loc='upper left'); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[1, 0]); gl = [x['lines'] for x in g]
    ax.plot(gl, [x['hier_heap_mb'] for x in g], '-D', color=RED, lw=2, ms=4, label='hierarchical')
    ax.plot(gl, [x['flat_heap_mb'] for x in g], '-o', color=ORANGE, lw=2, ms=4, label='flat')
    ax.set_xscale('log'); ax.set_title('(c) W3: GFF3 model heap (per keystroke)')
    ax.set_xlabel('GFF3 lines'); ax.set_ylabel('heap (MB)'); ax.legend(fontsize=8.5); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    ax = fig.add_subplot(gs[1, 1]); s = [x['samples'] for x in smp]
    ax.plot(s, [x['viewport500_all_ms'] for x in smp], '-o', color=RED, lw=2, ms=4, label='parse all samples')
    ax.plot(s, [x['viewport500_shown_ms'] for x in smp], '-D', color=BLUE, lw=2, ms=4, label='parse shown 10')
    ax.set_xscale('log'); ax.set_title('(d) W4: population-VCF sample parsing')
    ax.set_xlabel('cohort size (samples)'); ax.set_ylabel('500-row viewport ms'); ax.legend(fontsize=8.5, loc='upper left'); ax.xaxis.set_major_formatter(FuncFormatter(kfmt))

    fig.suptitle('BioFmt — measured weaknesses worth fixing (large-file & population-scale paths)', fontsize=16, fontweight='bold', y=0.97)
    save(fig, 'weaknesses_dashboard.png')


def main():
    print('Rendering deep-dive figures...')
    strengths_dashboard()
    weak1_bam_depth(); weak2_split_floor(); weak3_gff3_model(); weak4_vcf_samples()
    weaknesses_dashboard()
    print(f'Done. Figures in {os.path.relpath(FIG, HERE)}/')

if __name__ == '__main__':
    main()
