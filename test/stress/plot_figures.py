#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Generate presentation-quality figures for the BioFmt performance analysis.

Reads the real-code benchmark datasets produced by bench.ts / bench_header.ts and
renders a cohesive figure set (consistent palette, thin marks, direct labels,
single-axis, recessive grid) into test/stress/figures/.

Datasets:
  results/bench_before.json  - full sweep on the pre-fix validators
  results/bench_after.json   - full sweep on the fixed validators
  results/bench_header.json  - parseVcfHeader old(split-file) vs new(prefix-scan)
"""

import json
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'results')
FIG = os.path.join(HERE, 'figures')
os.makedirs(FIG, exist_ok=True)

# ---- validated categorical palette (from the dataviz reference instance) ----
BLUE, AQUA, YELLOW, GREEN = '#2a78d6', '#1baf7a', '#eda100', '#008300'
VIOLET, RED, MAGENTA, ORANGE = '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'
INK, INK2, MUTED, GRID = '#0b0b0b', '#52514e', '#898781', '#e1e0d9'
SURFACE = '#fcfcfb'

FORMAT_COLOR = {
    'VCF': BLUE, 'BED': AQUA, 'SAM': RED, 'GFF3': VIOLET, 'GTF': ORANGE,
    'PAF': MAGENTA, 'bedGraph': YELLOW, 'FASTA': GREEN, 'FASTQ': '#0d366b',
}

plt.rcParams.update({
    'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE,
    'font.family': 'sans-serif',
    'font.sans-serif': ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans'],
    'font.size': 11, 'axes.titlesize': 13, 'axes.titleweight': 'bold',
    'axes.labelsize': 11, 'axes.labelcolor': INK2, 'text.color': INK,
    'axes.edgecolor': MUTED, 'axes.linewidth': 0.8, 'xtick.color': MUTED,
    'ytick.color': MUTED, 'axes.grid': True, 'grid.color': GRID,
    'grid.linewidth': 0.7, 'grid.alpha': 0.9, 'legend.frameon': False,
    'axes.spines.top': False, 'axes.spines.right': False,
})


def load(name):
    with open(os.path.join(RES, name)) as f:
        return json.load(f)


def rows_for(data, fmt):
    r = [x for x in data['rows'] if x['format'] == fmt]
    return sorted(r, key=lambda x: x['lines'])


def thousands(x, _):
    if x >= 1e6:
        return f'{x/1e6:.0f}M'
    if x >= 1e3:
        return f'{x/1e3:.0f}K'
    return f'{x:.0f}'


def save(fig, name):
    path = os.path.join(FIG, name)
    fig.savefig(path, dpi=200, bbox_inches='tight')
    plt.close(fig)
    print(f'  wrote {os.path.relpath(path, HERE)}')


# ============================================================================
# Fig 1 — Viewport-aware validation vs full-file (VCF)
# ============================================================================
def fig_viewport(after):
    v = rows_for(after, 'VCF')
    lines = [r['lines'] for r in v]
    fig, ax = plt.subplots(figsize=(8, 5))
    series = [
        ('Full file (per open, strict)', 'validate_full_ms', RED, 'o', '-'),
        ('Viewport @ scroll', 'validate_scroll_ms', YELLOW, 's', '-'),
        ('Viewport @ open (top)', 'validate_open_ms', BLUE, 'D', '-'),
        ('split(\\n) floor', 'split_ms', MUTED, None, '--'),
    ]
    for label, key, color, marker, ls in series:
        ax.plot(lines, [r[key] for r in v], ls, color=color, marker=marker,
                markersize=5, linewidth=2, label=label, zorder=3)
    ax.set_xscale('log'); ax.set_yscale('log')
    ax.set_xlabel('VCF records (lines)')
    ax.set_ylabel('validation latency (ms)')
    ax.set_title('Viewport-aware validation keeps per-edit latency bounded')
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc='upper left', fontsize=9.5)
    # annotate the gap at 1M
    full1m = v[-1]['validate_full_ms']; open1m = v[-1]['validate_open_ms']
    ax.annotate(f'{full1m/open1m:.0f}x cheaper\nper keystroke',
                xy=(lines[-1], open1m), xytext=(lines[-1]*0.18, open1m*6),
                fontsize=10, color=INK, ha='center',
                arrowprops=dict(arrowstyle='->', color=INK2, lw=1.2))
    fig.text(0.5, -0.02,
             'Full-file validation is O(n) and reaches ~2.9 s at 1M variants; the viewport path '
             'validates ~500 lines around the cursor and stays ~70 ms.',
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'fig1_viewport_vs_full.png')


# ============================================================================
# Fig 2 — parseVcfHeader O(file) -> O(header) [before/after fix]
# ============================================================================
def fig_header(header):
    r = sorted(header['rows'], key=lambda x: x['dataLines'])
    n = [x['dataLines'] for x in r]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(n, [x['old_ms'] for x in r], '-o', color=RED, markersize=5, linewidth=2,
            label='Before: split whole file  — O(file)', zorder=3)
    ax.plot(n, [x['new_ms'] for x in r], '-D', color=BLUE, markersize=5, linewidth=2,
            label='After: scan header prefix — O(header)', zorder=3)
    ax.set_xscale('log'); ax.set_yscale('log')
    ax.set_xlabel('VCF data lines (fixed 92-line header)')
    ax.set_ylabel('header parse latency (ms)')
    ax.set_title('parseVcfHeader optimization: runs on every hover / completion / validation')
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc='upper left', fontsize=10)
    last = r[-1]
    ax.annotate(f'{last["speedup"]:.0f}x faster\nat {last["dataLines"]/1e6:.0f}M lines '
                f'({last["old_ms"]:.0f} ms -> {last["new_ms"]:.2f} ms)',
                xy=(n[-1], last['new_ms']), xytext=(n[-1]*0.12, last['new_ms']*30),
                fontsize=10, color=INK, ha='center',
                arrowprops=dict(arrowstyle='->', color=INK2, lw=1.2))
    save(fig, 'fig2_header_parse_before_after.png')


# ============================================================================
# Fig 3 — Full-file validation throughput by format
# ============================================================================
def fig_throughput(after):
    fmts = ['VCF', 'BED', 'SAM', 'GFF3', 'GTF', 'PAF', 'bedGraph', 'FASTA', 'FASTQ']
    vals = []
    for f in fmts:
        rr = rows_for(after, f)
        big = [r for r in rr if r['lines'] >= 500_000] or rr
        vals.append(big[-1]['full_throughput_mb_s'])
    order = sorted(range(len(fmts)), key=lambda i: vals[i])
    fmts = [fmts[i] for i in order]; vals = [vals[i] for i in order]
    # sequential blue ramp by value
    vmax = max(vals)
    ramp = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
    colors = [ramp[min(len(ramp) - 1, int((val / vmax) * (len(ramp) - 1)))] for val in vals]
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.barh(fmts, vals, color=colors, edgecolor=SURFACE, linewidth=1.2, zorder=3)
    ax.set_xlabel('full-file validation throughput (MB/s, strict)')
    ax.set_title('Validator throughput by format (larger = lighter per-line work)')
    ax.grid(False, axis='y')
    for b, val in zip(bars, vals):
        ax.text(b.get_width() * 1.02, b.get_y() + b.get_height() / 2,
                f'{val:,.0f}', va='center', fontsize=9.5, color=INK)
    ax.set_xlim(0, vmax * 1.15)
    fig.text(0.5, -0.02,
             'Measured on the actual production validators at ~0.5–1M lines. VCF does the heaviest '
             'per-line work (INFO/FORMAT/genotype cross-checks); FASTA/FASTQ are near-linear scans.',
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'fig3_throughput_by_format.png')


# ============================================================================
# Fig 4 — Validation latency scales linearly (O(n))
# ============================================================================
def fig_scaling(after):
    fmts = ['VCF', 'GFF3', 'SAM', 'BED', 'FASTA']
    fig, ax = plt.subplots(figsize=(8, 5))
    for f in fmts:
        rr = rows_for(after, f)
        ax.plot([r['lines'] for r in rr], [r['validate_full_ms'] for r in rr],
                '-o', color=FORMAT_COLOR[f], markersize=4, linewidth=1.8, label=f, zorder=3)
    ax.set_xscale('log'); ax.set_yscale('log')
    ax.set_xlabel('records (lines)')
    ax.set_ylabel('full-file validation latency (ms)')
    ax.set_title('Full-file validation is linear in file size (slope 1 on log-log)')
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc='upper left', fontsize=9.5, ncol=2)
    # reference slope-1 guide
    x0, x1 = 1e4, 1e6
    y0 = 3
    ax.plot([x0, x1], [y0, y0 * (x1 / x0)], ':', color=MUTED, linewidth=1.3, zorder=1)
    ax.text(x1 * 0.5, y0 * (x1 / x0) * 0.55, 'slope = 1\n(linear)', fontsize=8.5,
            color=MUTED, ha='center')
    save(fig, 'fig4_linear_scaling.png')


# ============================================================================
# Fig 5 — Memory footprint of a full validation vs file size
# ============================================================================
def fig_memory(after):
    fmts = ['VCF', 'SAM', 'GFF3', 'BED']
    fig, ax = plt.subplots(figsize=(8, 5))
    for f in fmts:
        rr = rows_for(after, f)
        ax.plot([r['size_mb'] for r in rr], [r['heap_full_mb'] for r in rr],
                '-o', color=FORMAT_COLOR[f], markersize=4, linewidth=1.8, label=f, zorder=3)
    ax.set_xlabel('file size (MB)')
    ax.set_ylabel('heap allocated for one full validation (MB)')
    ax.set_title('Validation memory scales with file size (transient split + diagnostics)')
    ax.legend(loc='upper left', fontsize=9.5)
    fig.text(0.5, -0.02,
             'Peak transient heap for a single whole-file validation. The viewport path avoids this '
             'per keystroke by validating only the visible window.',
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'fig5_memory_scaling.png')


# ============================================================================
# Fig 6 — VCF FORMAT field-parser throughput (real webview parsers)
# ============================================================================
def fig_field_parsers(after):
    fp = after['fieldParsers']
    labels = ['parseGenotype\n"0/1"', 'parseGenotype\n"0|1|2" (phased)',
              'parseAllelicDepth\n"34,12,3"', 'parsePhredLikelihoods\n6 values']
    keys = ['parseGenotype_M_per_s', 'parseGenotypePhased_M_per_s',
            'parseAllelicDepth_M_per_s', 'parsePhredLikelihoods_M_per_s']
    vals = [fp[k] for k in keys]
    colors = [BLUE, AQUA, ORANGE, VIOLET]
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(labels, vals, color=colors, edgecolor=SURFACE, linewidth=1.2, zorder=3)
    ax.set_ylabel('throughput (million parses / second)')
    ax.set_title('VCF genotype-field parsers (webview preview render path)')
    ax.grid(False, axis='x')
    for b, val in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, val * 1.02, f'{val:.0f}M/s',
                ha='center', fontsize=9.5, color=INK)
    ax.set_ylim(0, max(vals) * 1.15)
    ax.tick_params(axis='x', labelsize=8.5)
    fig.text(0.5, -0.03,
             'At >14M parses/s, a 500-row x 10-sample viewport (~5000 genotype parses) renders in well '
             'under a millisecond.',
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'fig6_field_parser_throughput.png')


# ============================================================================
# Fig 7 — Combined results dashboard (single presentation slide)
# ============================================================================
def fig_dashboard(after, header):
    fig = plt.figure(figsize=(15, 9))
    gs = fig.add_gridspec(2, 2, hspace=0.34, wspace=0.22)

    # (a) viewport vs full
    ax = fig.add_subplot(gs[0, 0])
    v = rows_for(after, 'VCF'); lines = [r['lines'] for r in v]
    ax.plot(lines, [r['validate_full_ms'] for r in v], '-o', color=RED, ms=4, lw=2, label='full file')
    ax.plot(lines, [r['validate_open_ms'] for r in v], '-D', color=BLUE, ms=4, lw=2, label='viewport')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(a) Viewport vs full-file validation (VCF)')
    ax.set_xlabel('records'); ax.set_ylabel('latency (ms)'); ax.legend(fontsize=9)
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))

    # (b) header before/after
    ax = fig.add_subplot(gs[0, 1])
    r = sorted(header['rows'], key=lambda x: x['dataLines']); n = [x['dataLines'] for x in r]
    ax.plot(n, [x['old_ms'] for x in r], '-o', color=RED, ms=4, lw=2, label='before (O(file))')
    ax.plot(n, [x['new_ms'] for x in r], '-D', color=BLUE, ms=4, lw=2, label='after (O(header))')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(b) parseVcfHeader optimization')
    ax.set_xlabel('data lines'); ax.set_ylabel('header parse (ms)'); ax.legend(fontsize=9)
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))

    # (c) throughput by format
    ax = fig.add_subplot(gs[1, 0])
    fmts = ['VCF', 'BED', 'SAM', 'GFF3', 'GTF', 'PAF', 'bedGraph', 'FASTA', 'FASTQ']
    vals = []
    for f in fmts:
        rr = rows_for(after, f); big = [x for x in rr if x['lines'] >= 500_000] or rr
        vals.append(big[-1]['full_throughput_mb_s'])
    order = sorted(range(len(fmts)), key=lambda i: vals[i])
    fmts = [fmts[i] for i in order]; vals = [vals[i] for i in order]
    ax.barh(fmts, vals, color=BLUE, edgecolor=SURFACE, linewidth=1.2)
    ax.set_title('(c) Validator throughput by format'); ax.set_xlabel('MB/s'); ax.grid(False, axis='y')
    for i, val in enumerate(vals):
        ax.text(val * 1.02, i, f'{val:,.0f}', va='center', fontsize=8, color=INK)
    ax.set_xlim(0, max(vals) * 1.18)

    # (d) linear scaling
    ax = fig.add_subplot(gs[1, 1])
    for f in ['VCF', 'GFF3', 'SAM', 'BED', 'FASTA']:
        rr = rows_for(after, f)
        ax.plot([x['lines'] for x in rr], [x['validate_full_ms'] for x in rr], '-o',
                color=FORMAT_COLOR[f], ms=3, lw=1.6, label=f)
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(d) Latency is linear in file size')
    ax.set_xlabel('records'); ax.set_ylabel('full validation (ms)'); ax.legend(fontsize=8, ncol=2)
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))

    fig.suptitle('BioFmt — real-code validator performance on large omics files',
                 fontsize=16, fontweight='bold', y=0.97)
    save(fig, 'fig7_results_dashboard.png')


def main():
    before = load('bench_before.json')
    after = load('bench_after.json')
    header = load('bench_header.json')
    print('Rendering figures...')
    fig_viewport(after)
    fig_header(header)
    fig_throughput(after)
    fig_scaling(after)
    fig_memory(after)
    fig_field_parsers(after)
    fig_dashboard(after, header)
    print(f'Done. Figures in {os.path.relpath(FIG, HERE)}/')


if __name__ == '__main__':
    main()
