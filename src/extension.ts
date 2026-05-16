// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { IndexedEditorProvider } from './providers/IndexedEditorProvider';
import { GenomicIndexRegistry } from './services/GenomicIndexRegistry';
import { parseGenomicCoords } from './shared/genomicCoords';

let client: LanguageClient | undefined;
let genomicRegistry: GenomicIndexRegistry | undefined;

// Map of supported language IDs for BioFmt
const OMICS_LANGUAGES = [
  'omics-vcf',
  'omics-sam',
  'omics-bed',
  'omics-bedpe',
  'omics-gtf',
  'omics-gff3',
  'omics-psl',
  'omics-paf',
  'omics-maf-alignment',
  'omics-maf-mutation',
  'omics-ped',
  'omics-map',
  'omics-gct',
  'omics-mtx',
  'omics-mztab',
  'omics-mgf',
  'omics-bedgraph',
  'omics-wig',
  'omics-narrowpeak',
  'omics-broadpeak',
  'omics-genbank',
  'omics-chain',
  'omics-net',
  'omics-gfa',
  'omics-fasta',
  'omics-fastq',
];

const BIOFMT_DOCS_BASE = 'https://zhemingfan.github.io/BioFmt';

function biofmtRuleUrl(ruleCode: string): string {
  const anchor = ruleCode.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${BIOFMT_DOCS_BASE}/rules.html#${anchor}`;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('BioFmt extension activating...');

  // Register commands
  registerCommands(context);

  // Register custom editor for indexed/binary files
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      IndexedEditorProvider.viewType,
      new IndexedEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Start LSP server
  await startLanguageServer(context);

  // Set up cross-format navigation
  setupGenomicIndex(context);

  console.log('BioFmt extension activated');
}

