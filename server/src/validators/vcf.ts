// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  HoverParams,
  DocumentSymbol,
  SymbolKind,
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
  DefinitionParams,
  Location,
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { withSpecRef } from '../specRefs';
import { getWordRangeAtPosition } from '../validationUtils';
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

        // Cross-field: FORMAT key count vs sample value count
        if (columns.length >= 10) {
          const formatKeys = columns[8].split(':');
          const altCount = columns[4] === '.' ? 0 : columns[4].split(',').length;

          for (let s = 9; s < columns.length; s++) {
            const sampleVals = columns[s].split(':');
            if (sampleVals.length !== formatKeys.length && columns[s] !== '.') {
              const sampleStart = columns.slice(0, s).join('\t').length + 1;
              diagnostics.push(withSpecRef({
                severity: DiagnosticSeverity.Warning,
                range: { start: { line: i, character: sampleStart }, end: { line: i, character: sampleStart + columns[s].length } },
                message: `Sample has ${sampleVals.length} values but FORMAT has ${formatKeys.length} keys`,
                source: 'biofmt',
              }, 'VCF-X001'));
              break;
            }

            // Cross-field: GT allele indices must be <= altCount
            const gtIdx = formatKeys.indexOf('GT');
            if (gtIdx >= 0 && gtIdx < sampleVals.length) {
              const gt = sampleVals[gtIdx];
              const alleles = gt.split(/[/|]/);
              for (const a of alleles) {
                if (a !== '.') {
                  const idx = parseInt(a, 10);
                  if (!isNaN(idx) && idx > altCount) {
                    const sampleStart = columns.slice(0, s).join('\t').length + 1;
                    diagnostics.push(withSpecRef({
                      severity: DiagnosticSeverity.Error,
                      range: { start: { line: i, character: sampleStart }, end: { line: i, character: sampleStart + columns[s].length } },
                      message: `Genotype allele index ${idx} exceeds ALT count ${altCount}`,
                      source: 'biofmt',
                    }, 'VCF-X002'));
                    break;
                  }
                }
              }
            }

            // Cross-field: AD length must match allele count (REF + ALTs)
            const adIdx = formatKeys.indexOf('AD');
            if (adIdx >= 0 && adIdx < sampleVals.length) {
              const ad = sampleVals[adIdx];
              if (ad !== '.') {
                const adValues = ad.split(',');
                const expectedAd = altCount + 1; // REF + ALTs
                if (adValues.length !== expectedAd) {
                  const sampleStart = columns.slice(0, s).join('\t').length + 1;
                  diagnostics.push(withSpecRef({
                    severity: DiagnosticSeverity.Warning,
                    range: { start: { line: i, character: sampleStart }, end: { line: i, character: sampleStart + columns[s].length } },
                    message: `AD has ${adValues.length} values but expected ${expectedAd} (REF + ${altCount} ALTs)`,
                    source: 'biofmt',
                  }, 'VCF-X003'));
                }
              }
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

// getWordRangeAtPosition is now exported from ../validationUtils

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

// ----- Completion + go-to-definition (LSP IntelliSense) -----

// Read one line of the document without its trailing newline.
function readLine(document: TextDocument, line: number): string {
  return document
    .getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } })
    .replace(/\r?\n$/, '');
}

function fieldDefsToCompletions(
  defs: Iterable<{ id: string; type: string; number: string; description: string }>,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const def of defs) {
    items.push({
      label: def.id,
      kind: CompletionItemKind.Field,
      detail: `${def.type} (${def.number})`,
      documentation: def.description,
    });
  }
  return items;
}

// Completion for declared INFO/FORMAT keys and FILTER values, each scoped to its column.
export function getVcfCompletions(
  document: TextDocument,
  params: CompletionParams,
): CompletionItem[] {
  const position = params.position;
  const lineText = readLine(document, position.line);
  if (lineText.startsWith('#')) return [];

  const header = getVcfHeader(document);
  const columns = lineText.split('\t');
  const ch = position.character;

  // FILTER column (index 6): PASS plus declared filters
  if (columns.length >= 7) {
    const filterStart = columns.slice(0, 6).join('\t').length + 1;
    const filterEnd = filterStart + columns[6].length;
    if (ch >= filterStart && ch <= filterEnd) {
      const items: CompletionItem[] = [
        { label: 'PASS', kind: CompletionItemKind.Constant, detail: 'All filters passed' },
      ];
      for (const def of header.filter.values()) {
        items.push({
          label: def.id,
          kind: CompletionItemKind.Field,
          detail: 'FILTER',
          documentation: def.description,
        });
      }
      return items;
    }
  }

  // INFO column (index 7): declared INFO keys
  if (columns.length >= 8) {
    const infoStart = columns.slice(0, 7).join('\t').length + 1;
    const infoEnd = infoStart + columns[7].length;
    if (ch >= infoStart && ch <= infoEnd) {
      return fieldDefsToCompletions(header.info.values());
    }
  }

  // FORMAT column (index 8): declared FORMAT keys
  if (columns.length >= 9) {
    const formatStart = columns.slice(0, 8).join('\t').length + 1;
    const formatEnd = formatStart + columns[8].length;
    if (ch >= formatStart && ch <= formatEnd) {
      return fieldDefsToCompletions(header.format.values());
    }
  }

  return [];
}

// Go-to-definition: an INFO/FORMAT/FILTER key on a data line jumps to its header declaration.
export function getVcfDefinition(
  document: TextDocument,
  params: DefinitionParams,
): Location[] | null {
  const position = params.position;
  const lineText = readLine(document, position.line);
  if (lineText.startsWith('#')) return null;

  const header = getVcfHeader(document);
  const wordRange = getWordRangeAtPosition(lineText, position.character);
  if (!wordRange) return null;
  const word = lineText.substring(wordRange.start, wordRange.end);
  const columns = lineText.split('\t');
  const ch = position.character;

  let targetLine = -1;

  if (columns.length >= 7) {
    const filterStart = columns.slice(0, 6).join('\t').length + 1;
    const filterEnd = filterStart + columns[6].length;
    const def = header.filter.get(word);
    if (def && ch >= filterStart && ch <= filterEnd) targetLine = def.line;
  }
  if (targetLine < 0 && columns.length >= 8) {
    const infoStart = columns.slice(0, 7).join('\t').length + 1;
    const infoEnd = infoStart + columns[7].length;
    const def = header.info.get(word);
    if (def && ch >= infoStart && ch <= infoEnd) targetLine = def.line;
  }
  if (targetLine < 0 && columns.length >= 9) {
    const formatStart = columns.slice(0, 8).join('\t').length + 1;
    const formatEnd = formatStart + columns[8].length;
    const def = header.format.get(word);
    if (def && ch >= formatStart && ch <= formatEnd) targetLine = def.line;
  }

  if (targetLine < 0) return null;

  const targetText = readLine(document, targetLine);
  return [
    {
      uri: document.uri,
      range: {
        start: { line: targetLine, character: 0 },
        end: { line: targetLine, character: targetText.length },
      },
    },
  ];
}
