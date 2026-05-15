#!/usr/bin/env python3
"""
BioFmt Stress Test & Limits Visualization

Generates synthetic bioinformatics files at increasing sizes,
measures read/parse throughput, and charts the results against
configured limits.
"""

import os
import sys
import time
import tempfile
import random
import string
import json
import subprocess

# ─── Synthetic file generators ───────────────────────────────────────────────

BASES = "ACGT"

def rand_seq(length):
    return ''.join(random.choice(BASES) for _ in range(length))

def rand_qual(length):
    return ''.join(chr(random.randint(33, 73)) for _ in range(length))

def gen_sam_line(i):
    """Generate a single SAM alignment record."""
    qname = f"read_{i}"
    flag = 0
    rname = f"chr{random.randint(1, 22)}"
    pos = random.randint(1, 250_000_000)
    mapq = random.randint(0, 60)
    seq_len = random.randint(50, 150)
    cigar = f"{seq_len}M"
    seq = rand_seq(seq_len)
    qual = rand_qual(seq_len)
    return f"{qname}\t{flag}\t{rname}\t{pos}\t{mapq}\t{cigar}\t*\t0\t0\t{seq}\t{qual}"

def gen_vcf_line(i):
    """Generate a single VCF data line."""
    chrom = f"chr{random.randint(1, 22)}"
    pos = random.randint(1, 250_000_000)
    ref = random.choice(BASES)
    alt = random.choice([b for b in BASES if b != ref])
    qual = random.randint(10, 99)
    info = f"DP={random.randint(1,500)};AF={random.random():.4f}"
    return f"{chrom}\t{pos}\t.\t{ref}\t{alt}\t{qual}\tPASS\t{info}\tGT:DP\t0/1:{random.randint(1,100)}"

def gen_bed_line(i):
    """Generate a single BED line."""
    chrom = f"chr{random.randint(1, 22)}"
    start = random.randint(0, 250_000_000)
    end = start + random.randint(100, 10000)
    name = f"feature_{i}"
    score = random.randint(0, 1000)
    strand = random.choice(['+', '-'])
    return f"{chrom}\t{start}\t{end}\t{name}\t{score}\t{strand}"

def gen_gff3_line(i):
    """Generate a single GFF3 line."""
    chrom = f"chr{random.randint(1, 22)}"
    start = random.randint(1, 250_000_000)
    end = start + random.randint(100, 50000)
    ftype = random.choice(["gene", "mRNA", "exon", "CDS"])
    score = "."
    strand = random.choice(['+', '-'])
    return f"{chrom}\t.\t{ftype}\t{start}\t{end}\t{score}\t{strand}\t.\tID={ftype}_{i};Name=feature_{i}"

def gen_gtf_line(i):
    """Generate a single GTF line."""
    chrom = f"chr{random.randint(1, 22)}"
    start = random.randint(1, 250_000_000)
    end = start + random.randint(100, 50000)
    ftype = random.choice(["gene", "transcript", "exon", "CDS"])
    strand = random.choice(['+', '-'])
    return f'{chrom}\ttest\t{ftype}\t{start}\t{end}\t.\t{strand}\t.\tgene_id "gene_{i}"; transcript_id "tx_{i}";'

