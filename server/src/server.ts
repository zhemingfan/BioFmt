// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Hover,
  HoverParams,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  FoldingRange,
  FoldingRangeParams,
  DocumentSymbol,
  DocumentSymbolParams,
  SymbolKind,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  shouldSkipLine,
  createLineDiagnostic,
  createColumnDiagnostic,
  validateCoordinatePair,
  validateNumericColumns,
  validateStrand,
} from './validationUtils';

// Create connection using all proposed features
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Cache for parsed headers (per document URI and version)
interface HeaderCache {
  version: number;
  header: ParsedHeader;
}

interface ParsedHeader {
  fileformat?: string;
  info: Map<string, InfoDefinition>;
  format: Map<string, FormatDefinition>;
  filter: Map<string, FilterDefinition>;
  contigs: Map<string, ContigDefinition>;
  samples: string[];
  headerEndLine: number;
}

interface InfoDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
  line: number;
}

interface FormatDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
  line: number;
}

interface FilterDefinition {
  id: string;
  description: string;
  line: number;
}

interface ContigDefinition {
  id: string;
  length?: number;
  line: number;
}

const headerCache = new Map<string, HeaderCache>();

// Settings
interface BioFmtSettings {
  validation: {
    level: 'off' | 'basic' | 'strict';
    maxDiagnostics: number;
  };
  lsp: {
    viewportBufferLines: number;
  };
}

const defaultSettings: BioFmtSettings = {
  validation: {
    level: 'basic',
    maxDiagnostics: 2000,
  },
  lsp: {
    viewportBufferLines: 500,
  },
};

let globalSettings: BioFmtSettings = defaultSettings;
const documentSettings = new Map<string, Thenable<BioFmtSettings>>();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
});

// Document events
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
  headerCache.delete(e.document.uri);
});

documents.onDidOpen((e) => {
  // Validate document on open
  validateDocument(e.document);
});

documents.onDidChangeContent((change) => {
  // Invalidate header cache on content change
  const cached = headerCache.get(change.document.uri);
  if (cached && cached.version !== change.document.version) {
    headerCache.delete(change.document.uri);
  }

  // Validate document
  validateDocument(change.document);
});

// Settings management
function getDocumentSettings(resource: string): Thenable<BioFmtSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'biofmt',
    });
    documentSettings.set(resource, result);
  }
  return result;
}

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = change.settings.biofmt || defaultSettings;
  }

  // Revalidate all open documents
  documents.all().forEach(validateDocument);
});

// Get or parse header for VCF documents
function getVcfHeader(document: TextDocument): ParsedHeader {
  const cached = headerCache.get(document.uri);
  if (cached && cached.version === document.version) {
    return cached.header;
  }

  const header = parseVcfHeader(document);
  headerCache.set(document.uri, { version: document.version, header });
  return header;
}

function parseVcfHeader(document: TextDocument): ParsedHeader {
  const header: ParsedHeader = {
    info: new Map(),
    format: new Map(),
    filter: new Map(),
    contigs: new Map(),
    samples: [],
    headerEndLine: 0,
  };

  const text = document.getText();
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
    } else if (line.startsWith('##contig=<')) {
      const contig = parseStructuredField(line, '##contig=<');
      if (contig) {
        header.contigs.set(contig.ID, {
          id: contig.ID,
          length: contig.length ? parseInt(contig.length, 10) : undefined,
          line: i,
        });
      }
    } else if (line.startsWith('#CHROM')) {
      // Parse sample names from column header
      const columns = line.split('\t');
      if (columns.length > 9) {
        header.samples = columns.slice(9);
      }
      header.headerEndLine = i + 1;
    }
  }

  return header;
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

    // Parse key=value pairs, handling quoted values
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

    // Don't forget the last pair
    if (key) {
      result[key] = current;
    }

    return result;
  } catch {
    return null;
  }
}

// Hover provider
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const languageId = getLanguageId(document);

  // Dispatch by language
  switch (languageId) {
    case 'omics-vcf':
      return getVcfHover(document, params);
    default:
      return null;
  }
});

