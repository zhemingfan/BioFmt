#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Competitive comparison figures: BioFmt vs the three VS Code extensions
(bioSyntax, BAM Reader, BioCoderX) on the features that actually overlap.

Reads:
  results/bench_bam.json        - BAM time-to-view: BioFmt indexed query vs BAM Reader whole-file convert
  results/bench_highlight.json  - TextMate tokenization throughput: BioFmt vs bioSyntax grammars
Renders into figures/ (cmp_*.png).
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
def thousands(x, _):
    return f'{x/1e6:.0f}M' if x >= 1e6 else (f'{x/1e3:.0f}K' if x >= 1e3 else f'{x:.0f}')
def save(fig, n):
    p = os.path.join(FIG, n); fig.savefig(p, dpi=200, bbox_inches='tight'); plt.close(fig)
    print(f'  wrote {os.path.relpath(p, HERE)}')


# ── cmp1: BAM time-to-first-view vs file size ──────────────────────────────
def cmp_bam():
    r = sorted(load('bench_bam.json')['rows'], key=lambda x: x['reads'])
    reads = [x['reads'] for x in r]
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    ax.plot(reads, [x['bamReader_ms'] for x in r], '-o', color=RED, lw=2.2, ms=6,
            label='BAM Reader — convert whole file (samtools view -> CSV)', zorder=3)
    ax.plot(reads, [x['biofmt_open_ms'] for x in r], '-D', color=BLUE, lw=2.2, ms=6,
            label='BioFmt — indexed query on open (chr1:0–1Mb)', zorder=3)
    ax.plot(reads, [x['biofmt_nav_ms'] for x in r], '-s', color=AQUA, lw=2.2, ms=6,
            label='BioFmt — jump to a region (indexed, 100 kb)', zorder=3)
    ax.set_yscale('log'); ax.set_xscale('log')
    ax.set_xlabel('BAM size (reads)'); ax.set_ylabel('time to first view (ms, log scale)')
    ax.set_title('Opening a BAM: indexed region query vs whole-file conversion')
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))
    ax.legend(loc='center left', fontsize=9)
    # annotate the gap at 2M
    big = next(x for x in r if x['reads'] == 2_000_000)
    ax.annotate(f"{big['bamReader_ms']/big['biofmt_open_ms']:.0f}× faster to open\n"
                f"({big['bamReader_ms']/1000:.0f} s -> {big['biofmt_open_ms']:.0f} ms at 2M reads)",
                xy=(2_000_000, big['biofmt_open_ms']), xytext=(2.2e5, 300),
                fontsize=10, color=INK, ha='left', arrowprops=dict(arrowstyle='->', color=INK2, lw=1.2))
    fig.text(0.5, -0.02, "BAM Reader must decompress and convert the ENTIRE file before you see anything; "
             "BioFmt reads only the records overlapping the queried window via the .bai index.",
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'cmp1_bam_open_time.png')


# ── cmp2: highlighting tokenization throughput (grouped bars) ──────────────
def cmp_highlight():
    r = load('bench_highlight.json')['rows']
    fmts = [x['format'].upper() for x in r]
    bio = [x['biofmt_klines_s'] for x in r]
    bs = [x['biosyntax_klines_s'] for x in r]
    x = np.arange(len(fmts)); w = 0.38
    fig, ax = plt.subplots(figsize=(9, 5.2))
    b1 = ax.bar(x - w/2, bio, w, color=BLUE, edgecolor=SURFACE, linewidth=1, label='BioFmt', zorder=3)
    b2 = ax.bar(x + w/2, bs, w, color=ORANGE, edgecolor=SURFACE, linewidth=1, label='bioSyntax', zorder=3)
    ax.set_xticks(x); ax.set_xticklabels(fmts)
    ax.set_ylabel('tokenization throughput (thousand lines / second)')
    ax.set_title('Syntax-highlighting speed on the same file (identical TextMate engine)')
    ax.legend(loc='upper left', fontsize=10); ax.grid(False, axis='x')
    for bars in (b1, b2):
        for b in bars:
            ax.text(b.get_x() + b.get_width()/2, b.get_height() * 1.02, f'{b.get_height():.0f}',
                    ha='center', fontsize=8, color=INK2)
    ax.set_ylim(0, max(bio + bs) * 1.15)
    fig.text(0.5, -0.02, "Same vscode-textmate engine both tools run under, so this isolates grammar efficiency. "
             "BioFmt highlights line-level (scales to large files); bioSyntax colors every base (see next figure).",
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'cmp2_highlight_throughput.png')


