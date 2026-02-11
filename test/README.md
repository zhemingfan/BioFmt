# Extra sample omics text formats for VS Code / bioSyntax testing

These are small, human-readable example files across common genomics, transcriptomics, and proteomics text formats.
They are meant for syntax highlighting experiments, not scientific analysis.

## Files included (new vs your previous pack)
Genomics / annotation:
- simpleGff3.gff (GFF3-ish example from Jalview testdata)
- ls_orchid.gbk (GenBank flatfile; Biopython example dataset)

Tracks / signal / peaks:
- wiggleExample.wig (WIG: UCSC example)
- example.bedGraph (bedGraph: minimal example)
- bigNarrowPeak_head200.narrowPeak (narrowPeak: first 200 lines from UCSC bigNarrowPeak example)

Alignments / comparative:
- bigMaf_head120.maf (MAF: first 120 lines from UCSC bigMaf example)
- example.paf (PAF: minimal example line set)
- example.chain (UCSC chain: minimal example)
- example.net (UCSC net: minimal example)
- example.gfa (GFA1: minimal example)

Genotypes:
- example.ped / example.map (PLINK PED/MAP: minimal example)

Transcriptomics matrices:
- matrix.mtx + barcodes.tsv + features.tsv (10x/MatrixMarket-style sparse count matrix)
- example.gct (GCT expression matrix)

Proteomics / metabolomics:
- lipidomics-example.mzTab (mzTab-M 2.0 example from HUPO-PSI)
- MTBLS263.mztab (mzTab-M 2.0 example from HUPO-PSI)
- MouseLiver_negative.mzTab (large mzTab-M 2.0 example from HUPO-PSI; ~1.5MB)
- example.mgf (Mascot Generic Format: minimal example)

## Notes
- Some files are direct upstream examples (UCSC, Biopython, HUPO-PSI). Others are minimal, format-valid examples.
- If you want every single file to be strictly upstream-only (no minimal examples), tell me which formats to prioritize and I’ll swap in upstream samples where available.
