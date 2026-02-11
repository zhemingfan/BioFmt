// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { generateBedContent, generateBedGraphContent, generateGtfContent, generateSamContent } from './generators';

/**
 * Measure execution time with warmup
 */
function benchmark(
  fn: () => void,
  options: { warmupRuns?: number; measuredRuns?: number } = {}
): { avgMs: number; minMs: number; maxMs: number; stdDevMs: number } {
  const { warmupRuns = 3, measuredRuns = 10 } = options;

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    fn();
  }

  // Measured runs
  const times: number[] = [];
  for (let i = 0; i < measuredRuns; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance = times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { avgMs: avg, minMs: min, maxMs: max, stdDevMs: stdDev };
}

/**
 * Simple BED validation for benchmarking
 */
function validateBedBasic(text: string, maxLines: number): number {
  const lines = text.split('\n');
  let diagnosticCount = 0;
  const limit = Math.min(lines.length, maxLines);

  for (let i = 0; i < limit; i++) {
    const line = lines[i];

    if (!line.trim() || line.startsWith('track') || line.startsWith('browser')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 3) {
      diagnosticCount++;
      continue;
    }

    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnosticCount++;
      continue;
    }

    if (start < 0) diagnosticCount++;
    if (start >= end) diagnosticCount++;
  }

  return diagnosticCount;
}

/**
 * Simple bedGraph validation for benchmarking
 */
function validateBedGraphBasic(text: string, maxLines: number): number {
  const lines = text.split('\n');
  let diagnosticCount = 0;
  const limit = Math.min(lines.length, maxLines);

  for (let i = 0; i < limit; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 4) {
      diagnosticCount++;
      continue;
    }

    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);
    const value = parseFloat(columns[3]);

    if (isNaN(start) || start < 0) diagnosticCount++;
    if (isNaN(end) || end < 0) diagnosticCount++;
    if (!isNaN(start) && !isNaN(end) && start >= end) diagnosticCount++;
    if (isNaN(value)) diagnosticCount++;
  }

  return diagnosticCount;
}

/**
 * Simple GTF parsing for benchmarking
 */
function parseGtfFeatures(text: string, maxLines: number): number {
  const lines = text.split('\n');
  let featureCount = 0;
  const limit = Math.min(lines.length, maxLines);

  for (let i = 0; i < limit; i++) {
    const line = lines[i];

    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    const columns = line.split('\t');
    if (columns.length >= 9) {
      featureCount++;
    }
  }

  return featureCount;
}

/**
 * Simple SAM parsing for benchmarking
 */
function parseSamAlignments(text: string, maxLines: number): number {
  const lines = text.split('\n');
  let alignmentCount = 0;
  const limit = Math.min(lines.length, maxLines);

  for (let i = 0; i < limit; i++) {
    const line = lines[i];

    if (!line.trim() || line.startsWith('@')) {
      continue;
    }

    const columns = line.split('\t');
    if (columns.length >= 11) {
      alignmentCount++;
    }
  }

  return alignmentCount;
}

describe('BED Performance Benchmarks', function () {
  this.timeout(60000);

  describe('Parsing', function () {
    it('should parse 10K BED lines in < 20ms', function () {
      const bedContent = generateBedContent({ lines: 10000, columns: 6 });

      const result = benchmark(() => {
        const lines = bedContent.split('\n');
        for (const line of lines) {
          line.split('\t');
        }
      });

      console.log(`  10K BED line parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 20,
        `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 20ms)`
      );
    });

    it('should parse 100K BED lines in < 200ms', function () {
      const bedContent = generateBedContent({ lines: 100000, columns: 6 });

      console.log(`  File size: ${(bedContent.length / 1024 / 1024).toFixed(2)} MB`);

      const result = benchmark(
        () => {
          const lines = bedContent.split('\n');
          for (const line of lines) {
            line.split('\t');
          }
        },
        { warmupRuns: 2, measuredRuns: 5 }
      );

      console.log(`  100K BED line parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 200,
        `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 200ms)`
      );
    });
  });

  describe('Validation', function () {
    it('should validate 500 BED lines (viewport buffer) in < 20ms', function () {
      const bedContent = generateBedContent({ lines: 1000, columns: 6 });

      const result = benchmark(() => {
        validateBedBasic(bedContent, 500);
      });

      console.log(`  500-line BED validation: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 20,
        `Validation took ${result.avgMs.toFixed(2)}ms (threshold: 20ms)`
      );
    });

    it('should validate 10K BED lines in < 100ms', function () {
      const bedContent = generateBedContent({ lines: 15000, columns: 6 });

      const result = benchmark(() => {
        validateBedBasic(bedContent, 10000);
      });

      console.log(`  10K-line BED validation: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 100,
        `Validation took ${result.avgMs.toFixed(2)}ms (threshold: 100ms)`
      );
    });
  });
});