# ── cmp3: why FASTA/FASTQ differ — tokens emitted per line ─────────────────
def cmp_tokens_per_line():
    r = load('bench_highlight.json')['rows']
    fmts = [x['format'].upper() for x in r]
    bio = [x['biofmt_tokens'] / x['lines'] for x in r]
    bs = [x['biosyntax_tokens'] / x['lines'] for x in r]
    x = np.arange(len(fmts)); w = 0.38
    fig, ax = plt.subplots(figsize=(9, 5.2))
    ax.bar(x - w/2, bio, w, color=BLUE, edgecolor=SURFACE, linewidth=1, label='BioFmt', zorder=3)
    ax.bar(x + w/2, bs, w, color=ORANGE, edgecolor=SURFACE, linewidth=1, label='bioSyntax', zorder=3)
    ax.set_xticks(x); ax.set_xticklabels(fmts)
    ax.set_ylabel('tokens emitted per line')
    ax.set_title('Why the gap: bioSyntax colors per-base, BioFmt colors per-field')
    ax.legend(loc='upper left', fontsize=10); ax.grid(False, axis='x')
    for i in range(len(fmts)):
        ax.text(x[i]-w/2, bio[i]+0.5, f'{bio[i]:.0f}', ha='center', fontsize=8, color=INK2)
        ax.text(x[i]+w/2, bs[i]+0.5, f'{bs[i]:.0f}', ha='center', fontsize=8, color=INK2)
    fig.text(0.5, -0.02, "On FASTA/FASTQ bioSyntax emits ~60 tokens/line (one per nucleotide) — pretty on short "
             "sequences, but why it is ~30× slower on large ones. BioFmt trades per-base color for scale.",
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'cmp3_tokens_per_line.png')


# ── cmp4: capability matrix (feature coverage) ─────────────────────────────
def cmp_matrix():
    tools = ['BioFmt', 'bioSyntax', 'BAM Reader', 'BioCoderX']
    caps = ['Syntax highlighting', 'Validation / diagnostics', 'Interactive large-file preview',
            'Indexed BAM/tabix access', 'Proteomics (mzTab/MGF)', 'Formats supported']
    # 1 = yes, 0 = no, 0.5 = partial; last row holds text (format counts)
    grid = [
        [1, 1, 0, 0],       # highlighting
        [1, 0, 0, 0],       # validation
        [1, 0, 0.5, 0],     # interactive preview (BAM Reader = CSV dump, partial)
        [1, 0, 0, 0],       # indexed BAM/tabix
        [1, 0, 0, 0],       # proteomics
    ]
    counts = ['~27', '~11', '1', '~8']
    fig, ax = plt.subplots(figsize=(9.5, 5.2))
    ax.set_xlim(0, len(tools)); ax.set_ylim(0, len(caps)); ax.invert_yaxis(); ax.axis('off')
    C_YES, C_NO, C_PART = '#1baf7a', '#eceae4', '#eda100'
    for ri, row in enumerate(grid):
        for ci, v in enumerate(row):
            color = C_YES if v == 1 else (C_PART if v == 0.5 else C_NO)
            ax.add_patch(plt.Rectangle((ci + 0.04, ri + 0.04), 0.92, 0.92, color=color, zorder=2))
            mark = '✓' if v == 1 else ('~' if v == 0.5 else '✗')
            ax.text(ci + 0.5, ri + 0.5, mark, ha='center', va='center', fontfamily='DejaVu Sans',
                    fontsize=16, color='white' if v else MUTED, fontweight='bold', zorder=3)
    # format-count row
    ri = len(caps) - 1  # place counts in the proteomics row? no — separate; use a text row below
    for ci, c in enumerate(counts):
        ax.text(ci + 0.5, len(caps) + 0.45, c, ha='center', va='center', fontsize=12, color=INK, fontweight='bold')
    ax.text(-0.1, len(caps) + 0.45, 'Formats supported', ha='right', va='center', fontsize=10.5, color=INK2)
    # column headers
    for ci, t in enumerate(tools):
        ax.text(ci + 0.5, -0.35, t, ha='center', va='center', fontsize=11.5,
                color=BLUE if t == 'BioFmt' else INK, fontweight='bold')
    # row labels
    for ri, c in enumerate(caps[:-1]):
        ax.text(-0.1, ri + 0.5, c, ha='right', va='center', fontsize=10.5, color=INK2)
    ax.set_ylim(len(caps) + 1, -0.8)
    ax.set_title('Capability coverage: only BioFmt spans all four in one editor', pad=16)
    fig.text(0.5, 0.02, 'green = supported   amber = partial (BAM Reader dumps the whole file to CSV)   '
             'gray = not offered.   Sources: VS Code Marketplace listings (Jul 2021–Jun 2026).',
             ha='center', fontsize=8.5, color=INK2)
    save(fig, 'cmp4_capability_matrix.png')


