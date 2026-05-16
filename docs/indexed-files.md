# Indexed and Binary Files

BioFmt can open compressed and indexed files directly without decompressing them first.

| File | Required index |
|------|----------------|
| `.vcf.gz` | `.tbi` or `.csi` |
| `.bed.gz` | `.tbi` or `.csi` |
| `.gff3.gz` | `.tbi` or `.csi` |
| `.bam` | `.bai` or `.csi` |

## Region Navigation

Use the region bar to query:

- `chr1:1000000-2000000` for a coordinate range.
- `chr1:500000` for a 10 kb window around a position.
- A selected chromosome from the dropdown.

<img src="gallery-region-navigator.png" alt="Region navigator showing genomic coordinate input and record count for an indexed VCF file" width="800">

## Large File Guidance

For large text files, BioFmt shows a file-size banner with format-specific advice. Common workflows include:

- VCF: `bgzip file.vcf && tabix -p vcf file.vcf.gz`
- BED: `bgzip file.bed && tabix -p bed file.bed.gz`
- GFF3: `bgzip file.gff3 && tabix -p gff file.gff3.gz`
- SAM: convert to sorted BAM and create a `.bai` or `.csi` index