def gen_paf_line(i):
    """Generate a single PAF line."""
    qname = f"query_{i}"
    qlen = random.randint(1000, 100000)
    qstart = random.randint(0, qlen // 2)
    qend = qstart + random.randint(500, qlen // 2)
    strand = random.choice(['+', '-'])
    tname = f"chr{random.randint(1, 22)}"
    tlen = 250_000_000
    tstart = random.randint(0, tlen // 2)
    tend = tstart + (qend - qstart)
    matches = qend - qstart - random.randint(0, 50)
    block_len = qend - qstart
    mapq = random.randint(0, 60)
    return f"{qname}\t{qlen}\t{qstart}\t{qend}\t{strand}\t{tname}\t{tlen}\t{tstart}\t{tend}\t{matches}\t{block_len}\t{mapq}"

def gen_fasta_entry(i, seq_len=1000):
    """Generate a FASTA entry (header + sequence lines)."""
    header = f">sequence_{i} length={seq_len}"
    seq = rand_seq(seq_len)
    # Wrap at 80 chars
    lines = [header]
    for j in range(0, len(seq), 80):
        lines.append(seq[j:j+80])
    return '\n'.join(lines)

def gen_fastq_entry(i, seq_len=150):
    """Generate a FASTQ entry (4 lines)."""
    header = f"@read_{i}"
    seq = rand_seq(seq_len)
    qual = rand_qual(seq_len)
    return f"{header}\n{seq}\n+\n{qual}"

def gen_bedgraph_line(i):
    """Generate a single bedGraph line."""
    chrom = f"chr{random.randint(1, 22)}"
    start = i * 100
    end = start + 100
    value = round(random.uniform(0, 100), 4)
    return f"{chrom}\t{start}\t{end}\t{value}"

def gen_psl_line(i):
    """Generate a single PSL line."""
    matches = random.randint(50, 500)
    mismatches = random.randint(0, 10)
    rep_matches = 0
    n_count = 0
    q_num_insert = random.randint(0, 3)
    q_base_insert = random.randint(0, 100)
    t_num_insert = random.randint(0, 3)
    t_base_insert = random.randint(0, 100)
    strand = random.choice(['+', '-'])
    q_name = f"query_{i}"
    q_size = matches + mismatches + 100
    q_start = 0
    q_end = matches + mismatches
    t_name = f"chr{random.randint(1, 22)}"
    t_size = 250_000_000
    t_start = random.randint(0, t_size)
    t_end = t_start + matches + mismatches
    block_count = 1
    block_sizes = f"{matches+mismatches},"
    q_starts = "0,"
    t_starts = f"{t_start},"
    return f"{matches}\t{mismatches}\t{rep_matches}\t{n_count}\t{q_num_insert}\t{q_base_insert}\t{t_num_insert}\t{t_base_insert}\t{strand}\t{q_name}\t{q_size}\t{q_start}\t{q_end}\t{t_name}\t{t_size}\t{t_start}\t{t_end}\t{block_count}\t{block_sizes}\t{q_starts}\t{t_starts}"


# ─── File generator dispatch ─────────────────────────────────────────────────

FORMATS = {
    'SAM': {
        'header': '@HD\tVN:1.6\tSO:coordinate\n@SQ\tSN:chr1\tLN:249250621\n@SQ\tSN:chr22\tLN:51304566\n',
        'gen_line': gen_sam_line,
        'ext': '.sam',
        'avg_line_bytes': 250,  # approximate
    },
    'VCF': {
        'header': '##fileformat=VCFv4.3\n##INFO=<ID=DP,Number=1,Type=Integer,Description="Depth">\n##INFO=<ID=AF,Number=A,Type=Float,Description="AF">\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Depth">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE1\n',
        'gen_line': gen_vcf_line,
        'ext': '.vcf',
        'avg_line_bytes': 100,
    },
    'BED': {
        'header': '',
        'gen_line': gen_bed_line,
        'ext': '.bed',
        'avg_line_bytes': 50,
    },
    'GFF3': {
        'header': '##gff-version 3\n',
        'gen_line': gen_gff3_line,
        'ext': '.gff3',
        'avg_line_bytes': 80,
    },
    'GTF': {
        'header': '',
        'gen_line': gen_gtf_line,
        'ext': '.gtf',
        'avg_line_bytes': 90,
    },
    'PAF': {
        'header': '',
        'gen_line': gen_paf_line,
        'ext': '.paf',
        'avg_line_bytes': 120,
    },
    'FASTA': {
        'header': '',
        'gen_entry': gen_fasta_entry,
        'ext': '.fasta',
        'avg_line_bytes': 80,
        'multiline': True,
    },
    'FASTQ': {
        'header': '',
        'gen_entry': gen_fastq_entry,
        'ext': '.fastq',
        'avg_line_bytes': 150,
        'multiline': True,
        'lines_per_entry': 4,
    },
    'bedGraph': {
        'header': 'track type=bedGraph name="test"\n',
        'gen_line': gen_bedgraph_line,
        'ext': '.bedGraph',
        'avg_line_bytes': 35,
    },
    'PSL': {
        'header': '',
        'gen_line': gen_psl_line,
        'ext': '.psl',
        'avg_line_bytes': 180,
    },
}

# Test sizes: number of records to generate
# We test from small to beyond the 200K line / 50 MB limits
TEST_SIZES = [100, 1_000, 5_000, 10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000]

def generate_file(fmt_name, num_records, tmpdir):
    """Generate a synthetic file and return (path, actual_bytes, actual_lines, gen_time)."""
    fmt = FORMATS[fmt_name]
    filepath = os.path.join(tmpdir, f"stress_{fmt_name}_{num_records}{fmt['ext']}")

    start = time.time()
    with open(filepath, 'w') as f:
        if fmt['header']:
            f.write(fmt['header'])

        if fmt.get('multiline'):
            # FASTA/FASTQ: each entry is multiple lines
            gen = fmt.get('gen_entry')
            for i in range(num_records):
                f.write(gen(i) + '\n')
        else:
            gen = fmt['gen_line']
            for i in range(num_records):
                f.write(gen(i) + '\n')

    gen_time = time.time() - start
    stat = os.stat(filepath)

    # Count actual lines
    with open(filepath) as f:
        line_count = sum(1 for _ in f)

    return filepath, stat.st_size, line_count, gen_time

def measure_read_throughput(filepath):
    """Measure time to read and split file into lines (simulates extension load)."""
    start = time.time()
    with open(filepath, 'r') as f:
        content = f.read()
    read_time = time.time() - start

    start = time.time()
    lines = content.split('\n')
    split_time = time.time() - start

    return read_time, split_time, len(lines)

def run_stress_tests():
    """Run stress tests across all formats and sizes."""
    results = {}
    tmpdir = tempfile.mkdtemp(prefix='biofmt_stress_')
    print(f"Temp directory: {tmpdir}")
    print(f"{'Format':<12} {'Records':>10} {'Lines':>10} {'Size (MB)':>10} {'Gen (s)':>8} {'Read (s)':>8} {'Split (s)':>9} {'Status':<20}")
    print("=" * 100)

    for fmt_name in FORMATS:
        results[fmt_name] = []
        for num_records in TEST_SIZES:
            # Skip very large sizes for formats with big entries
            if fmt_name == 'FASTA' and num_records > 200_000:
                continue
            if fmt_name == 'FASTQ' and num_records > 500_000:
                continue

            try:
                filepath, size_bytes, line_count, gen_time = generate_file(fmt_name, num_records, tmpdir)
                read_time, split_time, parsed_lines = measure_read_throughput(filepath)

                size_mb = size_bytes / (1024 * 1024)

                # Determine status based on BioFmt limits
                status_parts = []
                if size_bytes > 52_428_800:  # 50 MB
                    status_parts.append("EXCEEDS maxBytes")
                if line_count > 200_000:
                    status_parts.append("EXCEEDS maxLines")
                status = " | ".join(status_parts) if status_parts else "OK"

                print(f"{fmt_name:<12} {num_records:>10,} {line_count:>10,} {size_mb:>10.2f} {gen_time:>8.2f} {read_time:>8.3f} {split_time:>9.4f} {status:<20}")

                results[fmt_name].append({
                    'records': num_records,
                    'lines': line_count,
                    'bytes': size_bytes,
                    'size_mb': size_mb,
                    'gen_time': gen_time,
                    'read_time': read_time,
                    'split_time': split_time,
                    'total_io_time': read_time + split_time,
                    'exceeds_bytes': size_bytes > 52_428_800,
                    'exceeds_lines': line_count > 200_000,
                })

                # Clean up large files to save disk space
                if size_mb > 100:
                    os.unlink(filepath)

            except Exception as e:
                print(f"{fmt_name:<12} {num_records:>10,} {'ERROR':>10} {str(e)[:40]}")
                results[fmt_name].append({
                    'records': num_records,
                    'error': str(e),
                })

    # Clean up remaining files
    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)

    return results


# ─── Visualization ────────────────────────────────────────────────────────────

def create_visualization(results):
    """Create comprehensive visualization of limits and performance."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.ticker import FuncFormatter
    import numpy as np

    # Color palette
    colors = {
        'SAM': '#e74c3c',
        'VCF': '#3498db',
        'BED': '#2ecc71',
        'GFF3': '#9b59b6',
        'GTF': '#f39c12',
        'PAF': '#1abc9c',
        'FASTA': '#e67e22',
        'FASTQ': '#34495e',
        'bedGraph': '#d35400',
        'PSL': '#7f8c8d',
    }

    fig = plt.figure(figsize=(22, 28))
    fig.patch.set_facecolor('#fafafa')

    # ── Panel 1: Max file size per format (theoretical limits) ──
    ax1 = fig.add_subplot(4, 2, 1)

    # Theoretical max lines before hitting 200K line limit
    # and theoretical max MB before hitting 50 MB limit
    format_names = list(FORMATS.keys())
    max_records_by_lines = []
    max_records_by_bytes = []
    effective_max_mb = []

    for fmt_name in format_names:
        fmt = FORMATS[fmt_name]
        avg_bytes = fmt['avg_line_bytes']

        if fmt.get('multiline'):
            if fmt_name == 'FASTA':
                lines_per = 14  # ~1000bp seq = 13 lines + header
                max_by_lines = 200_000 // lines_per
                max_by_bytes = int(52_428_800 / (avg_bytes * lines_per))
            elif fmt_name == 'FASTQ':
                lines_per = 4
                max_by_lines = 200_000 // lines_per
                max_by_bytes = int(52_428_800 / (avg_bytes * lines_per))
            else:
                max_by_lines = 200_000
                max_by_bytes = int(52_428_800 / avg_bytes)
        else:
            max_by_lines = 200_000
            max_by_bytes = int(52_428_800 / avg_bytes)

        max_records_by_lines.append(max_by_lines)
        max_records_by_bytes.append(max_by_bytes)
        effective_max = min(max_by_lines, max_by_bytes)
        effective_max_mb.append(effective_max * avg_bytes / (1024 * 1024))

    # Bar chart of effective max file sizes
    bars = ax1.barh(format_names, effective_max_mb,
                     color=[colors[f] for f in format_names],
                     edgecolor='white', linewidth=0.5, alpha=0.85)
    ax1.axvline(x=50, color='red', linestyle='--', linewidth=2, label='50 MB limit')
    ax1.set_xlabel('Effective Maximum File Size (MB)', fontsize=11)
    ax1.set_title('Maximum Preview-able File Size by Format', fontsize=13, fontweight='bold')
    ax1.legend(fontsize=9)
    ax1.grid(axis='x', alpha=0.3)

    for bar, val in zip(bars, effective_max_mb):
        ax1.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2,
                f'{val:.1f} MB', va='center', fontsize=9)

    # ── Panel 2: Max records per format ──
    ax2 = fig.add_subplot(4, 2, 2)

    effective_max_records = [min(bl, bb) for bl, bb in zip(max_records_by_lines, max_records_by_bytes)]
    bars2 = ax2.barh(format_names, [r/1000 for r in effective_max_records],
                      color=[colors[f] for f in format_names],
                      edgecolor='white', linewidth=0.5, alpha=0.85)
    ax2.axvline(x=200, color='red', linestyle='--', linewidth=2, label='200K line limit')
    ax2.set_xlabel('Maximum Records (thousands)', fontsize=11)
    ax2.set_title('Maximum Previewable Records by Format', fontsize=13, fontweight='bold')
    ax2.legend(fontsize=9)
    ax2.grid(axis='x', alpha=0.3)

    for bar, val in zip(bars2, effective_max_records):
        ax2.text(bar.get_width()/1000 + 2, bar.get_y() + bar.get_height()/2,
                f'{val:,.0f}', va='center', fontsize=9)

    # ── Panel 3: Read throughput vs file size ──
    ax3 = fig.add_subplot(4, 2, (3, 4))

    for fmt_name in format_names:
        data = [r for r in results[fmt_name] if 'error' not in r]
        if not data:
            continue
        sizes = [d['size_mb'] for d in data]
        read_times = [d['read_time'] * 1000 for d in data]  # ms
        ax3.plot(sizes, read_times, 'o-', color=colors[fmt_name],
                label=fmt_name, linewidth=2, markersize=5, alpha=0.8)

    ax3.axvline(x=50, color='red', linestyle='--', linewidth=2, alpha=0.7, label='50 MB limit')
    ax3.set_xlabel('File Size (MB)', fontsize=11)
    ax3.set_ylabel('Read Time (ms)', fontsize=11)
    ax3.set_title('File Read Throughput: Time vs Size', fontsize=13, fontweight='bold')
    ax3.legend(fontsize=8, ncol=5, loc='upper left')
    ax3.grid(alpha=0.3)
    ax3.set_xscale('log')
    ax3.set_yscale('log')

    # ── Panel 4: Line split time vs line count ──
    ax4 = fig.add_subplot(4, 2, (5, 6))

    for fmt_name in format_names:
        data = [r for r in results[fmt_name] if 'error' not in r]
        if not data:
            continue
        lines = [d['lines'] / 1000 for d in data]
        split_times = [d['split_time'] * 1000 for d in data]  # ms
        ax4.plot(lines, split_times, 'o-', color=colors[fmt_name],
                label=fmt_name, linewidth=2, markersize=5, alpha=0.8)

    ax4.axvline(x=200, color='red', linestyle='--', linewidth=2, alpha=0.7, label='200K line limit')
    ax4.set_xlabel('Line Count (thousands)', fontsize=11)
    ax4.set_ylabel('Line Split Time (ms)', fontsize=11)
    ax4.set_title('Line Parsing Throughput: Time vs Line Count', fontsize=13, fontweight='bold')
    ax4.legend(fontsize=8, ncol=5, loc='upper left')
    ax4.grid(alpha=0.3)
    ax4.set_xscale('log')
    ax4.set_yscale('log')

    # ── Panel 5: Comprehensive limits summary ──
    ax5 = fig.add_subplot(4, 2, (7, 8))
    ax5.axis('off')

    # Build summary table
    categories = [
        ('Plain Text\n(SAM, VCF, BED, GFF3,\nGTF, PAF, PSL, etc.)', '50 MB', '200,000 lines', 'Full file loaded\n(within limits)', '#3498db'),
        ('BAM\n(Binary Alignment)', 'Unlimited*', '10,000 / region', 'Indexed via .bai/.csi\n*Requires index', '#e74c3c'),
        ('Tabix-indexed\n(.vcf.gz + .tbi, etc.)', 'Unlimited*', '10,000 / region', 'Region queries\n*Requires .tbi/.csi', '#2ecc71'),
        ('BGZF unindexed\n(.gz without index)', '~50 MB uncompressed', '200,000 lines', 'Full decompression\ninto memory', '#9b59b6'),
        ('Track formats\n(WIG, bedGraph)', '50 MB', '200K lines / 200K pts', 'Downsample at 5K pts\nHard cap 200K pts', '#f39c12'),
        ('Workspace scan\n(background lint)', '10 MB / file', '1,000 lines / file', 'Max 100 files\n2,000 diagnostics', '#7f8c8d'),
    ]

    table_data = []
    cell_colors = []
    for cat, max_size, max_records, notes, color in categories:
        table_data.append([cat, max_size, max_records, notes])
        cell_colors.append([color + '22', '#ffffff', '#ffffff', '#f8f8f8'])

    table = ax5.table(
        cellText=table_data,
        colLabels=['Format Category', 'Max File Size', 'Max Records', 'Notes'],
        cellColours=cell_colors,
        colColours=['#2c3e50'] * 4,
        loc='center',
        cellLoc='center',
    )

    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.0, 2.8)

    # Style header row
    for j in range(4):
        cell = table[0, j]
        cell.set_text_props(color='white', fontweight='bold', fontsize=11)
        cell.set_facecolor('#2c3e50')

    # Style data cells
    for i in range(1, len(categories) + 1):
        for j in range(4):
            cell = table[i, j]
            cell.set_edgecolor('#dee2e6')

    ax5.set_title('BioFmt File Handling Limits Summary', fontsize=14, fontweight='bold', pad=20)

    # Add footnotes
    fig.text(0.05, 0.01,
             'Notes: Limits are configurable via VS Code settings (biofmt.preview.*). '
             'BAM/Tabix files use region-based access with no file size limit. '
             'Viewport validation covers ±500 lines around cursor regardless of file size.',
             fontsize=9, color='#666', style='italic',
             wrap=True)

    plt.tight_layout(rect=[0, 0.03, 1, 0.97])

    # ── Add overall title ──
    fig.suptitle('BioFmt Extension — File Size Limits & Stress Test Results',
                 fontsize=16, fontweight='bold', y=0.99)

    outpath = os.path.join(os.path.dirname(__file__), 'stress_test_results.png')
    fig.savefig(outpath, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
    print(f"\nChart saved to: {outpath}")
    plt.close()

    return outpath


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 100)
    print("BioFmt Stress Test — Generating synthetic files and measuring I/O throughput")
    print("=" * 100)
    print()

    random.seed(42)  # reproducible
    results = run_stress_tests()

    print()
    print("=" * 100)
    print("Generating visualization...")
    print("=" * 100)

    outpath = create_visualization(results)

    # Also save raw results as JSON
    json_path = os.path.join(os.path.dirname(__file__), 'stress_test_results.json')
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Raw results saved to: {json_path}")
