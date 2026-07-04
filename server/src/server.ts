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
  DidChangeConfigurationNotification,
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
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { getValidator } from './validators';
import { getVcfHover, getVcfSymbols, getVcfHeader, getVcfCompletions, getVcfDefinition, clearHeaderCache } from './validators/vcf';
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
import { WorkspaceScanner } from './workspace/workspaceScanner';
import { getDiagnosticCodeActions } from './diagnosticActions';
import { VisibleRangeTracker } from './visibleRanges';

// Create connection using all proposed features
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Track visible ranges per document (per source: editor / preview) for
// viewport-aware validation. Validation covers the union across sources.
const visibleRanges = new VisibleRangeTracker();

// Settings
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
      codeActionProvider: true,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      completionProvider: { triggerCharacters: ['=', ';', ':', ','] },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
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

// Receive visible range updates from the client for viewport-aware validation.
// `source` distinguishes the text editor's viewport from a preview panel's so
// both are validated (their union) rather than overwriting each other.
connection.onNotification('biofmt/visibleRange', (params: { uri: string; ranges: { startLine: number; endLine: number }[]; source?: string }) => {
  visibleRanges.set(params.uri, params.source ?? 'editor', params.ranges);
  const doc = documents.get(params.uri);
  if (doc) validateDocument(doc);
});

// Workspace-wide lint
const workspaceScanner = new WorkspaceScanner();
let lastWorkspaceUris = new Set<string>();

connection.onNotification('biofmt/workspaceFiles', async (params: { files: Array<{ uri: string; languageId: string }>; maxFileSizeMB?: number }) => {
  const openUris = new Set(documents.all().map(d => d.uri));
  const currentUris = new Set(params.files.map(f => f.uri));

  // Clear diagnostics for files no longer in workspace
  workspaceScanner.clearStale(currentUris, lastWorkspaceUris, connection);
  lastWorkspaceUris = currentUris;

  // Get settings from first file or use defaults
  const settings = params.files.length > 0
    ? await getDocumentSettings(params.files[0].uri)
    : globalSettings;

  workspaceScanner.cancel();
  await workspaceScanner.scanFiles(
    params.files,
    connection,
    settings,
    params.maxFileSizeMB ?? 10,
    openUris,
  );
});

connection.onNotification('biofmt/workspaceCancel', () => {
  workspaceScanner.cancel();
});

// Document events
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
  clearHeaderCache(e.document.uri);
  clearGff3IndexCache(e.document.uri);
  visibleRanges.delete(e.document.uri);
});

documents.onDidOpen((e) => {
  validateDocument(e.document);
});

documents.onDidChangeContent((change) => {
  clearHeaderCache(change.document.uri);
  clearGff3IndexCache(change.document.uri);
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

  documents.all().forEach(validateDocument);
});

// Hover provider
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

// Document validation
async function validateDocument(document: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(document.uri);

  if (settings.validation.level === 'off') {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const languageId = getLanguageId(document);
  const validator = getValidator(languageId);
  let diagnostics: Diagnostic[] = [];

  if (validator) {
    const context: ValidatorContext = {
      uri: document.uri,
      lineCount: document.lineCount,
      headerEndLine: 0,
      bufferLines: settings.lsp.viewportBufferLines,
      visibleRanges: visibleRanges.get(document.uri),
    };

    diagnostics = validator(document.getText(), settings, context);
  }

  if (diagnostics.length > settings.validation.maxDiagnostics) {
    diagnostics = diagnostics.slice(0, settings.validation.maxDiagnostics);
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Language ID detection
function getLanguageId(document: TextDocument): string {
  if (document.languageId && document.languageId.startsWith('omics-')) {
    return document.languageId;
  }

  const uri = document.uri.toLowerCase();

  if (uri.endsWith('.vcf')) return 'omics-vcf';
  if (uri.endsWith('.sam')) return 'omics-sam';
  if (uri.endsWith('.bed')) return 'omics-bed';
  if (uri.endsWith('.bedpe')) return 'omics-bedpe';
  if (uri.endsWith('.gtf')) return 'omics-gtf';
  if (uri.endsWith('.gff') || uri.endsWith('.gff3')) return 'omics-gff3';
  if (uri.endsWith('.psl')) return 'omics-psl';
  if (uri.endsWith('.paf')) return 'omics-paf';
  if (uri.endsWith('.maf')) return 'omics-maf-alignment';
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
  if (uri.endsWith('.fasta') || uri.endsWith('.fa') || uri.endsWith('.fna') || uri.endsWith('.ffn') || uri.endsWith('.faa') || uri.endsWith('.frn')) return 'omics-fasta';
  if (uri.endsWith('.fastq') || uri.endsWith('.fq')) return 'omics-fastq';

  return 'unknown';
}

// Start listening
documents.listen(connection);
connection.listen();
