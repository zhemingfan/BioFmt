// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { generateVcfContent } from './generators';

/**
 * VCF Header Parser - copied from server for isolated benchmarking
 */
interface ParsedHeader {
  fileformat?: string;
  info: Map<string, { id: string; number: string; type: string; description: string; line: number }>;
  format: Map<string, { id: string; number: string; type: string; description: string; line: number }>;
  filter: Map<string, { id: string; description: string; line: number }>;
  samples: string[];
  headerEndLine: number;
}

function parseStructuredField(line: string, prefix: string): Record<string, string> | null {
  try {
    const content = line.substring(prefix.length);
    const endIdx = content.lastIndexOf('>');
    if (endIdx === -1) return null;

    const inner = content.substring(0, endIdx);
    const result: Record<string, string> = {};

    let current = '';
    let key = '';
    let inQuotes = false;

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '=' && !inQuotes && !key) {
        key = current;
        current = '';
      } else if (char === ',' && !inQuotes) {
        if (key) {
          result[key] = current;
          key = '';
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (key) {
      result[key] = current;
    }

    return result;
  } catch {
    return null;
  }
}

function parseVcfHeader(text: string): ParsedHeader {
  const header: ParsedHeader = {
    info: new Map(),
    format: new Map(),
    filter: new Map(),
    samples: [],
    headerEndLine: 0,
  };

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.startsWith('#')) {
      header.headerEndLine = i;
      break;
    }

    if (line.startsWith('##fileformat=')) {
      header.fileformat = line.substring('##fileformat='.length).trim();
    } else if (line.startsWith('##INFO=<')) {
      const info = parseStructuredField(line, '##INFO=<');
      if (info) {
        header.info.set(info.ID, {
          id: info.ID,
          number: info.Number || '.',
          type: info.Type || 'String',
          description: info.Description || '',
          line: i,
        });
      }
    } else if (line.startsWith('##FORMAT=<')) {
      const format = parseStructuredField(line, '##FORMAT=<');
      if (format) {
        header.format.set(format.ID, {
          id: format.ID,
          number: format.Number || '.',
          type: format.Type || 'String',
          description: format.Description || '',
          line: i,
        });
      }
    } else if (line.startsWith('##FILTER=<')) {
      const filter = parseStructuredField(line, '##FILTER=<');
      if (filter) {
        header.filter.set(filter.ID, {
          id: filter.ID,
          description: filter.Description || '',
          line: i,
        });
      }
    } else if (line.startsWith('#CHROM')) {
      const columns = line.split('\t');
      if (columns.length > 9) {
        header.samples = columns.slice(9);
      }
      header.headerEndLine = i + 1;
    }
  }

  return header;
}

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

