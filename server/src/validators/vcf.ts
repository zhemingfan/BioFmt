// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  HoverParams,
  DocumentSymbol,
  SymbolKind,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { withSpecRef } from '../specRefs';
import type { ValidatorContext, BioFmtSettings, ParsedHeader } from './types';
import { shouldValidateLine } from './types';

// Header cache (keyed by URI + version)
interface HeaderCache {
  version: number;
  header: ParsedHeader;
}
const headerCache = new Map<string, HeaderCache>();

export function clearHeaderCache(uri: string): void {
  headerCache.delete(uri);
}

export function getVcfHeader(document: TextDocument): ParsedHeader {
  const cached = headerCache.get(document.uri);
  if (cached && cached.version === document.version) {
    return cached.header;
  }

  const header = parseVcfHeader(document.getText());
  headerCache.set(document.uri, { version: document.version, header });
  return header;
}

export function parseVcfHeader(text: string): ParsedHeader {
  const header: ParsedHeader = {
    info: new Map(),
    format: new Map(),
    filter: new Map(),
    contigs: new Map(),
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
          line: i,
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
          line: i,
        });
      }
    } else if (line.startsWith('##FILTER=<')) {
      const filter = parseStructuredField(line, '##FILTER=<');
      if (filter && filter.ID) {
        header.filter.set(filter.ID, {
          id: filter.ID,
          description: filter.Description || '',
          line: i,
        });
      }
    } else if (line.startsWith('##contig=<')) {
      const contig = parseStructuredField(line, '##contig=<');
      if (contig && contig.ID) {
        header.contigs.set(contig.ID, {
          id: contig.ID,
          length: contig.length ? parseInt(contig.length, 10) : undefined,
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

export function parseStructuredField(
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

export function validateVcf(
  text: string,
  settings: BioFmtSettings,
  context: ValidatorContext
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const header = parseVcfHeader(text);
  const lines = text.split('\n');

  // Update context with actual header end line
  const ctx = { ...context, headerEndLine: header.headerEndLine };

  let expectedColumnCount = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!shouldValidateLine(ctx, i)) continue;
    const line = lines[i];

    if (!line.trim()) continue;

    if (line.startsWith('##')) {
      if (i === 0 && !line.startsWith('##fileformat=')) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Warning,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'VCF file should start with ##fileformat=VCFv4.x',
          source: 'biofmt',
        }, 'VCF-001'));
      }
      continue;
    }

    if (line.startsWith('#CHROM')) {
      const columns = line.split('\t');
      expectedColumnCount = columns.length;

      if (columns.length < 8) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: 'VCF header must have at least 8 columns',
          source: 'biofmt',
        }, 'VCF-002'));
      }
      continue;
    }

    if (!line.startsWith('#')) {
      const columns = line.split('\t');

      if (columns.length < 8) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: `VCF data line must have at least 8 columns, found ${columns.length}`,
          source: 'biofmt',
        }, 'VCF-003'));
        continue;
      }

      if (expectedColumnCount > 0 && columns.length !== expectedColumnCount) {
        diagnostics.push(withSpecRef({
          severity: DiagnosticSeverity.Error,
          range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
          message: `Expected ${expectedColumnCount} columns, found ${columns.length}`,
          source: 'biofmt',
        }, 'VCF-004'));
      }

      // Validate QUAL column (index 5)
      if (columns.length >= 6) {
        const qual = columns[5];
        if (qual !== '.' && isNaN(parseFloat(qual))) {
          const qualStart = columns.slice(0, 5).join('\t').length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: i, character: qualStart }, end: { line: i, character: qualStart + qual.length } },
            message: `Invalid QUAL value: "${qual}" (expected number or ".")`,
            source: 'biofmt',
          }, 'VCF-005'));
        }
      }

      // Strict-mode checks
      if (settings.validation.level === 'strict') {
        // POS must be >= 1
        const pos = parseInt(columns[1], 10);
        if (!isNaN(pos) && pos < 1) {
          const posStart = columns[0].length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Error,
            range: { start: { line: i, character: posStart }, end: { line: i, character: posStart + columns[1].length } },
            message: `POS must be >= 1 (1-based coordinate), found ${pos}`,
            source: 'biofmt',
          }, 'VCF-S005'));
        }

        // REF must be A/C/G/T/N
        const ref = columns[3];
        if (ref !== '.' && !/^[ACGTNacgtn]+$/.test(ref)) {
          const refStart = columns.slice(0, 3).join('\t').length + 1;
          diagnostics.push(withSpecRef({
            severity: DiagnosticSeverity.Warning,
            range: { start: { line: i, character: refStart }, end: { line: i, character: refStart + ref.length } },
            message: `REF "${ref}" contains non-standard bases (expected A, C, G, T, N)`,
            source: 'biofmt',
          }, 'VCF-S001'));
        }

        // ALT must match spec patterns
        const alt = columns[4];
        if (alt !== '.' && alt !== '*') {
          for (const allele of alt.split(',')) {
            // Valid: bases, <ID>, *, ., or breakend notation []
            if (!/^[ACGTNacgtn]+$/.test(allele) && !/^<.+>$/.test(allele) && allele !== '*' &&
                !/[[\]]/.test(allele)) {
              const altStart = columns.slice(0, 4).join('\t').length + 1;
              diagnostics.push(withSpecRef({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: altStart }, end: { line: i, character: altStart + alt.length } },
                message: `ALT allele "${allele}" does not match VCF spec patterns`,
                source: 'biofmt',
              }, 'VCF-S002'));
              break;
            }
          }
        }

        // FILTER values must be declared in header
        const filter = columns[6];
        if (filter !== '.' && filter !== 'PASS' && header.filter.size > 0) {
          for (const f of filter.split(';')) {
            if (f !== 'PASS' && !header.filter.has(f)) {
              const filterStart = columns.slice(0, 6).join('\t').length + 1;
              diagnostics.push(withSpecRef({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: filterStart }, end: { line: i, character: filterStart + filter.length } },
                message: `FILTER "${f}" not declared in header`,
                source: 'biofmt',
              }, 'VCF-S003'));
              break;
            }
          }
        }

        // INFO keys must be declared
        if (columns.length >= 8) {
          const infoColumn = columns[7];
          const infoStart = columns.slice(0, 7).join('\t').length + 1;

          if (infoColumn !== '.') {
            const infoPairs = infoColumn.split(';');
            let offset = 0;

            for (const pair of infoPairs) {
              const key = pair.split('=')[0];
              if (key && !header.info.has(key) && key !== '.') {
                diagnostics.push(withSpecRef({
                  severity: DiagnosticSeverity.Warning,
                  range: { start: { line: i, character: infoStart + offset }, end: { line: i, character: infoStart + offset + key.length } },
                  message: `Unknown INFO key: "${key}"`,
                  source: 'biofmt',
                }, 'VCF-006'));
              }
              offset += pair.length + 1;
            }
          }
        }

        // FORMAT keys must be declared
        if (columns.length >= 9) {
          const formatColumn = columns[8];
          const formatStart = columns.slice(0, 8).join('\t').length + 1;

          for (const key of formatColumn.split(':')) {
            if (key && !header.format.has(key)) {
              diagnostics.push(withSpecRef({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: formatStart }, end: { line: i, character: formatStart + formatColumn.length } },
                message: `Unknown FORMAT key: "${key}"`,
                source: 'biofmt',
              }, 'VCF-S004'));
              break;
            }
          }
        }
      }

      if (diagnostics.length >= settings.validation.maxDiagnostics) break;
    }
  }

  return diagnostics;
}