describe('bedGraph Performance Benchmarks', function () {
  this.timeout(60000);

  describe('Track Data Parsing', function () {
    it('should parse 10K bedGraph points in < 30ms', function () {
      const content = generateBedGraphContent({ lines: 10000 });

      const result = benchmark(() => {
        const lines = content.split('\n');
        const points: Array<{ chrom: string; start: number; end: number; value: number }> = [];
        for (const line of lines) {
          if (line.startsWith('track')) continue;
          const cols = line.split('\t');
          if (cols.length >= 4) {
            points.push({
              chrom: cols[0],
              start: parseInt(cols[1], 10),
              end: parseInt(cols[2], 10),
              value: parseFloat(cols[3]),
            });
          }
        }
      });

      console.log(`  10K bedGraph point parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 30,
        `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 30ms)`
      );
    });

    it('should parse 100K bedGraph points in < 300ms', function () {
      const content = generateBedGraphContent({ lines: 100000 });

      console.log(`  File size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

      const result = benchmark(
        () => {
          const lines = content.split('\n');
          const points: Array<{ chrom: string; start: number; end: number; value: number }> = [];
          for (const line of lines) {
            if (line.startsWith('track')) continue;
            const cols = line.split('\t');
            if (cols.length >= 4) {
              points.push({
                chrom: cols[0],
                start: parseInt(cols[1], 10),
                end: parseInt(cols[2], 10),
                value: parseFloat(cols[3]),
              });
            }
          }
        },
        { warmupRuns: 2, measuredRuns: 5 }
      );

      console.log(`  100K bedGraph point parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 300,
        `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 300ms)`
      );
    });

    it('should validate bedGraph efficiently', function () {
      const content = generateBedGraphContent({ lines: 10000 });

      const result = benchmark(() => {
        validateBedGraphBasic(content, 5000);
      });

      console.log(`  5K bedGraph validation: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 50,
        `Validation took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
      );
    });
  });

  describe('Downsampling Simulation', function () {
    it('should downsample 200K points to 5K efficiently', function () {
      // Generate dense data
      const points: number[] = [];
      for (let i = 0; i < 200000; i++) {
        points.push(Math.sin(i * 0.001) * 100 + 100);
      }

      const result = benchmark(() => {
        // Simple downsampling: take every Nth point
        const targetPoints = 5000;
        const step = Math.ceil(points.length / targetPoints);
        const downsampled: number[] = [];
        for (let i = 0; i < points.length; i += step) {
          downsampled.push(points[i]);
        }
      });

      console.log(`  200K -> 5K downsample: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 10,
        `Downsampling took ${result.avgMs.toFixed(2)}ms (threshold: 10ms)`
      );
    });

    it('should calculate min/max for 200K points efficiently', function () {
      const points: number[] = [];
      for (let i = 0; i < 200000; i++) {
        points.push(Math.sin(i * 0.001) * 100 + 100);
      }

      const result = benchmark(() => {
        let min = Infinity;
        let max = -Infinity;
        for (const p of points) {
          if (p < min) min = p;
          if (p > max) max = p;
        }
      });

      console.log(`  200K point min/max: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 5,
        `Min/max calculation took ${result.avgMs.toFixed(2)}ms (threshold: 5ms)`
      );
    });
  });
});

describe('GTF Performance Benchmarks', function () {
  this.timeout(60000);

  it('should parse 10K GTF features in < 50ms', function () {
    // 100 genes * 2 transcripts * (1 + 5 exons) = 1200 lines per gene set
    // We want ~10K lines, so ~8 gene sets = 800 genes
    const content = generateGtfContent({
      genes: 800,
      transcriptsPerGene: 2,
      exonsPerTranscript: 5,
    });

    const lineCount = content.split('\n').length;
    console.log(`  GTF lines: ${lineCount}`);

    const result = benchmark(() => {
      parseGtfFeatures(content, lineCount);
    });

    console.log(`  GTF feature parse: avg=${result.avgMs.toFixed(2)}ms`);

    assert.ok(
      result.avgMs < 50,
      `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
    );
  });
});

describe('SAM Performance Benchmarks', function () {
  this.timeout(60000);

  it('should parse 10K SAM alignments in < 50ms', function () {
    const content = generateSamContent({
      headerLines: 50,
      alignments: 10000,
    });

    const result = benchmark(() => {
      parseSamAlignments(content, 10500);
    });

    console.log(`  10K SAM alignment parse: avg=${result.avgMs.toFixed(2)}ms`);

    assert.ok(
      result.avgMs < 50,
      `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
    );
  });

  it('should handle large SAM files (50K alignments)', function () {
    const content = generateSamContent({
      headerLines: 100,
      alignments: 50000,
    });

    console.log(`  File size: ${(content.length / 1024 / 1024).toFixed(2)} MB`);

    const result = benchmark(
      () => {
        parseSamAlignments(content, 50100);
      },
      { warmupRuns: 2, measuredRuns: 5 }
    );

    console.log(`  50K SAM alignment parse: avg=${result.avgMs.toFixed(2)}ms`);

    assert.ok(
      result.avgMs < 250,
      `Parsing took ${result.avgMs.toFixed(2)}ms (threshold: 250ms)`
    );
  });
});

describe('Memory Efficiency', function () {
  this.timeout(60000);

  it('should not retain excessive memory after parsing large files', function () {
    // Generate multiple large contents
    const contents: string[] = [];
    for (let i = 0; i < 5; i++) {
      contents.push(generateBedContent({ lines: 50000, columns: 6 }));
    }

    // Force GC if available
    if (global.gc) global.gc();
    const baselineMemory = process.memoryUsage().heapUsed;

    // Parse all files
    for (const content of contents) {
      const lines = content.split('\n');
      for (const line of lines) {
        line.split('\t');
      }
    }

    // Clear references
    contents.length = 0;

    // Force GC if available
    if (global.gc) global.gc();
    const afterMemory = process.memoryUsage().heapUsed;

    const memoryIncreaseMB = (afterMemory - baselineMemory) / 1024 / 1024;
    console.log(`  Memory after parsing 5x50K files and clearing: ${memoryIncreaseMB.toFixed(2)} MB increase`);

    // Memory should not grow excessively after clearing references
    // Note: This test is less reliable without --expose-gc flag
    assert.ok(
      memoryIncreaseMB < 100,
      `Memory increased by ${memoryIncreaseMB.toFixed(2)}MB (threshold: 100MB)`
    );
  });
});