export function deactivate(): Thenable<void> | undefined {
  if (genomicRegistry) {
    genomicRegistry.dispose();
    genomicRegistry = undefined;
  }
  if (client) {
    return client.stop();
  }
  return undefined;
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Open Preview command
  const openPreviewCommand = vscode.commands.registerCommand(
    'biofmt.openPreview',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const document = editor.document;
      const languageId = document.languageId;

      if (!OMICS_LANGUAGES.includes(languageId)) {
        vscode.window.showWarningMessage(
          `BioFmt does not support language: ${languageId}`
        );
        return;
      }

      // Check file size against configured maxBytes
      const config = vscode.workspace.getConfiguration('biofmt.preview');
      const maxBytes = config.get<number>('maxBytes', 52428800);
      let fileSize: number | undefined;
      try {
        const stat = await vscode.workspace.fs.stat(document.uri);
        fileSize = stat.size;
        if (stat.size > maxBytes) {
          const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
          const limitMB = (maxBytes / (1024 * 1024)).toFixed(0);
          const advice = getFileSizeAdvice(languageId);
          const choice = await vscode.window.showWarningMessage(
            `File is ${sizeMB} MB (limit: ${limitMB} MB). Preview will be truncated.${advice ? ' ' + advice : ''}`,
            'Open Anyway', 'Cancel'
          );
          if (choice !== 'Open Anyway') return;
        }
      } catch {
        // stat may fail for untitled docs — proceed anyway
      }

      // Create and show preview panel
      const panel = vscode.window.createWebviewPanel(
        'biofmtPreview',
        `Preview: ${path.basename(document.fileName)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'webview', 'dist')),
          ],
        }
      );

      // Set up panel content
      panel.webview.html = getPreviewHtml(panel.webview, context, document);

      // Parse header for VCF files
      let headerInfo: VcfHeaderInfo | undefined;
      if (languageId === 'omics-vcf') {
        headerInfo = parseVcfHeader(document);
      }

      // Handle messages from webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'requestRows': {
              const rows = await getDocumentRows(
                document,
                message.startLine,
                message.endLine
              );
              panel.webview.postMessage({
                command: 'rowData',
                rows,
                startLine: message.startLine,
              });
              break;
            }
            case 'getMetadata': {
              const metadata = getDocumentMetadata(document, headerInfo, fileSize);
              panel.webview.postMessage({
                command: 'metadata',
                ...metadata,
              });
              break;
            }
            case 'requestHeader':
              if (languageId === 'omics-vcf') {
                headerInfo = parseVcfHeader(document);
                panel.webview.postMessage({
                  command: 'headerInfo',
                  headerInfo,
                });
              }
              break;
            case 'navigateToRegion': {
              await vscode.commands.executeCommand(
                'biofmt.navigateToRegion',
                message.chrom,
                message.start,
                message.end
              );
              break;
            }
          }
        },
        undefined,
        context.subscriptions
      );

      // Close preview when document closes; dispose listener when panel closes
      const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc === document) {
          panel.dispose();
        }
      });
      panel.onDidDispose(() => closeListener.dispose());
      context.subscriptions.push(closeListener);
    }
  );

  // Open Fixture command (dev-only)
  const openFixtureCommand = vscode.commands.registerCommand(
    'biofmt.openFixture',
    async () => {
      const fixturesPath = path.join(context.extensionPath, 'test', 'fixtures');

      // Get all fixture files
      const fixtureFiles = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(fixturesPath)
      );

      const items = fixtureFiles
        .filter(([_name, type]) => type === vscode.FileType.File)
        .map(([name]) => ({
          label: name,
          description: getFormatFromExtension(name),
          detail: path.join(fixturesPath, name),
        }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a fixture file to open',
      });

      if (selected) {
        const doc = await vscode.workspace.openTextDocument(selected.detail);
        await vscode.window.showTextDocument(doc);
      }
    }
  );

  // Copy Row as TSV
  const copyRowCommand = vscode.commands.registerCommand(
    'biofmt.copyRowAsTsv',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const line = editor.document.lineAt(editor.selection.active.line);
      await vscode.env.clipboard.writeText(line.text);
      vscode.window.showInformationMessage('Row copied to clipboard');
    }
  );

  // Copy Cell as JSON
  const copyCellCommand = vscode.commands.registerCommand(
    'biofmt.copyCellAsJson',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const position = editor.selection.active;
      const line = document.lineAt(position.line).text;
      const columns = line.split('\t');

      // Find which column the cursor is in
      let charCount = 0;
      let columnIndex = 0;
      for (let i = 0; i < columns.length; i++) {
        charCount += columns[i].length + 1; // +1 for tab
        if (position.character < charCount) {
          columnIndex = i;
          break;
        }
      }

      const cellValue = columns[columnIndex] || '';

      // Try to parse as key-value (INFO field style)
      if (cellValue.includes('=') || cellValue.includes(';')) {
        const parsed = parseInfoField(cellValue);
        await vscode.env.clipboard.writeText(JSON.stringify(parsed, null, 2));
      } else {
        await vscode.env.clipboard.writeText(JSON.stringify(cellValue));
      }

      vscode.window.showInformationMessage('Cell copied to clipboard as JSON');
    }
  );

  // Jump to Header Definition
  const jumpToDefinitionCommand = vscode.commands.registerCommand(
    'biofmt.jumpToHeaderDefinition',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const position = editor.selection.active;
      const wordRange = document.getWordRangeAtPosition(position);

      if (!wordRange) {
        return;
      }

      const word = document.getText(wordRange);

      // Search for definition in header
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        // Stop at first non-header line
        if (!line.startsWith('#')) {
          break;
        }

        // Look for INFO, FORMAT, or FILTER definitions
        if (line.includes(`ID=${word}`) || line.includes(`ID=${word},`)) {
          editor.selection = new vscode.Selection(i, 0, i, line.length);
          editor.revealRange(new vscode.Range(i, 0, i, line.length));
          return;
        }
      }

      vscode.window.showInformationMessage(`Definition for "${word}" not found in header`);
    }
  );

  const openDiagnosticRuleCommand = vscode.commands.registerCommand(
    'biofmt.openDiagnosticRule',
    async (ruleCode?: string, href?: string) => {
      const target = href || (ruleCode ? biofmtRuleUrl(ruleCode) : `${BIOFMT_DOCS_BASE}/validation.html`);
      await vscode.env.openExternal(vscode.Uri.parse(target));
    }
  );

  const openDiagnosticSpecCommand = vscode.commands.registerCommand(
    'biofmt.openDiagnosticSpec',
    async (href?: string) => {
      if (!href) {
        vscode.window.showWarningMessage('No specification link is available for this diagnostic');
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(href));
    }
  );

  const copyDiagnosticRuleCommand = vscode.commands.registerCommand(
    'biofmt.copyDiagnosticRule',
    async (details?: string) => {
      if (!details) {
        vscode.window.showWarningMessage('No diagnostic details are available to copy');
        return;
      }
      await vscode.env.clipboard.writeText(details);
      vscode.window.showInformationMessage('BioFmt diagnostic details copied');
    }
  );

  // Warn when a file is too large for VS Code to syntax-highlight.
  // VS Code silently disables TextMate tokenization above ~20 MB
  // (editor.largeFileOptimizations). Users see plain white text with no
  // explanation, so we surface a one-time info message.
  const LARGE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — VS Code's threshold
  const warnedUris = new Set<string>();

  const largFileListener = vscode.workspace.onDidOpenTextDocument(async (doc) => {
    if (!doc.languageId.startsWith('omics-')) return;
    const key = doc.uri.toString();
    if (warnedUris.has(key)) return;
    try {
      const stat = await vscode.workspace.fs.stat(doc.uri);
      if (stat.size > LARGE_FILE_BYTES) {
        warnedUris.add(key);
        const mb = (stat.size / (1024 * 1024)).toFixed(0);
        vscode.window.showWarningMessage(
          `BioFmt: "${doc.fileName.split('/').pop()}" is ${mb} MB — VS Code disables syntax highlighting for files over 20 MB. Open the Command Palette and run "BioFmt: Open Preview" to view the file.`
        );
      }
    } catch {
      // stat failed (e.g. unsaved buffer) — ignore
    }
  });

  context.subscriptions.push(
    openPreviewCommand,
    openFixtureCommand,
    copyRowCommand,
    copyCellCommand,
    jumpToDefinitionCommand,
    openDiagnosticRuleCommand,
    openDiagnosticSpecCommand,
    copyDiagnosticRuleCommand,
    largFileListener
  );
}

async function startLanguageServer(
  context: vscode.ExtensionContext
): Promise<void> {
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: OMICS_LANGUAGES.map((lang) => ({
      scheme: 'file',
      language: lang,
    })),
    synchronize: {
      configurationSection: 'biofmt',
    },
  };

  client = new LanguageClient(
    'biofmtLanguageServer',
    'BioFmt Language Server',
    serverOptions,
    clientOptions
  );

  await client.start();

  // Send visible range to the LSP server for viewport-aware validation
  const visibleRangeDisposable = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
    if (client && OMICS_LANGUAGES.includes(event.textEditor.document.languageId)) {
      client.sendNotification('biofmt/visibleRange', {
        uri: event.textEditor.document.uri.toString(),
        ranges: event.visibleRanges.map(r => ({
          startLine: r.start.line,
          endLine: r.end.line,
        })),
      });
    }
  });
  context.subscriptions.push(visibleRangeDisposable);

  // Workspace-wide lint
  const workspaceConfig = vscode.workspace.getConfiguration('biofmt.workspace');
  if (workspaceConfig.get<boolean>('enableLint', false)) {
    startWorkspaceLint(context);
  }

  // Re-trigger workspace lint when config changes
  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('biofmt.workspace.enableLint')) {
      const enabled = vscode.workspace.getConfiguration('biofmt.workspace').get<boolean>('enableLint', false);
      if (enabled) {
        startWorkspaceLint(context);
      } else if (client) {
        client.sendNotification('biofmt/workspaceCancel');
      }
    }
  });
  context.subscriptions.push(configDisposable);
}

const BIO_FILE_PATTERNS = [
  '**/*.vcf', '**/*.sam', '**/*.bed', '**/*.bedpe',
  '**/*.gtf', '**/*.gff', '**/*.gff3',
  '**/*.paf', '**/*.psl',
  '**/*.wig', '**/*.bedGraph', '**/*.bdg',
  '**/*.narrowPeak', '**/*.broadPeak',
  '**/*.fasta', '**/*.fa', '**/*.fna', '**/*.fastq', '**/*.fq',
  '**/*.maf', '**/*.ped', '**/*.map', '**/*.gct',
  '**/*.mtx', '**/*.mztab', '**/*.mgf',
  '**/*.gbk', '**/*.gb', '**/*.genbank',
  '**/*.chain', '**/*.net', '**/*.gfa',
];

function inferLanguageId(fsPath: string): string {
  const lower = fsPath.toLowerCase();
  if (lower.endsWith('.vcf')) return 'omics-vcf';
  if (lower.endsWith('.sam')) return 'omics-sam';
  if (lower.endsWith('.bed')) return 'omics-bed';
  if (lower.endsWith('.bedpe')) return 'omics-bedpe';
  if (lower.endsWith('.gtf')) return 'omics-gtf';
  if (lower.endsWith('.gff') || lower.endsWith('.gff3')) return 'omics-gff3';
  if (lower.endsWith('.psl')) return 'omics-psl';
  if (lower.endsWith('.paf')) return 'omics-paf';
  if (lower.endsWith('.wig')) return 'omics-wig';
  if (lower.endsWith('.bedgraph') || lower.endsWith('.bdg')) return 'omics-bedgraph';
  if (lower.endsWith('.narrowpeak')) return 'omics-narrowpeak';
  if (lower.endsWith('.broadpeak')) return 'omics-broadpeak';
  if (lower.endsWith('.fasta') || lower.endsWith('.fa') || lower.endsWith('.fna')) return 'omics-fasta';
  if (lower.endsWith('.fastq') || lower.endsWith('.fq')) return 'omics-fastq';
  if (lower.endsWith('.maf')) return 'omics-maf-alignment';
  if (lower.endsWith('.ped')) return 'omics-ped';
  if (lower.endsWith('.map')) return 'omics-map';
  if (lower.endsWith('.gct')) return 'omics-gct';
  if (lower.endsWith('.mtx')) return 'omics-mtx';
  if (lower.endsWith('.mztab')) return 'omics-mztab';
  if (lower.endsWith('.mgf')) return 'omics-mgf';
  if (lower.endsWith('.gbk') || lower.endsWith('.gb') || lower.endsWith('.genbank')) return 'omics-genbank';
  if (lower.endsWith('.chain')) return 'omics-chain';
  if (lower.endsWith('.net')) return 'omics-net';
  if (lower.endsWith('.gfa')) return 'omics-gfa';
  return 'unknown';
}

let workspaceScanTimeout: ReturnType<typeof setTimeout> | undefined;

async function startWorkspaceLint(context: vscode.ExtensionContext): Promise<void> {
  if (!client) return;

  const config = vscode.workspace.getConfiguration('biofmt.workspace');
  const maxFiles = config.get<number>('maxFiles', 100);
  const maxFileSizeMB = config.get<number>('maxFileSizeMB', 10);

  const files: Array<{ uri: string; languageId: string }> = [];

  for (const pattern of BIO_FILE_PATTERNS) {
    if (files.length >= maxFiles) break;
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxFiles - files.length);
    for (const uri of uris) {
      const languageId = inferLanguageId(uri.fsPath);
      if (languageId !== 'unknown') {
        files.push({ uri: uri.toString(), languageId });
      }
    }
  }

  client.sendNotification('biofmt/workspaceFiles', { files, maxFileSizeMB });

  // Watch for file changes and re-scan (debounced)
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{vcf,sam,bed,bedpe,gtf,gff,gff3,paf,psl,wig,bedGraph,narrowPeak,broadPeak,fasta,fa,fastq,fq}');

  const debouncedRescan = () => {
    if (workspaceScanTimeout) clearTimeout(workspaceScanTimeout);
    workspaceScanTimeout = setTimeout(() => startWorkspaceLint(context), 2000);
  };

  watcher.onDidCreate(debouncedRescan);
  watcher.onDidChange(debouncedRescan);
  watcher.onDidDelete(debouncedRescan);
  context.subscriptions.push(watcher);
}

// VCF Header types
interface VcfHeaderInfo {
  fileformat?: string;
  infoFields: InfoDefinition[];
  formatFields: FormatDefinition[];
  filterFields: FilterDefinition[];
  samples: string[];
  headerEndLine: number;
}

interface InfoDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
}

interface FormatDefinition {
  id: string;
  number: string;
  type: string;
  description: string;
}

interface FilterDefinition {
  id: string;
  description: string;
}

function parseVcfHeader(document: vscode.TextDocument): VcfHeaderInfo {
  const header: VcfHeaderInfo = {
    infoFields: [],
    formatFields: [],
    filterFields: [],
    samples: [],
    headerEndLine: 0,
  };

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (!line.startsWith('#')) {
      header.headerEndLine = i;
      break;
    }

    if (line.startsWith('##fileformat=')) {
      header.fileformat = line.substring('##fileformat='.length).trim();
    } else if (line.startsWith('##INFO=<')) {
      const info = parseStructuredField(line, '##INFO=<');
      if (info && info.ID) {
        header.infoFields.push({
          id: info.ID,
          number: info.Number || '.',
          type: info.Type || 'String',
          description: info.Description || '',
        });
      }
    } else if (line.startsWith('##FORMAT=<')) {
      const format = parseStructuredField(line, '##FORMAT=<');
      if (format && format.ID) {
        header.formatFields.push({
          id: format.ID,
          number: format.Number || '.',
          type: format.Type || 'String',
          description: format.Description || '',
        });
      }
    } else if (line.startsWith('##FILTER=<')) {
      const filter = parseStructuredField(line, '##FILTER=<');
      if (filter && filter.ID) {
        header.filterFields.push({
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

function getPreviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): string {
  // Try to load the React bundle
  const webviewDistPath = path.join(context.extensionPath, 'webview', 'dist', 'webview.js');
  const styleDistPath = path.join(context.extensionPath, 'webview', 'dist', 'styles.css');

  let scriptContent = '';
  let styleContent = '';

  // Try to load bundled webview
  if (fs.existsSync(webviewDistPath)) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(webviewDistPath));
    scriptContent = `<script src="${scriptUri}"></script>`;
  }

  // Load styles
  if (fs.existsSync(styleDistPath)) {
    styleContent = fs.readFileSync(styleDistPath, 'utf-8');
  }

  // Fallback inline styles if no external CSS
  const fallbackStyles = styleContent || `
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      margin: 0;
      padding: 0;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 16px;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-editor-lineHighlightBackground);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  // If no React bundle, use fallback inline preview
  if (!scriptContent) {
    return getFallbackPreviewHtml(document, fallbackStyles);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <title>BioFmt Preview</title>
  <style>${fallbackStyles}</style>
</head>
<body>
  <div id="root">
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading preview...</div>
    </div>
  </div>
  ${scriptContent}
</body>
</html>`;
}

function getFallbackPreviewHtml(document: vscode.TextDocument, styles: string): string {
  const languageId = document.languageId;
  const fileName = path.basename(document.fileName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>BioFmt Preview</title>
  <style>
    ${styles}
    .header { padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border); }
    .header h1 { margin: 0 0 4px 0; font-size: 1.2em; }
    .header .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .table-container { padding: 16px; overflow: auto; }
    table { border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
    th { background: var(--vscode-editor-lineHighlightBackground); font-weight: 600; }
    tr:hover { background: var(--vscode-list-hoverBackground); }
  </style>
</head>
<body>
  <div class="header">
    <h1>${fileName}</h1>
    <div class="meta">Format: ${languageId.replace('omics-', '').toUpperCase()}</div>
  </div>
  <div class="table-container" id="content">
    <div class="loading"><div class="spinner"></div></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ command: 'getMetadata' });
    vscode.postMessage({ command: 'requestRows', startLine: 0, endLine: 200 });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'rowData') {
        renderRows(message.rows);
      }
    });

    function renderRows(rows) {
      const content = document.getElementById('content');
      if (!rows || rows.length === 0) {
        content.innerHTML = '<div>No data</div>';
        return;
      }
      const dataRows = rows.filter(r => r && !r.startsWith('#') && !r.startsWith('@'));
      if (dataRows.length === 0) {
        content.innerHTML = '<div>Header only</div>';
        return;
      }
      let html = '<table><tbody>';
      for (const row of dataRows.slice(0, 100)) {
        const cells = row.split('\\t');
        html += '<tr>';
        for (let i = 0; i < Math.min(cells.length, 12); i++) {
          html += '<td title="' + escapeHtml(cells[i]) + '">' + escapeHtml(cells[i]) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}

async function getDocumentRows(
  document: vscode.TextDocument,
  startLine: number,
  endLine: number
): Promise<string[]> {
  const rows: string[] = [];
  const maxLine = Math.min(endLine, document.lineCount);

  for (let i = startLine; i < maxLine; i++) {
    rows.push(document.lineAt(i).text);
  }

  return rows;
}

function getDocumentMetadata(
  document: vscode.TextDocument,
  headerInfo?: VcfHeaderInfo,
  fileSize?: number
): {
  lineCount: number;
  languageId: string;
  fileName: string;
  headerInfo?: VcfHeaderInfo;
  previewSettings: { maxLines: number; maxBytes: number; downsampleLimit: number; sampleColumnLimit: number };
  fileSize?: number;
} {
  const config = vscode.workspace.getConfiguration('biofmt.preview');
  return {
    lineCount: document.lineCount,
    languageId: document.languageId,
    fileName: path.basename(document.fileName),
    headerInfo,
    fileSize,
    previewSettings: {
      maxLines: config.get<number>('maxLines', 200000),
      maxBytes: config.get<number>('maxBytes', 52428800),
      downsampleLimit: config.get<number>('downsampleLimit', 200000),
      sampleColumnLimit: config.get<number>('sampleColumnLimit', 10),
    },
  };
}

function getFileSizeAdvice(languageId: string): string {
  switch (languageId) {
    case 'omics-sam':
      return 'For large alignments, convert to BAM (samtools view -bS) — BioFmt supports indexed BAM with no file size limit.';
    case 'omics-vcf':
      return 'For large VCFs, bgzip and index with tabix — BioFmt supports indexed VCF.gz with no file size limit.';
    case 'omics-fasta':
      return 'For large FASTA files, consider samtools faidx for indexed access or a genome browser like IGV.';
    case 'omics-fastq':
      return 'FASTQ files are typically too large for interactive preview. Consider FastQC or MultiQC for quality assessment.';
    case 'omics-bed':
    case 'omics-bedpe':
    case 'omics-narrowpeak':
    case 'omics-broadpeak':
    case 'omics-gff3':
    case 'omics-gtf':
      return 'For large annotation files, bgzip and tabix-index for region-based access.';
    case 'omics-bedgraph':
    case 'omics-wig':
      return 'For large track files, convert to bigWig for indexed access in a genome browser.';
    default:
      return '';
  }
}

function getFormatFromExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const formats: Record<string, string> = {
    '.vcf': 'VCF - Variant Call Format',
    '.sam': 'SAM - Sequence Alignment Map',
    '.bed': 'BED - Browser Extensible Data',
    '.bedpe': 'BEDPE - Paired-End BED Format',
    '.gtf': 'GTF - Gene Transfer Format',
    '.gff': 'GFF3 - General Feature Format',
    '.gff3': 'GFF3 - General Feature Format',
    '.psl': 'PSL - Pattern Space Layout',
    '.paf': 'PAF - Pairwise mApping Format',
    '.maf': 'MAF - Multiple Alignment Format',
    '.ped': 'PED - Pedigree Format',
    '.map': 'MAP - Genetic Map Format',
    '.gct': 'GCT - Gene Cluster Text',
    '.mtx': 'MTX - Matrix Market',
    '.mztab': 'mzTab - Proteomics Format',
    '.mgf': 'MGF - Mascot Generic Format',
    '.bedgraph': 'bedGraph - Track Format',
    '.bdg': 'bedGraph - Track Format',
    '.wig': 'WIG - Wiggle Track Format',
    '.narrowpeak': 'narrowPeak - ChIP-seq Peaks',
    '.broadpeak': 'broadPeak - ChIP-seq Peaks',
    '.gbk': 'GenBank - Sequence Format',
    '.gb': 'GenBank - Sequence Format',
    '.chain': 'Chain - UCSC Chain Format',
    '.net': 'Net - UCSC Net Format',
    '.gfa': 'GFA - Graphical Fragment Assembly',
    '.txt': 'Text File',
    '.tsv': 'TSV - Tab Separated Values',
    '.sf': 'Salmon Quant',
  };
  return formats[ext] || 'Unknown Format';
}

function parseInfoField(value: string): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  const pairs = value.split(';');

  for (const pair of pairs) {
    if (pair.includes('=')) {
      const [key, val] = pair.split('=', 2);
      result[key] = val;
    } else if (pair) {
      result[pair] = true;
    }
  }

  return result;
}

// Cross-format genomic navigation

const NAVIGABLE_LANGUAGES = [
  'omics-vcf', 'omics-bed', 'omics-bedpe', 'omics-narrowpeak', 'omics-broadpeak',
  'omics-gff3', 'omics-gtf', 'omics-sam', 'omics-paf', 'omics-fasta',
];

function setupGenomicIndex(context: vscode.ExtensionContext): void {
  genomicRegistry = new GenomicIndexRegistry();

  // Index all currently open documents
  for (const doc of vscode.workspace.textDocuments) {
    genomicRegistry.indexDocument(doc);
  }

  // Index documents when opened
  const openListener = vscode.workspace.onDidOpenTextDocument((doc) => {
    genomicRegistry?.indexDocument(doc);
  });

  // Re-index on change (debounced)
  const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    genomicRegistry?.scheduleReindex(e.document);
  });

  // Remove from index when closed
  const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
    genomicRegistry?.removeDocument(doc.uri.toString());
  });

  // Register DefinitionProvider for cross-format navigation
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    NAVIGABLE_LANGUAGES.map(lang => ({ language: lang, scheme: 'file' })),
    new GenomicDefinitionProvider()
  );

  // Command for webview-initiated navigation
  const navigateCommand = vscode.commands.registerCommand(
    'biofmt.navigateToRegion',
    async (chrom?: string, start?: number, end?: number) => {
      if (!genomicRegistry || !chrom || start === undefined || end === undefined) {
        vscode.window.showInformationMessage('No region specified');
        return;
      }

      const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
      const regions = genomicRegistry.findOverlapping(chrom, start, end, activeUri);

      if (regions.length === 0) {
        // Also check FASTA contigs
        const contig = genomicRegistry.findContig(chrom, activeUri);
        if (contig) {
          await openAtRegion(contig);
          return;
        }
        vscode.window.showInformationMessage(
          `No open file contains an overlapping region for ${chrom}:${start + 1}-${end}`
        );
        return;
      }

      if (regions.length === 1) {
        await openAtRegion(regions[0]);
      } else {
        // Multiple matches — let user pick
        const items = regions.map(r => ({
          label: `${r.chrom}:${r.start + 1}-${r.end}`,
          description: vscode.Uri.parse(r.uri).fsPath.split('/').pop() || '',
          region: r,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select overlapping region',
        });
        if (picked) {
          await openAtRegion(picked.region);
        }
      }
    }
  );

  context.subscriptions.push(
    openListener,
    changeListener,
    closeListener,
    definitionProvider,
    navigateCommand,
    { dispose: () => genomicRegistry?.dispose() }
  );
}

async function openAtRegion(region: { uri: string; lineNumber: number }): Promise<void> {
  const uri = vscode.Uri.parse(region.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
  const range = new vscode.Range(region.lineNumber, 0, region.lineNumber, 0);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

class GenomicDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    if (!genomicRegistry) return null;

    const line = document.lineAt(position.line).text;
    if (!line.trim() || line.startsWith('#') || line.startsWith('@')) return null;

    const region = this.parseRegionAtCursor(line, document.languageId);
    if (!region) return null;

    const overlapping = genomicRegistry.findOverlapping(
      region.chrom, region.start, region.end, document.uri.toString()
    );

    // Also check FASTA contigs
    const contig = genomicRegistry.findContig(region.chrom, document.uri.toString());
    if (contig) {
      overlapping.push(contig);
    }

    if (overlapping.length === 0) return null;

    return overlapping.map(r => new vscode.Location(
      vscode.Uri.parse(r.uri),
      new vscode.Position(r.lineNumber, 0)
    ));
  }

  private parseRegionAtCursor(
    line: string,
    languageId: string
  ): { chrom: string; start: number; end: number } | null {
    return parseGenomicCoords(line, languageId);
  }
}