// Hover provider
export function getVcfHover(document: TextDocument, params: HoverParams): Hover | null {
  const position = params.position;
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  if (line.startsWith('#')) return null;

  const header = getVcfHeader(document);
  const wordRange = getWordRangeAtPosition(line, position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);
  const columns = line.split('\t');

  if (columns.length >= 8) {
    const infoColumn = columns[7];
    const infoStart = columns.slice(0, 7).join('\t').length + 1;
    const infoEnd = infoStart + infoColumn.length;

    if (position.character >= infoStart && position.character < infoEnd) {
      const infoDef = header.info.get(word);
      if (infoDef) {
        return {
          contents: {
            kind: 'markdown',
            value: `**INFO: ${infoDef.id}**\n\n` +
              `- **Type:** ${infoDef.type}\n` +
              `- **Number:** ${infoDef.number}\n` +
              `- **Description:** ${infoDef.description}`,
          },
        };
      }
    }

    if (columns.length >= 9) {
      const formatColumn = columns[8];
      const formatStart = columns.slice(0, 8).join('\t').length + 1;
      const formatEnd = formatStart + formatColumn.length;

      if (position.character >= formatStart && position.character < formatEnd) {
        const formatDef = header.format.get(word);
        if (formatDef) {
          return {
            contents: {
              kind: 'markdown',
              value: `**FORMAT: ${formatDef.id}**\n\n` +
                `- **Type:** ${formatDef.type}\n` +
                `- **Number:** ${formatDef.number}\n` +
                `- **Description:** ${formatDef.description}`,
            },
          };
        }
      }
    }
  }

  return null;
}