function getVcfHover(document: TextDocument, params: HoverParams): Hover | null {
  const position = params.position;
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Skip header lines for hover
  if (line.startsWith('#')) {
    return null;
  }

  const header = getVcfHeader(document);

  // Get word at position
  const wordRange = getWordRangeAtPosition(line, position.character);
  if (!wordRange) return null;

  const word = line.substring(wordRange.start, wordRange.end);

  // Check if this is an INFO key
  const columns = line.split('\t');
  if (columns.length >= 8) {
    const infoColumn = columns[7];
    const infoStart = columns.slice(0, 7).join('\t').length + 1;
    const infoEnd = infoStart + infoColumn.length;

    if (position.character >= infoStart && position.character < infoEnd) {
      // We're in the INFO column
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

    // Check if this is a FORMAT key
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

function getWordRangeAtPosition(
  line: string,
  character: number
): { start: number; end: number } | null {
  const wordPattern = /[A-Za-z0-9_]+/g;
  let match;

  while ((match = wordPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (character >= start && character <= end) {
      return { start, end };
    }
  }

  return null;
}

// Document validation
async function validateDocument(document: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(document.uri);

  if (settings.validation.level === 'off') {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const languageId = getLanguageId(document);
  let diagnostics: Diagnostic[] = [];

  switch (languageId) {
    case 'omics-vcf':
      diagnostics = validateVcf(document, settings);
      break;
    case 'omics-bed':
    case 'omics-narrowpeak':
    case 'omics-broadpeak':
      diagnostics = validateBed(document, settings);
      break;
    case 'omics-bedpe':
      diagnostics = validateBedpe(document, settings);
      break;
    case 'omics-sam':
      diagnostics = validateSam(document, settings);
      break;
    case 'omics-gtf':
      diagnostics = validateGtf(document, settings);
      break;
    case 'omics-gff3':
      diagnostics = validateGff3(document, settings);
      break;
    case 'omics-paf':
      diagnostics = validatePaf(document, settings);
      break;
    case 'omics-psl':
      diagnostics = validatePsl(document, settings);
      break;
    case 'omics-wig':
      diagnostics = validateWig(document, settings);
      break;
    case 'omics-bedgraph':
      diagnostics = validateBedGraph(document, settings);
      break;
  }

  // Limit diagnostics
  if (diagnostics.length > settings.validation.maxDiagnostics) {
    diagnostics = diagnostics.slice(0, settings.validation.maxDiagnostics);
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function validateVcf(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const header = getVcfHeader(document);
  const text = document.getText();
  const lines = text.split('\n');

  // Validate only lines around the visible area (simplified - validates first N lines)
  const maxLines = Math.min(
    lines.length,
    header.headerEndLine + settings.lsp.viewportBufferLines
  );

  let expectedColumnCount = 0;

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) continue;

    // Validate header lines
    if (line.startsWith('##')) {
      if (i === 0 && !line.startsWith('##fileformat=')) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'VCF file should start with ##fileformat=VCFv4.x',
          source: 'biofmt',
        });
      }
      continue;
    }

    // Column header line
    if (line.startsWith('#CHROM')) {
      const columns = line.split('\t');
      expectedColumnCount = columns.length;

      if (columns.length < 8) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'VCF header must have at least 8 columns',
          source: 'biofmt',
        });
      }
      continue;
    }

    // Data lines
    if (!line.startsWith('#')) {
      const columns = line.split('\t');

      // Check column count
      if (expectedColumnCount > 0 && columns.length !== expectedColumnCount) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: `Expected ${expectedColumnCount} columns, found ${columns.length}`,
          source: 'biofmt',
        });
      }

      // Validate QUAL column (index 5)
      if (columns.length >= 6) {
        const qual = columns[5];
        if (qual !== '.' && isNaN(parseFloat(qual))) {
          const qualStart = columns.slice(0, 5).join('\t').length + 1;
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: qualStart },
              end: { line: i, character: qualStart + qual.length },
            },
            message: `Invalid QUAL value: "${qual}" (expected number or ".")`,
            source: 'biofmt',
          });
        }
      }

      // Validate INFO keys
      if (columns.length >= 8 && settings.validation.level === 'strict') {
        const infoColumn = columns[7];
        const infoStart = columns.slice(0, 7).join('\t').length + 1;

        if (infoColumn !== '.') {
          const infoPairs = infoColumn.split(';');
          let offset = 0;

          for (const pair of infoPairs) {
            const key = pair.split('=')[0];
            if (key && !header.info.has(key) && key !== '.') {
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line: i, character: infoStart + offset },
                  end: { line: i, character: infoStart + offset + key.length },
                },
                message: `Unknown INFO key: "${key}"`,
                source: 'biofmt',
              });
            }
            offset += pair.length + 1; // +1 for semicolon
          }
        }
      }

      // Stop if we've collected enough diagnostics
      if (diagnostics.length >= settings.validation.maxDiagnostics) {
        break;
      }
    }
  }

  return diagnostics;
}

