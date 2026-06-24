// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference lib="webworker" />

/**
 * Browser-compatible LSP server running as a Web Worker.
 * Uses vscode-languageserver/browser instead of /node.
 * All validators are pure string functions — no Node.js deps.
 */

import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Hover,
  HoverParams,
  Diagnostic,
  FoldingRange,
  FoldingRangeParams,
  DocumentSymbol,
  DocumentSymbolParams,
  CodeActionParams,
  CodeAction,
  CompletionItem,
  CompletionParams,
  Definition,
  DefinitionParams,
  ReferenceParams,
  Location,
  RenameParams,
  PrepareRenameParams,
  WorkspaceEdit,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/browser';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { getValidator } from './validators';
import { getVcfHover, getVcfSymbols, getVcfCompletions, getVcfDefinition, clearHeaderCache } from './validators/vcf';
import {
  getGff3Completions,
  getGff3Definition,
  getGff3References,
  getGff3PrepareRename,
  getGff3Rename,
  clearGff3IndexCache,
} from './validators/gff3';
import { getSamCompletions } from './validators/sam';
import type { BioFmtSettings, ValidatorContext } from './validators/types';
import { defaultSettings } from './validators/types';
import { getDiagnosticCodeActions } from './diagnosticActions';

// Browser-specific connection setup
const messageReader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope);
const messageWriter = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope);
const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const visibleRanges = new Map<string, { startLine: number; endLine: number }[]>();

let globalSettings: BioFmtSettings = defaultSettings;
const documentSettings = new Map<string, Thenable<BioFmtSettings>>();

let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = !!(
    capabilities.workspace && capabilities.workspace.configuration
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      codeActionProvider: true,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      completionProvider: { triggerCharacters: ['=', ';', ':', ','] },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
    },
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      { section: 'biofmt' }
    );
  }
});

function getLanguageId(document: TextDocument): string {
  // TextDocument doesn't expose languageId in all environments.
  // Fall back to URI-based detection.
  const langId = (document as { languageId?: string }).languageId;
  if (langId) return langId;

  const uri = document.uri.toLowerCase();
  if (uri.endsWith('.vcf')) return 'omics-vcf';
  if (uri.endsWith('.sam')) return 'omics-sam';
  if (uri.endsWith('.bed')) return 'omics-bed';
  if (uri.endsWith('.gff3') || uri.endsWith('.gff')) return 'omics-gff3';
  if (uri.endsWith('.gtf')) return 'omics-gtf';
  if (uri.endsWith('.paf')) return 'omics-paf';
  return '';
}

function getDocumentSettings(resource: string): Thenable<BioFmtSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'biofmt',
    }).then((config: BioFmtSettings | undefined) => config || defaultSettings);
    documentSettings.set(resource, result);
  }
  return result;
}

// Validate documents
async function validateDocument(document: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(document.uri);
  const languageId = getLanguageId(document);

  const validate = getValidator(languageId);
  if (!validate) return;

  const context: ValidatorContext = {
    uri: document.uri,
    lineCount: document.lineCount,
    headerEndLine: 0,
    bufferLines: settings.lsp.viewportBufferLines,
    visibleRanges: visibleRanges.get(document.uri),
  };

  const text = document.getText();
  const diagnostics: Diagnostic[] = validate(text, settings, context);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

documents.onDidChangeContent((change) => {
  clearHeaderCache(change.document.uri);
  clearGff3IndexCache(change.document.uri);
  validateDocument(change.document);
});

// Hover
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const languageId = getLanguageId(document);

  switch (languageId) {
    case 'omics-vcf':
      return getVcfHover(document, params);
    default:
      return null;
  }
});

// Completion provider
connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  switch (getLanguageId(document)) {
    case 'omics-vcf':
      return getVcfCompletions(document, params);
    case 'omics-gff3':
      return getGff3Completions(document, params);
    case 'omics-sam':
      return getSamCompletions(document, params);
    default:
      return [];
  }
});

// Go-to-definition provider
connection.onDefinition((params: DefinitionParams): Definition | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  switch (getLanguageId(document)) {
    case 'omics-vcf':
      return getVcfDefinition(document, params);
    case 'omics-gff3':
      return getGff3Definition(document, params);
    default:
      return null;
  }
});

// Find-all-references provider
connection.onReferences((params: ReferenceParams): Location[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  switch (getLanguageId(document)) {
    case 'omics-gff3':
      return getGff3References(document, params);
    default:
      return null;
  }
});

// Rename providers (prepare + apply)
connection.onPrepareRename((params: PrepareRenameParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  switch (getLanguageId(document)) {
    case 'omics-gff3':
      return getGff3PrepareRename(document, params);
    default:
      return null;
  }
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  switch (getLanguageId(document)) {
    case 'omics-gff3':
      return getGff3Rename(document, params);
    default:
      return null;
  }
});

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  return getDiagnosticCodeActions(params);
});

// Folding ranges
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const languageId = getLanguageId(document);
  const ranges: FoldingRange[] = [];

  if (languageId === 'omics-vcf') {
    const text = document.getText();
    const lines = text.split('\n');
    let headerStart = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#')) {
        if (headerStart === -1) headerStart = i;
      } else {
        if (headerStart !== -1 && i - headerStart > 1) {
          ranges.push({ startLine: headerStart, endLine: i - 1 });
        }
        break;
      }
    }
  }

  return ranges;
});

// Document symbols
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const languageId = getLanguageId(document);
  if (languageId === 'omics-vcf') {
    return getVcfSymbols(document);
  }
  return [];
});

// Viewport tracking
connection.onNotification('biofmt/visibleRange', (params: { uri: string; ranges: { startLine: number; endLine: number }[] }) => {
  visibleRanges.set(params.uri, params.ranges);
});

// Settings changes
connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    documentSettings.clear();
  } else {
    globalSettings = change.settings?.biofmt || defaultSettings;
  }
  documents.all().forEach(validateDocument);
});

documents.listen(connection);
connection.listen();
