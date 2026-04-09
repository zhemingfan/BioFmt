// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';

export interface IndexInfo {
  /** Type of index found */
  type: 'tbi' | 'csi' | 'bai' | 'fai' | 'gzi';
  /** URI of the index file */
  uri: vscode.Uri;
}

/**
 * Candidate index file patterns for each data file type.
 * Ordered by preference (first match wins).
 */
const INDEX_CANDIDATES: Record<string, { suffix: string; type: IndexInfo['type'] }[]> = {
  '.vcf.gz':   [{ suffix: '.tbi', type: 'tbi' }, { suffix: '.csi', type: 'csi' }],
  '.bed.gz':   [{ suffix: '.tbi', type: 'tbi' }, { suffix: '.csi', type: 'csi' }],
  '.gff3.gz':  [{ suffix: '.tbi', type: 'tbi' }, { suffix: '.csi', type: 'csi' }],
  '.gff.gz':   [{ suffix: '.tbi', type: 'tbi' }, { suffix: '.csi', type: 'csi' }],
  '.bam':      [{ suffix: '.bai', type: 'bai' }, { suffix: '.csi', type: 'csi' }],
  '.fasta':    [{ suffix: '.fai', type: 'fai' }],
  '.fa':       [{ suffix: '.fai', type: 'fai' }],
  '.fasta.gz': [{ suffix: '.fai', type: 'fai' }, { suffix: '.gzi', type: 'gzi' }],
  '.fa.gz':    [{ suffix: '.fai', type: 'fai' }, { suffix: '.gzi', type: 'gzi' }],
};

/**
 * Given a data file URI, discover adjacent index files.
 * Returns the first matching index, or null if none found.
 *
 * For BAM files, also checks the alternate naming convention:
 *   file.bam.bai (standard) AND file.bai (samtools alternate)
 */
export async function discoverIndex(fileUri: vscode.Uri): Promise<IndexInfo | null> {
  const filePath = fileUri.fsPath;

  // Find matching suffix (check longest first to match .vcf.gz before .gz)
  const sortedSuffixes = Object.keys(INDEX_CANDIDATES).sort((a, b) => b.length - a.length);
  const matchedSuffix = sortedSuffixes.find(suffix => filePath.endsWith(suffix));

  if (!matchedSuffix) {
    return null;
  }

  const candidates = INDEX_CANDIDATES[matchedSuffix];

  for (const candidate of candidates) {
    // Standard: file.ext.idx (e.g. file.bam.bai)
    const standardUri = vscode.Uri.file(filePath + candidate.suffix);
    if (await fileExists(standardUri)) {
      return { type: candidate.type, uri: standardUri };
    }

    // Alternate for BAM: file.bai instead of file.bam.bai
    if (matchedSuffix === '.bam' && candidate.type === 'bai') {
      const altPath = filePath.replace(/\.bam$/, '.bai');
      const altUri = vscode.Uri.file(altPath);
      if (await fileExists(altUri)) {
        return { type: candidate.type, uri: altUri };
      }
    }
  }

  return null;
}

/**
 * Discover all index files for a given data file.
 * Returns all found indexes (useful when both .fai and .gzi are needed).
 */
export async function discoverAllIndexes(fileUri: vscode.Uri): Promise<IndexInfo[]> {
  const filePath = fileUri.fsPath;
  const sortedSuffixes = Object.keys(INDEX_CANDIDATES).sort((a, b) => b.length - a.length);
  const matchedSuffix = sortedSuffixes.find(suffix => filePath.endsWith(suffix));

  if (!matchedSuffix) {
    return [];
  }

  const found: IndexInfo[] = [];
  const candidates = INDEX_CANDIDATES[matchedSuffix];

  for (const candidate of candidates) {
    const standardUri = vscode.Uri.file(filePath + candidate.suffix);
    if (await fileExists(standardUri)) {
      found.push({ type: candidate.type, uri: standardUri });
    }

    if (matchedSuffix === '.bam' && candidate.type === 'bai') {
      const altPath = filePath.replace(/\.bam$/, '.bai');
      const altUri = vscode.Uri.file(altPath);
      if (await fileExists(altUri)) {
        found.push({ type: candidate.type, uri: altUri });
      }
    }
  }

  return found;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