function validateBed(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');
  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    if (shouldSkipLine(line, ['track', 'browser'])) continue;

    const columns = line.split('\t');

    if (columns.length < 3) {
      diagnostics.push(createLineDiagnostic(i, line, 'BED format requires at least 3 columns (chrom, start, end)'));
      continue;
    }

    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnostics.push(createLineDiagnostic(i, line, 'Start and end positions must be integers'));
      continue;
    }

    if (start < 0) {
      diagnostics.push(createColumnDiagnostic(i, columns, 1, 'Start position cannot be negative'));
    }

    if (start >= end) {
      diagnostics.push(createLineDiagnostic(i, line, 'Start position must be less than end position'));
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) break;
  }

  return diagnostics;
}

function validateBedpe(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines, comments, and header lines
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 6) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'BEDPE format requires at least 6 columns (chrom1, start1, end1, chrom2, start2, end2)',
        source: 'biofmt',
      });
      continue;
    }

    // Validate first coordinate pair
    const start1 = parseInt(columns[1], 10);
    const end1 = parseInt(columns[2], 10);

    if (isNaN(start1) || isNaN(end1)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'start1 and end1 positions must be integers',
        source: 'biofmt',
      });
      continue;
    }

    // Validate second coordinate pair
    const start2 = parseInt(columns[4], 10);
    const end2 = parseInt(columns[5], 10);

    if (isNaN(start2) || isNaN(end2)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'start2 and end2 positions must be integers',
        source: 'biofmt',
      });
      continue;
    }

    if (start1 < 0 || start2 < 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start positions cannot be negative',
        source: 'biofmt',
      });
    }

    // Check that end >= start (BEDPE allows end == start for point features)
    if (end1 < start1 || end2 < start2) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'End position must be >= start position',
        source: 'biofmt',
      });
    }

    // Validate strand fields if present (columns 9 and 10)
    if (columns.length >= 10) {
      const strand1 = columns[8];
      const strand2 = columns[9];
      const validStrands = ['+', '-', '.'];

      if (!validStrands.includes(strand1) || !validStrands.includes(strand2)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'Strand fields should be +, -, or .',
          source: 'biofmt',
        });
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validateSam(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines and header lines
    if (!line.trim() || line.startsWith('@')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 11) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `SAM format requires at least 11 columns, found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate FLAG (column 2)
    const flag = parseInt(columns[1], 10);
    if (isNaN(flag) || flag < 0) {
      const flagStart = columns[0].length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: flagStart },
          end: { line: i, character: flagStart + columns[1].length },
        },
        message: 'FLAG must be a non-negative integer',
        source: 'biofmt',
      });
    }

    // Validate POS (column 4)
    const pos = parseInt(columns[3], 10);
    if (isNaN(pos) || pos < 0) {
      const posStart = columns.slice(0, 3).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: posStart },
          end: { line: i, character: posStart + columns[3].length },
        },
        message: 'POS must be a non-negative integer',
        source: 'biofmt',
      });
    }

    // Validate MAPQ (column 5)
    const mapq = parseInt(columns[4], 10);
    if (isNaN(mapq) || mapq < 0 || mapq > 255) {
      const mapqStart = columns.slice(0, 4).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: mapqStart },
          end: { line: i, character: mapqStart + columns[4].length },
        },
        message: 'MAPQ should be between 0 and 255',
        source: 'biofmt',
      });
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validateGtf(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);
  const validStrands = new Set(['+', '-', '.']);
  const validFrames = new Set(['0', '1', '2', '.']);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 9) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `GTF requires 9 columns, found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate start and end (columns 4 and 5, 1-based)
    const start = parseInt(columns[3], 10);
    const end = parseInt(columns[4], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start and end positions must be integers',
        source: 'biofmt',
      });
    } else if (start > end) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start position cannot be greater than end position',
        source: 'biofmt',
      });
    }

    // Validate strand (column 7)
    const strand = columns[6];
    if (!validStrands.has(strand)) {
      const strandStart = columns.slice(0, 6).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: strandStart },
          end: { line: i, character: strandStart + strand.length },
        },
        message: `Invalid strand "${strand}" (expected +, -, or .)`,
        source: 'biofmt',
      });
    }

    // Validate frame (column 8)
    const frame = columns[7];
    if (!validFrames.has(frame)) {
      const frameStart = columns.slice(0, 7).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: frameStart },
          end: { line: i, character: frameStart + frame.length },
        },
        message: `Invalid frame "${frame}" (expected 0, 1, 2, or .)`,
        source: 'biofmt',
      });
    }

    // Validate attributes format (GTF uses key "value"; pairs)
    const attrs = columns[8];
    if (attrs && attrs !== '.') {
      // Simple check for GTF attribute format
      if (!attrs.includes('"') && attrs !== '.') {
        const attrsStart = columns.slice(0, 8).join('\t').length + 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: i, character: attrsStart },
            end: { line: i, character: attrsStart + attrs.length },
          },
          message: 'GTF attributes should be in format: key "value";',
          source: 'biofmt',
        });
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validateGff3(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);
  const validStrands = new Set(['+', '-', '.', '?']);
  const validPhases = new Set(['0', '1', '2', '.']);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 9) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `GFF3 requires 9 columns, found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate start and end (columns 4 and 5, 1-based)
    const start = parseInt(columns[3], 10);
    const end = parseInt(columns[4], 10);

    if (isNaN(start) || isNaN(end)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start and end positions must be integers',
        source: 'biofmt',
      });
    } else if (start > end) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start position cannot be greater than end position',
        source: 'biofmt',
      });
    }

    // Validate strand (column 7)
    const strand = columns[6];
    if (!validStrands.has(strand)) {
      const strandStart = columns.slice(0, 6).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: strandStart },
          end: { line: i, character: strandStart + strand.length },
        },
        message: `Invalid strand "${strand}" (expected +, -, ., or ?)`,
        source: 'biofmt',
      });
    }

    // Validate phase (column 8)
    const phase = columns[7];
    if (!validPhases.has(phase)) {
      const phaseStart = columns.slice(0, 7).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: phaseStart },
          end: { line: i, character: phaseStart + phase.length },
        },
        message: `Invalid phase "${phase}" (expected 0, 1, 2, or .)`,
        source: 'biofmt',
      });
    }

    // Validate attributes format (GFF3 uses key=value; pairs)
    const attrs = columns[8];
    if (attrs && attrs !== '.') {
      // Check for GFF3 attribute format (should have = signs)
      if (!attrs.includes('=')) {
        const attrsStart = columns.slice(0, 8).join('\t').length + 1;
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: i, character: attrsStart },
            end: { line: i, character: attrsStart + attrs.length },
          },
          message: 'GFF3 attributes should be in format: key=value;key=value',
          source: 'biofmt',
        });
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validatePaf(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 12) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `PAF requires at least 12 columns, found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate numeric columns
    const numericCols = [
      { idx: 1, name: 'query length' },
      { idx: 2, name: 'query start' },
      { idx: 3, name: 'query end' },
      { idx: 6, name: 'target length' },
      { idx: 7, name: 'target start' },
      { idx: 8, name: 'target end' },
      { idx: 9, name: 'matches' },
      { idx: 10, name: 'alignment length' },
      { idx: 11, name: 'mapping quality' },
    ];

    for (const col of numericCols) {
      const val = parseInt(columns[col.idx], 10);
      if (isNaN(val) || val < 0) {
        const colStart = columns.slice(0, col.idx).join('\t').length + (col.idx > 0 ? 1 : 0);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: colStart },
            end: { line: i, character: colStart + columns[col.idx].length },
          },
          message: `${col.name} must be a non-negative integer`,
          source: 'biofmt',
        });
      }
    }

    // Validate strand (column 5)
    const strand = columns[4];
    if (strand !== '+' && strand !== '-') {
      const strandStart = columns.slice(0, 4).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: strandStart },
          end: { line: i, character: strandStart + strand.length },
        },
        message: `Invalid strand "${strand}" (expected + or -)`,
        source: 'biofmt',
      });
    }

    // Validate query start < query end
    const qStart = parseInt(columns[2], 10);
    const qEnd = parseInt(columns[3], 10);
    if (!isNaN(qStart) && !isNaN(qEnd) && qStart >= qEnd) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Query start should be less than query end',
        source: 'biofmt',
      });
    }

    // Validate target start < target end
    const tStart = parseInt(columns[7], 10);
    const tEnd = parseInt(columns[8], 10);
    if (!isNaN(tStart) && !isNaN(tEnd) && tStart >= tEnd) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Target start should be less than target end',
        source: 'biofmt',
      });
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validatePsl(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];

    // Skip empty lines, header lines
    if (!line.trim() ||
        line.startsWith('psLayout') ||
        line.startsWith('match') ||
        line.startsWith('---')) {
      continue;
    }

    const columns = line.split('\t');

    if (columns.length < 21) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `PSL requires 21 columns, found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate numeric columns (first 8 columns are counts)
    const numericCols = [
      { idx: 0, name: 'matches' },
      { idx: 1, name: 'misMatches' },
      { idx: 2, name: 'repMatches' },
      { idx: 3, name: 'nCount' },
      { idx: 4, name: 'qNumInsert' },
      { idx: 5, name: 'qBaseInsert' },
      { idx: 6, name: 'tNumInsert' },
      { idx: 7, name: 'tBaseInsert' },
      { idx: 10, name: 'qSize' },
      { idx: 11, name: 'qStart' },
      { idx: 12, name: 'qEnd' },
      { idx: 14, name: 'tSize' },
      { idx: 15, name: 'tStart' },
      { idx: 16, name: 'tEnd' },
      { idx: 17, name: 'blockCount' },
    ];

    for (const col of numericCols) {
      const val = parseInt(columns[col.idx], 10);
      if (isNaN(val) || val < 0) {
        const colStart = columns.slice(0, col.idx).join('\t').length + (col.idx > 0 ? 1 : 0);
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: colStart },
            end: { line: i, character: colStart + columns[col.idx].length },
          },
          message: `${col.name} must be a non-negative integer`,
          source: 'biofmt',
        });
      }
    }

    // Validate strand (column 9)
    const strand = columns[8];
    if (strand !== '+' && strand !== '-' && strand !== '++' && strand !== '+-' && strand !== '-+' && strand !== '--') {
      const strandStart = columns.slice(0, 8).join('\t').length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: strandStart },
          end: { line: i, character: strandStart + strand.length },
        },
        message: `Invalid strand "${strand}"`,
        source: 'biofmt',
      });
    }

    // Validate qStart < qEnd
    const qStart = parseInt(columns[11], 10);
    const qEnd = parseInt(columns[12], 10);
    if (!isNaN(qStart) && !isNaN(qEnd) && qStart >= qEnd) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Query start should be less than query end',
        source: 'biofmt',
      });
    }

    // Validate tStart < tEnd
    const tStart = parseInt(columns[15], 10);
    const tEnd = parseInt(columns[16], 10);
    if (!isNaN(tStart) && !isNaN(tEnd) && tStart >= tEnd) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Target start should be less than target end',
        source: 'biofmt',
      });
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validateWig(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);
  let inFixedStep = false;
  let inVariableStep = false;
  let currentSpan = 1;
  let currentStep = 0;

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Track definition line
    if (trimmed.startsWith('track')) {
      continue;
    }

    // Declaration lines
    if (trimmed.startsWith('fixedStep')) {
      inFixedStep = true;
      inVariableStep = false;

      // Validate required chrom parameter
      if (!trimmed.includes('chrom=')) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'fixedStep requires chrom parameter',
          source: 'biofmt',
        });
      }

      // Validate required start parameter
      if (!trimmed.includes('start=')) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'fixedStep requires start parameter',
          source: 'biofmt',
        });
      }

      // Validate required step parameter
      const stepMatch = trimmed.match(/step=(\d+)/);
      if (!stepMatch) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'fixedStep requires step parameter',
          source: 'biofmt',
        });
      } else {
        currentStep = parseInt(stepMatch[1], 10);
        if (currentStep <= 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: line.length },
            },
            message: 'step must be a positive integer',
            source: 'biofmt',
          });
        }
      }

      const spanMatch = trimmed.match(/span=(\d+)/);
      if (spanMatch) {
        currentSpan = parseInt(spanMatch[1], 10);
        if (currentSpan <= 0) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: line.length },
            },
            message: 'span should be a positive integer',
            source: 'biofmt',
          });
        }
      }
      continue;
    }

    if (trimmed.startsWith('variableStep')) {
      inVariableStep = true;
      inFixedStep = false;

      // Validate required chrom parameter
      if (!trimmed.includes('chrom=')) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'variableStep requires chrom parameter',
          source: 'biofmt',
        });
      }
      continue;
    }

    // Data lines
    const parts = trimmed.split(/\s+/);

    if (inFixedStep) {
      // fixedStep: just value
      if (parts.length !== 1) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'fixedStep data lines should have exactly one value',
          source: 'biofmt',
        });
      }
      const value = parseFloat(parts[0]);
      if (isNaN(value)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'Invalid numeric value',
          source: 'biofmt',
        });
      }
    } else if (inVariableStep) {
      // variableStep: position value
      if (parts.length < 2) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: line.length },
          },
          message: 'variableStep data lines require position and value',
          source: 'biofmt',
        });
        continue;
      }

      const pos = parseInt(parts[0], 10);
      const value = parseFloat(parts[1]);

      if (isNaN(pos) || pos < 0) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: 0 },
            end: { line: i, character: parts[0].length },
          },
          message: 'Position must be a non-negative integer',
          source: 'biofmt',
        });
      }

      if (isNaN(value)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: i, character: parts[0].length + 1 },
            end: { line: i, character: line.length },
          },
          message: 'Invalid numeric value',
          source: 'biofmt',
        });
      }
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

function validateBedGraph(
  document: TextDocument,
  settings: BioFmtSettings
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  const maxLines = Math.min(lines.length, settings.lsp.viewportBufferLines);

  for (let i = 0; i < maxLines; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines, comments, track/browser lines
    if (!trimmed || trimmed.startsWith('#') ||
        trimmed.startsWith('track') || trimmed.startsWith('browser')) {
      continue;
    }

    const columns = trimmed.split('\t');

    if (columns.length < 4) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: `bedGraph requires 4 columns (chrom, start, end, value), found ${columns.length}`,
        source: 'biofmt',
      });
      continue;
    }

    // Validate start and end
    const start = parseInt(columns[1], 10);
    const end = parseInt(columns[2], 10);

    if (isNaN(start) || start < 0) {
      const startPos = columns[0].length + 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: startPos },
          end: { line: i, character: startPos + columns[1].length },
        },
        message: 'Start must be a non-negative integer',
        source: 'biofmt',
      });
    }

    if (isNaN(end) || end < 0) {
      const endPos = columns[0].length + columns[1].length + 2;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: endPos },
          end: { line: i, character: endPos + columns[2].length },
        },
        message: 'End must be a non-negative integer',
        source: 'biofmt',
      });
    }

    if (!isNaN(start) && !isNaN(end) && start >= end) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Start must be less than end',
        source: 'biofmt',
      });
    }

    // Validate value
    const value = parseFloat(columns[3]);
    if (isNaN(value)) {
      const valuePos = columns[0].length + columns[1].length + columns[2].length + 3;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: valuePos },
          end: { line: i, character: valuePos + columns[3].length },
        },
        message: 'Value must be a number',
        source: 'biofmt',
      });
    }

    if (diagnostics.length >= settings.validation.maxDiagnostics) {
      break;
    }
  }

  return diagnostics;
}

// Folding range provider
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const languageId = getLanguageId(document);
  const ranges: FoldingRange[] = [];

  if (languageId === 'omics-vcf') {
    const header = getVcfHeader(document);
    if (header.headerEndLine > 1) {
      ranges.push({
        startLine: 0,
        endLine: header.headerEndLine - 1,
        kind: 'region',
      });
    }
  }

  return ranges;
});

// Document symbols provider
connection.onDocumentSymbol(
  (params: DocumentSymbolParams): DocumentSymbol[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const languageId = getLanguageId(document);

    if (languageId === 'omics-vcf') {
      return getVcfSymbols(document);
    }

    return [];
  }
);

function getVcfSymbols(document: TextDocument): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const header = getVcfHeader(document);

  // INFO definitions
  if (header.info.size > 0) {
    const infoChildren: DocumentSymbol[] = [];
    for (const [id, def] of header.info) {
      infoChildren.push({
        name: id,
        kind: SymbolKind.Field,
        range: {
          start: { line: def.line, character: 0 },
          end: { line: def.line, character: 100 },
        },
        selectionRange: {
          start: { line: def.line, character: 0 },
          end: { line: def.line, character: 100 },
        },
        detail: `${def.type} (${def.number})`,
      });
    }

    symbols.push({
      name: 'INFO',
      kind: SymbolKind.Class,
      range: {
        start: { line: 0, character: 0 },
        end: { line: header.headerEndLine, character: 0 },
      },
      selectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 },
      },
      children: infoChildren,
    });
  }

  // FORMAT definitions
  if (header.format.size > 0) {
    const formatChildren: DocumentSymbol[] = [];
    for (const [id, def] of header.format) {
      formatChildren.push({
        name: id,
        kind: SymbolKind.Field,
        range: {
          start: { line: def.line, character: 0 },
          end: { line: def.line, character: 100 },
        },
        selectionRange: {
          start: { line: def.line, character: 0 },
          end: { line: def.line, character: 100 },
        },
        detail: `${def.type} (${def.number})`,
      });
    }

    symbols.push({
      name: 'FORMAT',
      kind: SymbolKind.Class,
      range: {
        start: { line: 0, character: 0 },
        end: { line: header.headerEndLine, character: 0 },
      },
      selectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 },
      },
      children: formatChildren,
    });
  }

  // Samples
  if (header.samples.length > 0) {
    const sampleChildren: DocumentSymbol[] = header.samples.map(
      (sample, idx) => ({
        name: sample,
        kind: SymbolKind.Variable,
        range: {
          start: { line: header.headerEndLine - 1, character: 0 },
          end: { line: header.headerEndLine - 1, character: 100 },
        },
        selectionRange: {
          start: { line: header.headerEndLine - 1, character: 0 },
          end: { line: header.headerEndLine - 1, character: sample.length },
        },
        detail: `Sample ${idx + 1}`,
      })
    );

    symbols.push({
      name: `Samples (${header.samples.length})`,
      kind: SymbolKind.Array,
      range: {
        start: { line: header.headerEndLine - 1, character: 0 },
        end: { line: header.headerEndLine - 1, character: 100 },
      },
      selectionRange: {
        start: { line: header.headerEndLine - 1, character: 0 },
        end: { line: header.headerEndLine - 1, character: 7 },
      },
      children: sampleChildren,
    });
  }

  return symbols;
}

// Utility to get language ID from document
function getLanguageId(document: TextDocument): string {
  // The languageId should be set by VS Code based on file extension/content
  // Prefer the languageId from the client when available.
  if (document.languageId && document.languageId.startsWith('omics-')) {
    return document.languageId;
  }

  // Fallback: infer from URI extension
  const uri = document.uri.toLowerCase();

  if (uri.endsWith('.vcf')) return 'omics-vcf';
  if (uri.endsWith('.sam')) return 'omics-sam';
  if (uri.endsWith('.bed')) return 'omics-bed';
  if (uri.endsWith('.bedpe')) return 'omics-bedpe';
  if (uri.endsWith('.gtf')) return 'omics-gtf';
  if (uri.endsWith('.gff') || uri.endsWith('.gff3')) return 'omics-gff3';
  if (uri.endsWith('.psl')) return 'omics-psl';
  if (uri.endsWith('.paf')) return 'omics-paf';
  if (uri.endsWith('.maf')) return 'omics-maf-alignment'; // Default to alignment
  if (uri.endsWith('.ped')) return 'omics-ped';
  if (uri.endsWith('.map')) return 'omics-map';
  if (uri.endsWith('.gct')) return 'omics-gct';
  if (uri.endsWith('.mtx')) return 'omics-mtx';
  if (uri.endsWith('.mztab')) return 'omics-mztab';
  if (uri.endsWith('.mgf')) return 'omics-mgf';
  if (uri.endsWith('.bedgraph') || uri.endsWith('.bdg')) return 'omics-bedgraph';
  if (uri.endsWith('.wig')) return 'omics-wig';
  if (uri.endsWith('.narrowpeak')) return 'omics-narrowpeak';
  if (uri.endsWith('.broadpeak')) return 'omics-broadpeak';
  if (uri.endsWith('.gbk') || uri.endsWith('.gb') || uri.endsWith('.genbank')) return 'omics-genbank';
  if (uri.endsWith('.chain')) return 'omics-chain';
  if (uri.endsWith('.net')) return 'omics-net';
  if (uri.endsWith('.gfa')) return 'omics-gfa';

  return 'unknown';
}

// Start listening
documents.listen(connection);
connection.listen();