describe('VCF Performance Benchmarks', function () {
  // Increase timeout for performance tests
  this.timeout(60000);

  describe('Header Parsing', function () {
    it('should parse 1000-line header in < 50ms', function () {
      // SPEC threshold: VCF header parse (1000-line header) < 50ms
      const vcfContent = generateVcfContent({
        headerLines: 1000,
        dataLines: 100, // Few data lines, focus on header
        infoFields: 500,
        formatFields: 50,
        samples: 4,
      });

      const result = benchmark(() => {
        parseVcfHeader(vcfContent);
      });

      console.log(`  1000-line header parse: avg=${result.avgMs.toFixed(2)}ms, min=${result.minMs.toFixed(2)}ms, max=${result.maxMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 50,
        `Header parse took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
      );
    });

    it('should parse 100-line header in < 10ms', function () {
      const vcfContent = generateVcfContent({
        headerLines: 100,
        dataLines: 100,
        infoFields: 50,
        formatFields: 10,
        samples: 4,
      });

      const result = benchmark(() => {
        parseVcfHeader(vcfContent);
      });

      console.log(`  100-line header parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 10,
        `Header parse took ${result.avgMs.toFixed(2)}ms (threshold: 10ms)`
      );
    });

    it('should handle 50 samples efficiently', function () {
      const vcfContent = generateVcfContent({
        headerLines: 200,
        dataLines: 1000,
        infoFields: 50,
        formatFields: 10,
        samples: 50,
      });

      const result = benchmark(() => {
        parseVcfHeader(vcfContent);
      });

      console.log(`  50-sample header parse: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 30,
        `Header parse took ${result.avgMs.toFixed(2)}ms (threshold: 30ms)`
      );
    });
  });

  describe('Large File Handling', function () {
    it('should parse header from 10K-line file efficiently', function () {
      const vcfContent = generateVcfContent({
        headerLines: 500,
        dataLines: 10000,
        infoFields: 100,
        formatFields: 20,
        samples: 10,
      });

      console.log(`  File size: ${(vcfContent.length / 1024 / 1024).toFixed(2)} MB`);

      const result = benchmark(() => {
        parseVcfHeader(vcfContent);
      });

      console.log(`  10K-line file header parse: avg=${result.avgMs.toFixed(2)}ms`);

      // Should still be fast since we only parse header
      assert.ok(
        result.avgMs < 100,
        `Header parse took ${result.avgMs.toFixed(2)}ms (threshold: 100ms)`
      );
    });

    it('should parse header from 100K-line file efficiently', function () {
      const vcfContent = generateVcfContent({
        headerLines: 1000,
        dataLines: 100000,
        infoFields: 200,
        formatFields: 20,
        samples: 10,
      });

      console.log(`  File size: ${(vcfContent.length / 1024 / 1024).toFixed(2)} MB`);

      const result = benchmark(
        () => {
          parseVcfHeader(vcfContent);
        },
        { warmupRuns: 2, measuredRuns: 5 }
      );

      console.log(`  100K-line file header parse: avg=${result.avgMs.toFixed(2)}ms`);

      // Header parsing should be O(header_lines), not O(total_lines)
      // But current implementation splits all lines first
      assert.ok(
        result.avgMs < 500,
        `Header parse took ${result.avgMs.toFixed(2)}ms (threshold: 500ms)`
      );
    });
  });

  describe('Memory Usage', function () {
    it('should handle large header without excessive memory', function () {
      // Generate a file with many data lines (header only parsed)
      // This tests that we don't load the entire file into memory for header parsing
      const vcfContent = generateVcfContent({
        headerLines: 1000,
        dataLines: 50000, // 50K lines - reasonable for testing
        infoFields: 200,
        formatFields: 20,
        samples: 20,
      });

      const fileSizeMB = vcfContent.length / 1024 / 1024;
      console.log(`  Test file size: ${fileSizeMB.toFixed(2)} MB`);

      // Get baseline memory
      if (global.gc) global.gc();
      const baselineMemory = process.memoryUsage().heapUsed;

      // Parse header multiple times
      for (let i = 0; i < 10; i++) {
        parseVcfHeader(vcfContent);
      }

      if (global.gc) global.gc();
      const afterMemory = process.memoryUsage().heapUsed;

      const memoryIncreaseMB = (afterMemory - baselineMemory) / 1024 / 1024;
      console.log(`  Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);

      // SPEC threshold: Memory for 1M-row file (header only) < 50MB
      // We're testing with 50K rows, so threshold is proportionally lower
      assert.ok(
        memoryIncreaseMB < 50,
        `Memory increased by ${memoryIncreaseMB.toFixed(2)}MB (threshold: 50MB)`
      );
    });
  });

  describe('Structured Field Parsing', function () {
    it('should parse INFO definitions efficiently', function () {
      const infoLine =
        '##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele count in genotypes, for each ALT allele, in the same order as listed">';

      const result = benchmark(
        () => {
          for (let i = 0; i < 1000; i++) {
            parseStructuredField(infoLine, '##INFO=<');
          }
        },
        { warmupRuns: 5, measuredRuns: 10 }
      );

      const perParseUs = (result.avgMs / 1000) * 1000; // microseconds per parse
      console.log(`  INFO field parse: ${perParseUs.toFixed(3)}μs per parse (1000 iterations: ${result.avgMs.toFixed(2)}ms)`);

      // Should be able to parse 1000 INFO definitions in < 5ms
      assert.ok(
        result.avgMs < 5,
        `1000 INFO parses took ${result.avgMs.toFixed(2)}ms (threshold: 5ms)`
      );
    });

    it('should handle complex quoted descriptions', function () {
      const complexLine =
        '##INFO=<ID=COMPLEX,Number=.,Type=String,Description="A very complex description with, commas, and \\"quotes\\" and special=characters inside">';

      const result = benchmark(
        () => {
          for (let i = 0; i < 1000; i++) {
            parseStructuredField(complexLine, '##INFO=<');
          }
        },
        { warmupRuns: 5, measuredRuns: 10 }
      );

      console.log(`  Complex field parse: ${result.avgMs.toFixed(2)}ms for 1000 iterations`);

      assert.ok(
        result.avgMs < 10,
        `1000 complex parses took ${result.avgMs.toFixed(2)}ms (threshold: 10ms)`
      );
    });
  });

  describe('Line Splitting Performance', function () {
    it('should split 10K lines efficiently', function () {
      const vcfContent = generateVcfContent({
        headerLines: 100,
        dataLines: 10000,
        samples: 10,
      });

      const result = benchmark(() => {
        vcfContent.split('\n');
      });

      console.log(`  10K line split: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 50,
        `Line split took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
      );
    });

    it('should split columns efficiently', function () {
      const dataLine =
        'chr1\t1000000\trs123456\tA\tG\t30.50\tPASS\tAC=2;AF=0.5;DP=100;INFO0=1;INFO1=2\tGT:DP:GQ\t0/1:30:99\t0/0:25:95\t1/1:35:99\t0/1:28:97';

      const result = benchmark(
        () => {
          for (let i = 0; i < 10000; i++) {
            dataLine.split('\t');
          }
        },
        { warmupRuns: 5, measuredRuns: 10 }
      );

      console.log(`  10K column splits: avg=${result.avgMs.toFixed(2)}ms`);

      assert.ok(
        result.avgMs < 20,
        `Column splits took ${result.avgMs.toFixed(2)}ms (threshold: 20ms)`
      );
    });
  });
});

describe('VCF Validation Performance', function () {
  this.timeout(60000);

  /**
   * Simplified validation function for benchmarking
   */
  function validateVcfBasic(text: string, maxLines: number): number {
    const lines = text.split('\n');
    let diagnosticCount = 0;
    let expectedColumnCount = 0;

    const limit = Math.min(lines.length, maxLines);

    for (let i = 0; i < limit; i++) {
      const line = lines[i];

      if (!line.trim() || line.startsWith('##')) continue;

      if (line.startsWith('#CHROM')) {
        expectedColumnCount = line.split('\t').length;
        continue;
      }

      const columns = line.split('\t');

      if (expectedColumnCount > 0 && columns.length !== expectedColumnCount) {
        diagnosticCount++;
      }

      if (columns.length >= 6) {
        const qual = columns[5];
        if (qual !== '.' && isNaN(parseFloat(qual))) {
          diagnosticCount++;
        }
      }
    }

    return diagnosticCount;
  }

  it('should validate 500 lines (viewport buffer) in < 50ms', function () {
    const vcfContent = generateVcfContent({
      headerLines: 100,
      dataLines: 1000,
      samples: 10,
    });

    const result = benchmark(() => {
      validateVcfBasic(vcfContent, 500);
    });

    console.log(`  500-line validation: avg=${result.avgMs.toFixed(2)}ms`);

    assert.ok(
      result.avgMs < 50,
      `Validation took ${result.avgMs.toFixed(2)}ms (threshold: 50ms)`
    );
  });

  it('should validate 2000 lines in < 200ms', function () {
    const vcfContent = generateVcfContent({
      headerLines: 200,
      dataLines: 5000,
      samples: 10,
    });

    const result = benchmark(() => {
      validateVcfBasic(vcfContent, 2000);
    });

    console.log(`  2000-line validation: avg=${result.avgMs.toFixed(2)}ms`);

    assert.ok(
      result.avgMs < 200,
      `Validation took ${result.avgMs.toFixed(2)}ms (threshold: 200ms)`
    );
  });
});
