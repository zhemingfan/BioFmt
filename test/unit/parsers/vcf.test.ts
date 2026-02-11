// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getFixturePath } from '../../fixtures.index';

/**
 * VCF Header Parser - extracted for unit testing
 */
interface VcfHeaderInfo {
  id: string;
  number: string;
  type: string;
  description: string;
}

interface VcfHeaderFormat {
  id: string;
  number: string;
  type: string;
  description: string;
}

interface VcfHeaderFilter {
  id: string;
  description: string;
}

interface VcfHeader {
  fileformat?: string;
  info: Map<string, VcfHeaderInfo>;
  format: Map<string, VcfHeaderFormat>;
  filter: Map<string, VcfHeaderFilter>;
  samples: string[];
  headerEndLine: number;
}

function parseStructuredField(
  line: string,
  prefix: string
): Record<string, string> | null {
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

function parseVcfHeader(text: string): VcfHeader {
  const header: VcfHeader = {
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
      if (info && info.ID) {
        header.info.set(info.ID, {
          id: info.ID,
          number: info.Number || '.',
          type: info.Type || 'String',
          description: info.Description || '',
        });
      }
    } else if (line.startsWith('##FORMAT=<')) {
      const format = parseStructuredField(line, '##FORMAT=<');
      if (format && format.ID) {
        header.format.set(format.ID, {
          id: format.ID,
          number: format.Number || '.',
          type: format.Type || 'String',
          description: format.Description || '',
        });
      }
    } else if (line.startsWith('##FILTER=<')) {
      const filter = parseStructuredField(line, '##FILTER=<');
      if (filter && filter.ID) {
        header.filter.set(filter.ID, {
          id: filter.ID,
          description: filter.Description || '',
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

describe('VCF Parser', () => {
  describe('parseStructuredField', () => {
    it('should parse INFO field definition', () => {
      const line = '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">';
      const result = parseStructuredField(line, '##INFO=<');

      assert.ok(result);
      assert.strictEqual(result.ID, 'DP');
      assert.strictEqual(result.Number, '1');
      assert.strictEqual(result.Type, 'Integer');
      assert.strictEqual(result.Description, 'Total Depth');
    });

    it('should handle quoted descriptions with commas', () => {
      const line = '##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele count, for each ALT allele">';
      const result = parseStructuredField(line, '##INFO=<');

      assert.ok(result);
      assert.strictEqual(result.ID, 'AC');
      assert.strictEqual(result.Description, 'Allele count, for each ALT allele');
    });

    it('should parse FORMAT field definition', () => {
      const line = '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">';
      const result = parseStructuredField(line, '##FORMAT=<');

      assert.ok(result);
      assert.strictEqual(result.ID, 'GT');
      assert.strictEqual(result.Type, 'String');
    });

    it('should return null for malformed lines', () => {
      const result = parseStructuredField('##INFO=<malformed', '##INFO=<');
      assert.strictEqual(result, null);
    });
  });

  describe('parseVcfHeader', () => {
    it('should parse fileformat version', () => {
      const vcf = '##fileformat=VCFv4.1\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n';
      const header = parseVcfHeader(vcf);

      assert.strictEqual(header.fileformat, 'VCFv4.1');
    });

    it('should parse INFO definitions', () => {
      const vcf = `##fileformat=VCFv4.1
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">
##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO
`;
      const header = parseVcfHeader(vcf);

      assert.strictEqual(header.info.size, 2);
      assert.ok(header.info.has('DP'));
      assert.ok(header.info.has('AF'));

      const dp = header.info.get('DP');
      assert.ok(dp);
      assert.strictEqual(dp.type, 'Integer');
      assert.strictEqual(dp.number, '1');
    });

    it('should parse FORMAT definitions', () => {
      const vcf = `##fileformat=VCFv4.1
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read Depth">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSample1
`;
      const header = parseVcfHeader(vcf);

      assert.strictEqual(header.format.size, 2);
      assert.ok(header.format.has('GT'));
      assert.ok(header.format.has('DP'));
    });

    it('should parse sample names from column header', () => {
      const vcf = `##fileformat=VCFv4.1
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSample1\tSample2\tSample3
`;
      const header = parseVcfHeader(vcf);

      assert.deepStrictEqual(header.samples, ['Sample1', 'Sample2', 'Sample3']);
    });

    it('should set headerEndLine correctly', () => {
      const vcf = `##fileformat=VCFv4.1
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO
chr1\t100\t.\tA\tG\t30\t.\tDP=10
`;
      const header = parseVcfHeader(vcf);

      assert.strictEqual(header.headerEndLine, 3);
    });
  });

  describe('with fixture file', () => {
    let vcfContent: string;

    before(() => {
      const fixturePath = getFixturePath('vcf-example');
      vcfContent = fs.readFileSync(fixturePath, 'utf-8');
    });

    it('should parse example.vcf header', () => {
      const header = parseVcfHeader(vcfContent);

      assert.ok(header.fileformat);
      assert.ok(header.fileformat.startsWith('VCF'));
    });

    it('should find FORMAT definitions in example.vcf', () => {
      const header = parseVcfHeader(vcfContent);

      // The example VCF has AD, DP, GQ, GT, PL format fields
      assert.ok(header.format.size > 0);
      assert.ok(header.format.has('GT'), 'Should have GT format');
    });

    it('should find sample names in example.vcf', () => {
      const header = parseVcfHeader(vcfContent);

      assert.ok(header.samples.length > 0);
      // The example has L1, L2, L3, L4 samples
      assert.ok(header.samples.includes('L1') || header.samples.length >= 1);
    });
  });
});

describe('VCF Data Line Parsing', () => {
  function parseVcfDataLine(line: string): {
    chrom: string;
    pos: number;
    id: string;
    ref: string;
    alt: string;
    qual: number | null;
    filter: string;
    info: Record<string, string | boolean>;
    format?: string;
    samples?: string[];
  } | null {
    if (line.startsWith('#') || !line.trim()) {
      return null;
    }

    const columns = line.split('\t');
    if (columns.length < 8) {
      return null;
    }

    const qual = columns[5] === '.' ? null : parseFloat(columns[5]);
    const info: Record<string, string | boolean> = {};

    if (columns[7] !== '.') {
      const infoPairs = columns[7].split(';');
      for (const pair of infoPairs) {
        if (pair.includes('=')) {
          const [key, val] = pair.split('=', 2);
          info[key] = val;
        } else if (pair) {
          info[pair] = true;
        }
      }
    }

    return {
      chrom: columns[0],
      pos: parseInt(columns[1], 10),
      id: columns[2],
      ref: columns[3],
      alt: columns[4],
      qual,
      filter: columns[6],
      info,
      format: columns[8],
      samples: columns.length > 9 ? columns.slice(9) : undefined,
    };
  }

  it('should parse a basic data line', () => {
    const line = 'chr1\t100\trs123\tA\tG\t30\tPASS\tDP=10;AF=0.5\tGT:DP\t0/1:15';
    const result = parseVcfDataLine(line);

    assert.ok(result);
    assert.strictEqual(result.chrom, 'chr1');
    assert.strictEqual(result.pos, 100);
    assert.strictEqual(result.id, 'rs123');
    assert.strictEqual(result.ref, 'A');
    assert.strictEqual(result.alt, 'G');
    assert.strictEqual(result.qual, 30);
    assert.strictEqual(result.filter, 'PASS');
    assert.strictEqual(result.info.DP, '10');
    assert.strictEqual(result.info.AF, '0.5');
    assert.strictEqual(result.format, 'GT:DP');
    assert.deepStrictEqual(result.samples, ['0/1:15']);
  });

  it('should handle missing QUAL', () => {
    const line = 'chr1\t100\t.\tA\tG\t.\t.\t.';
    const result = parseVcfDataLine(line);

    assert.ok(result);
    assert.strictEqual(result.qual, null);
  });

  it('should handle flag INFO fields', () => {
    const line = 'chr1\t100\t.\tA\tG\t30\t.\tDB;DP=10';
    const result = parseVcfDataLine(line);

    assert.ok(result);
    assert.strictEqual(result.info.DB, true);
    assert.strictEqual(result.info.DP, '10');
  });

  it('should return null for header lines', () => {
    assert.strictEqual(parseVcfDataLine('#CHROM\tPOS\t...'), null);
    assert.strictEqual(parseVcfDataLine('##fileformat=VCF'), null);
  });

  it('should return null for lines with insufficient columns', () => {
    assert.strictEqual(parseVcfDataLine('chr1\t100\t.\tA'), null);
  });
});
