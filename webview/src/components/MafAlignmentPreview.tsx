// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentMetadata } from '../types';

interface MafAlignmentPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface AlignmentBlock {
  index: number;
  score: number;
  sequences: {
    src: string;
    start: number;
    size: number;
    strand: string;
    srcSize: number;
    text: string;
  }[];
  startLine: number;
}

function parseBlocks(rows: string[]): AlignmentBlock[] {
  const blocks: AlignmentBlock[] = [];
  let currentBlock: AlignmentBlock | null = null;
  let blockIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // New alignment block
    if (trimmed.startsWith('a ')) {
      if (currentBlock && currentBlock.sequences.length > 0) {
        blocks.push(currentBlock);
      }

      const scoreMatch = trimmed.match(/score=([0-9.e+-]+)/i);
      currentBlock = {
        index: blockIndex++,
        score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
        sequences: [],
        startLine: i,
      };
      continue;
    }

    // Sequence line
    if (trimmed.startsWith('s ') && currentBlock) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 7) {
        currentBlock.sequences.push({
          src: parts[1],
          start: parseInt(parts[2], 10),
          size: parseInt(parts[3], 10),
          strand: parts[4],
          srcSize: parseInt(parts[5], 10),
          text: parts[6],
        });
      }
    }
  }

  // Don't forget the last block
  if (currentBlock && currentBlock.sequences.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export function MafAlignmentPreview({ metadata, rows, loadedLineCount, onRequestRows }: MafAlignmentPreviewProps) {
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // Parse blocks
  const blocks = useMemo(() => parseBlocks(rows), [rows]);

  // Filter blocks by search term
  const filteredBlocks = useMemo(() => {
    if (!searchTerm) return blocks;
    const term = searchTerm.toLowerCase();
    return blocks.filter(block =>
      block.sequences.some(seq => seq.src.toLowerCase().includes(term))
    );
  }, [blocks, searchTerm]);

  const currentBlock = filteredBlocks[currentBlockIndex] || null;

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setCurrentBlockIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentBlockIndex(prev => Math.min(filteredBlocks.length - 1, prev + 1));
  }, [filteredBlocks.length]);

  const handleFirst = useCallback(() => {
    setCurrentBlockIndex(0);
  }, []);

  const handleLast = useCallback(() => {
    setCurrentBlockIndex(filteredBlocks.length - 1);
  }, [filteredBlocks.length]);

  // Request more data progressively
  const [loadingMore, setLoadingMore] = useState(false);
  const isTruncated = loadedLineCount < metadata.lineCount;

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && isTruncated) {
      setLoadingMore(true);
      onRequestRows(loadedLineCount, Math.min(loadedLineCount + 5000, metadata.lineCount));
    }
  }, [loadingMore, isTruncated, loadedLineCount, metadata.lineCount, onRequestRows]);

  // Reset loading state when rows change
  useEffect(() => {
    setLoadingMore(false);
  }, [rows.length]);

  // Color coding for nucleotides
  const getNucleotideColor = (char: string): string => {
    switch (char.toUpperCase()) {
      case 'A': return 'var(--vscode-charts-green, #4ec9b0)';
      case 'T': return 'var(--vscode-charts-red, #f14c4c)';
      case 'C': return 'var(--vscode-charts-blue, #3794ff)';
      case 'G': return 'var(--vscode-charts-yellow, #cca700)';
      case '-': return 'var(--vscode-descriptionForeground, #858585)';
      default: return 'var(--vscode-foreground, #cccccc)';
    }
  };

  return (
    <div className="maf-alignment-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: MAF (Multiple Alignment)</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Blocks: {blocks.length.toLocaleString()}</span>
          {searchTerm && (
            <span>Filtered: {filteredBlocks.length.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="filter-bar">
        <label>
          Search sequence:
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentBlockIndex(0);
            }}
            placeholder="e.g., hg38.chr1"
          />
        </label>

        <div className="block-navigation">
          <button onClick={handleFirst} disabled={currentBlockIndex === 0}>⏮</button>
          <button onClick={handlePrev} disabled={currentBlockIndex === 0}>◀</button>
          <span className="block-indicator">
            Block {currentBlockIndex + 1} of {filteredBlocks.length}
          </span>
          <button onClick={handleNext} disabled={currentBlockIndex >= filteredBlocks.length - 1}>▶</button>
          <button onClick={handleLast} disabled={currentBlockIndex >= filteredBlocks.length - 1}>⏭</button>
        </div>
      </div>

      {/* Truncation warning */}
      {isTruncated && (
        <div className="truncation-warning">
          Showing {loadedLineCount.toLocaleString()} of {metadata.lineCount.toLocaleString()} lines ({blocks.length} blocks loaded).
          <button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Block display */}
      {currentBlock ? (
        <div className="alignment-block">
          <div className="block-header">
            <span>Score: {currentBlock.score.toFixed(2)}</span>
            <span>Sequences: {currentBlock.sequences.length}</span>
            <span>Line: {currentBlock.startLine + 1}</span>
          </div>

          <div className="sequences-container">
            {currentBlock.sequences.map((seq, idx) => (
              <div key={idx} className="sequence-row">
                <div className="sequence-info">
                  <span className="seq-name" title={seq.src}>{seq.src}</span>
                  <span className="seq-coords">
                    {seq.start.toLocaleString()}-{(seq.start + seq.size).toLocaleString()}
                    {' '}({seq.strand})
                  </span>
                </div>
                <div className="sequence-text">
                  {seq.text.split('').map((char, charIdx) => (
                    <span
                      key={charIdx}
                      className="nucleotide"
                      style={{ color: getNucleotideColor(char) }}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="no-blocks">
          {blocks.length === 0 ? 'No alignment blocks found' : 'No blocks match the search criteria'}
        </div>
      )}
    </div>
  );
}