export function getWordRangeAtPosition(
  line: string,
  character: number
): { start: number; end: number } | null {
  const wordPattern = /[A-Za-z0-9_]+/g;
  let match;

  while ((match = wordPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (character >= start && character < end) {
      return { start, end };
    }
  }

  return null;
}

// Document symbols
export function getVcfSymbols(document: TextDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const header = getVcfHeader(document);

  if (header.info.size > 0) {
    const infoChildren: DocumentSymbol[] = [];
    for (const [id, def] of header.info) {
      infoChildren.push({
        name: id,
        kind: SymbolKind.Field,
        range: { start: { line: def.line, character: 0 }, end: { line: def.line, character: 100 } },
        selectionRange: { start: { line: def.line, character: 0 }, end: { line: def.line, character: 100 } },
        detail: `${def.type} (${def.number})`,
      });
    }

    symbols.push({
      name: 'INFO',
      kind: SymbolKind.Class,
      range: { start: { line: 0, character: 0 }, end: { line: header.headerEndLine, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      children: infoChildren,
    });
  }

  if (header.format.size > 0) {
    const formatChildren: DocumentSymbol[] = [];
    for (const [id, def] of header.format) {
      formatChildren.push({
        name: id,
        kind: SymbolKind.Field,
        range: { start: { line: def.line, character: 0 }, end: { line: def.line, character: 100 } },
        selectionRange: { start: { line: def.line, character: 0 }, end: { line: def.line, character: 100 } },
        detail: `${def.type} (${def.number})`,
      });
    }

    symbols.push({
      name: 'FORMAT',
      kind: SymbolKind.Class,
      range: { start: { line: 0, character: 0 }, end: { line: header.headerEndLine, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      children: formatChildren,
    });
  }

  if (header.samples.length > 0) {
    const sampleChildren: DocumentSymbol[] = header.samples.map(
      (sample, idx) => ({
        name: sample,
        kind: SymbolKind.Variable,
        range: { start: { line: header.headerEndLine - 1, character: 0 }, end: { line: header.headerEndLine - 1, character: 100 } },
        selectionRange: { start: { line: header.headerEndLine - 1, character: 0 }, end: { line: header.headerEndLine - 1, character: sample.length } },
        detail: `Sample ${idx + 1}`,
      })
    );

    symbols.push({
      name: `Samples (${header.samples.length})`,
      kind: SymbolKind.Array,
      range: { start: { line: header.headerEndLine - 1, character: 0 }, end: { line: header.headerEndLine - 1, character: 100 } },
      selectionRange: { start: { line: header.headerEndLine - 1, character: 0 }, end: { line: header.headerEndLine - 1, character: 7 } },
      children: sampleChildren,
    });
  }

  return symbols;
}