# ── cmp5: one-slide competitive dashboard ─────────────────────────────────
def cmp_dashboard():
    bam = sorted(load('bench_bam.json')['rows'], key=lambda x: x['reads'])
    hl = load('bench_highlight.json')['rows']
    fig = plt.figure(figsize=(15, 9))
    gs = fig.add_gridspec(2, 2, hspace=0.38, wspace=0.22)

    # (a) BAM open time
    ax = fig.add_subplot(gs[0, 0])
    reads = [x['reads'] for x in bam]
    ax.plot(reads, [x['bamReader_ms'] for x in bam], '-o', color=RED, lw=2, ms=5, label='BAM Reader (whole file)')
    ax.plot(reads, [x['biofmt_open_ms'] for x in bam], '-D', color=BLUE, lw=2, ms=5, label='BioFmt (indexed query)')
    ax.set_xscale('log'); ax.set_yscale('log'); ax.set_title('(a) Time to open a BAM')
    ax.set_xlabel('reads'); ax.set_ylabel('ms (log)'); ax.legend(fontsize=9)
    ax.xaxis.set_major_formatter(FuncFormatter(thousands))

    # (b) highlighting throughput
    ax = fig.add_subplot(gs[0, 1])
    fmts = [x['format'].upper() for x in hl]; xx = np.arange(len(fmts)); w = 0.38
    ax.bar(xx - w/2, [x['biofmt_klines_s'] for x in hl], w, color=BLUE, label='BioFmt')
    ax.bar(xx + w/2, [x['biosyntax_klines_s'] for x in hl], w, color=ORANGE, label='bioSyntax')
    ax.set_xticks(xx); ax.set_xticklabels(fmts, fontsize=9); ax.grid(False, axis='x')
    ax.set_title('(b) Highlighting throughput'); ax.set_ylabel('k lines/s'); ax.legend(fontsize=9)

    # (c) capability matrix
    ax = fig.add_subplot(gs[1, 0]); ax.axis('off')
    tools = ['BioFmt', 'bioSyntax', 'BAM\nReader', 'BioCoderX']
    caps = ['Highlighting', 'Validation', 'Preview', 'Indexed access', 'Proteomics']
    grid = [[1,1,0,0],[1,0,0,0],[1,0,0.5,0],[1,0,0,0],[1,0,0,0]]
    C_YES, C_NO, C_PART = '#1baf7a', '#eceae4', '#eda100'
    ax.set_xlim(0, len(tools)); ax.set_ylim(len(caps)+0.5, -1.1)
    for ri, row in enumerate(grid):
        for ci, v in enumerate(row):
            ax.add_patch(plt.Rectangle((ci+0.04, ri+0.04), 0.92, 0.92,
                         color=C_YES if v==1 else (C_PART if v==0.5 else C_NO), zorder=2))
            ax.text(ci+0.5, ri+0.5, '✓' if v==1 else ('~' if v==0.5 else '✗'), ha='center', va='center',
                    fontfamily='DejaVu Sans', fontsize=13, color='white' if v else MUTED, fontweight='bold', zorder=3)
    for ci, t in enumerate(tools):
        ax.text(ci+0.5, -0.5, t, ha='center', va='center', fontsize=9.5,
                color=BLUE if t=='BioFmt' else INK, fontweight='bold')
    for ri, c in enumerate(caps):
        ax.text(-0.08, ri+0.5, c, ha='right', va='center', fontsize=9, color=INK2)
    ax.set_title('(c) Capability coverage', pad=18)

    # (d) tokens per line (explains b)
    ax = fig.add_subplot(gs[1, 1])
    ax.bar(xx - w/2, [x['biofmt_tokens']/x['lines'] for x in hl], w, color=BLUE, label='BioFmt')
    ax.bar(xx + w/2, [x['biosyntax_tokens']/x['lines'] for x in hl], w, color=ORANGE, label='bioSyntax')
    ax.set_xticks(xx); ax.set_xticklabels(fmts, fontsize=9); ax.grid(False, axis='x')
    ax.set_title('(d) Tokens/line — bioSyntax colors per-base'); ax.set_ylabel('tokens/line'); ax.legend(fontsize=9)

    fig.suptitle('BioFmt vs VS Code competitors — runtime & capability comparison', fontsize=16, fontweight='bold', y=0.97)
    save(fig, 'cmp5_competitive_dashboard.png')


def main():
    print('Rendering comparison figures...')
    cmp_bam(); cmp_highlight(); cmp_tokens_per_line(); cmp_matrix(); cmp_dashboard()
    print(f'Done. Figures in {os.path.relpath(FIG, HERE)}/')

if __name__ == '__main__':
    main()
