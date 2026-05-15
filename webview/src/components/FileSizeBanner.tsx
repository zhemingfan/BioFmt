// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactElement } from 'react';
import type { DocumentMetadata } from '../types';

interface FileSizeBannerProps {
  metadata: DocumentMetadata;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFormatAdvice(languageId: string): string | null {
  switch (languageId) {
    case 'omics-sam':
      return 'Convert to BAM with "samtools view -bS file.sam | samtools sort -o file.bam && samtools index file.bam" — BioFmt can open indexed BAM files with no size limit.';
    case 'omics-vcf':
      return 'Compress and index with "bgzip file.vcf && tabix -p vcf file.vcf.gz" — BioFmt can open indexed VCF.gz files with no size limit.';
    case 'omics-fasta':
      return 'FASTA reference files are typically too large for text preview. Use "samtools faidx" for indexed access, or a genome browser like IGV.';
    case 'omics-fastq':
      return 'FASTQ files from sequencing runs are typically 1\u2013100 GB. Use FastQC or MultiQC for quality assessment instead of interactive preview.';
    case 'omics-bed':
    case 'omics-narrowpeak':
    case 'omics-broadpeak':
      return 'Compress and index with "bgzip file.bed && tabix -p bed file.bed.gz" for region-based access.';
    case 'omics-gff3':
      return 'Compress and index with "bgzip file.gff3 && tabix -p gff file.gff3.gz" for region-based access.';
    case 'omics-gtf':
      return 'Sort and index: "sort -k1,1 -k4,4n file.gtf | bgzip > file.gtf.gz && tabix -p gff file.gtf.gz" for region-based access.';
    case 'omics-bedgraph':
    case 'omics-wig':
      return 'Convert to bigWig format for efficient indexed access in genome browsers.';
    default:
      return null;
  }
}

export function FileSizeBanner({ metadata }: FileSizeBannerProps): ReactElement | null {
  const maxLines = metadata.previewSettings?.maxLines ?? 200000;
  const maxBytes = metadata.previewSettings?.maxBytes ?? 52428800;

  const exceedsLines = metadata.lineCount > maxLines;
  const exceedsBytes = metadata.fileSize != null && metadata.fileSize > maxBytes;

  if (!exceedsLines && !exceedsBytes) return null;

  const advice = getFormatAdvice(metadata.languageId);

  const parts: string[] = [];
  if (exceedsLines) {
    parts.push(`${metadata.lineCount.toLocaleString()} lines (limit: ${maxLines.toLocaleString()})`);
  }
  if (exceedsBytes && metadata.fileSize != null) {
    parts.push(`${formatBytes(metadata.fileSize)} (limit: ${formatBytes(maxBytes)})`);
  }

  return (
    <div className="file-size-banner">
      <div className="file-size-banner-header">
        <span className="file-size-banner-icon">&#9888;</span>
        <span className="file-size-banner-title">File exceeds preview limits</span>
      </div>
      <div className="file-size-banner-details">
        {parts.map((part, i) => (
          <span key={i} className="file-size-banner-stat">{part}</span>
        ))}
      </div>
      <div className="file-size-banner-message">
        Preview is showing a truncated view of this file.
        {exceedsLines && ` Only the first ${maxLines.toLocaleString()} lines are displayed.`}
      </div>
      {advice && (
        <div className="file-size-banner-advice">
          <span className="file-size-banner-advice-label">Recommendation:</span> {advice}
        </div>
      )}
      <div className="file-size-banner-config">
        Limits are configurable via Settings: <code>biofmt.preview.maxLines</code> and <code>biofmt.preview.maxBytes</code>
      </div>
    </div>
  );
}
