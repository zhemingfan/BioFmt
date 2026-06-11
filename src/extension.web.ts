// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference lib="dom" />

/**
 * Browser-compatible extension entry point for vscode.dev.
 * No Node.js APIs (fs, path, zlib, child_process).
 * Supports text-format previews only — no BAM/tabix/BGZF.
 */

import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
} from 'vscode-languageclient/browser';
import { GENERATED_FORMATS } from './shared/generatedFormats';
import { clampRowRange, getPreviewLineLimit, normalizePreviewMaxLines } from './shared/previewLimits';
import type { DeclarativeRenderSpec } from './shared/formatSpec';
import { buildExternalAssetWebviewHtml } from './shared/webviewHtml';
import { parseInfoField } from './shared/infoField';

let client: LanguageClient | undefined;

const OMICS_LANGUAGES = [
  'omics-vcf', 'omics-sam', 'omics-bed', 'omics-bedpe',
  'omics-gtf', 'omics-gff3', 'omics-psl', 'omics-paf',
  'omics-maf-alignment', 'omics-maf-mutation',
  'omics-ped', 'omics-map', 'omics-gct', 'omics-mtx',
  'omics-mztab', 'omics-mgf', 'omics-bedgraph', 'omics-wig',
  'omics-narrowpeak', 'omics-broadpeak', 'omics-genbank',
  'omics-chain', 'omics-net', 'omics-gfa', 'omics-fasta', 'omics-fastq',
];

// Declarative formats (from /formats/*.json) participate alongside the hand-written ones.
const DECLARATIVE_LANGUAGES = GENERATED_FORMATS.map((f) => f.identity.languageId);
const ALL_LANGUAGES = [...OMICS_LANGUAGES, ...DECLARATIVE_LANGUAGES];

function getDeclarativeRender(languageId: string): DeclarativeRenderSpec | undefined {
  const spec = GENERATED_FORMATS.find((f) => f.identity.languageId === languageId);
  return spec
    ? { ...spec.render, displayName: spec.identity.displayName, delimiter: spec.tokenize.delimiter }
    : undefined;
}

const BIOFMT_DOCS_BASE = 'https://zhemingfan.github.io/BioFmt';

function biofmtRuleUrl(ruleCode: string): string {
  const anchor = ruleCode.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${BIOFMT_DOCS_BASE}/rules.html#${anchor}`;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('BioFmt web extension activating...');

  registerCommands(context);
  registerIndexedFallback(context);
  await startLanguageServer(context);

  console.log('BioFmt web extension activated');
}

export function deactivate(): Thenable<void> | undefined {
  if (client) {
    return client.stop();
  }
  return undefined;
}

function registerCommands(context: vscode.ExtensionContext): void {
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

      if (!ALL_LANGUAGES.includes(languageId)) {
        vscode.window.showWarningMessage(
          `BioFmt does not support language: ${languageId}`
        );
        return;
      }

      const fileName = document.uri.path.split('/').pop() || 'preview';

      const panel = vscode.window.createWebviewPanel(
        'biofmtPreview',
        `Preview: ${fileName}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist'),
          ],
        }
      );

      panel.webview.html = getPreviewHtml(panel.webview, context, document);

      let headerInfo: VcfHeaderInfo | undefined;
      if (languageId === 'omics-vcf') {
        headerInfo = parseVcfHeader(document);
      }
      const previewConfig = vscode.workspace.getConfiguration('biofmt.preview');
      const maxLines = normalizePreviewMaxLines(previewConfig.get<number>('maxLines', 200000));
      const previewLineLimit = getPreviewLineLimit(document.lineCount, maxLines, {
        preserveLeadingLines: headerInfo?.headerEndLine,
      });

      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'requestRows': {
              const rows = getDocumentRows(document, message.startLine, message.endLine, previewLineLimit);
              panel.webview.postMessage({
                command: 'rowData',
                rows,
                startLine: message.startLine,
              });
              break;
            }
            case 'getMetadata': {
              const metadata = getDocumentMetadata(document, headerInfo);
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
          }
        },
        undefined,
        context.subscriptions
      );

      const closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc === document) {
          panel.dispose();
        }
      });
      panel.onDidDispose(() => closeListener.dispose());
      context.subscriptions.push(closeListener);
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

  // Editor commands. These use only the vscode API (no Node.js), so they work
  // identically to the desktop build.
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
      if (cellValue.includes('=') || cellValue.includes(';')) {
        const parsed = parseInfoField(cellValue);
        await vscode.env.clipboard.writeText(JSON.stringify(parsed, null, 2));
      } else {
        await vscode.env.clipboard.writeText(JSON.stringify(cellValue));
      }
      vscode.window.showInformationMessage('Cell copied to clipboard as JSON');
    }
  );

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

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (!line.startsWith('#')) {
          break;
        }
        if (line.includes(`ID=${word}`) || line.includes(`ID=${word},`)) {
          editor.selection = new vscode.Selection(i, 0, i, line.length);
          editor.revealRange(new vscode.Range(i, 0, i, line.length));
          return;
        }
      }
      vscode.window.showInformationMessage(`Definition for "${word}" not found in header`);
    }
  );

  // Desktop-only commands: register graceful stubs so invoking them in the web
  // build shows an explanation instead of failing with "command not found".
  const openFixtureCommand = vscode.commands.registerCommand(
    'biofmt.openFixture',
    async () => {
      vscode.window.showInformationMessage(
        'Opening bundled sample fixtures is only available in the desktop BioFmt extension.'
      );
    }
  );

  const navigateToRegionCommand = vscode.commands.registerCommand(
    'biofmt.navigateToRegion',
    async () => {
      vscode.window.showInformationMessage(
        'Cross-file region navigation is only available in the desktop BioFmt extension.'
      );
    }
  );

  context.subscriptions.push(
    openPreviewCommand,
    openDiagnosticRuleCommand,
    openDiagnosticSpecCommand,
    copyDiagnosticRuleCommand,
    copyRowCommand,
    copyCellCommand,
    jumpToDefinitionCommand,
    openFixtureCommand,
    navigateToRegionCommand
  );
}

/**
 * The `biofmt.indexedPreview` custom editor is contributed for both the desktop
 * and web builds, but only the desktop build can read tabix/BAM indexes from the
 * filesystem. Register a read-only fallback in the web build so opening a
 * `.vcf.gz`/`.bam` in vscode.dev shows a clear explanation rather than an empty
 * or broken editor.
 */
function registerIndexedFallback(context: vscode.ExtensionContext): void {
  const provider: vscode.CustomReadonlyEditorProvider = {
    openCustomDocument(uri) {
      return { uri, dispose: () => {} };
    },
    resolveCustomEditor(_document, webviewPanel) {
      webviewPanel.webview.options = { enableScripts: false };
      webviewPanel.webview.html = getIndexedFallbackHtml();
    },
  };

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('biofmt.indexedPreview', provider, {
      supportsMultipleEditorsPerDocument: true,
    })
  );
}

function getIndexedFallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>BioFmt</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 2rem 2.5rem; line-height: 1.6; }
    h2 { font-weight: 600; }
    code { font-family: var(--vscode-editor-font-family, monospace); }
  </style>
</head>
<body>
  <h2>Indexed &amp; binary files need the desktop extension</h2>
  <p>BioFmt on the web (vscode.dev, github.dev) previews text formats only. Indexed and binary files such as <code>.vcf.gz</code>, <code>.bed.gz</code>, and <code>.bam</code> rely on tabix/BAM indexes read from the local filesystem, which the web build cannot access.</p>
  <p>Open this file with the desktop BioFmt extension to use the region navigator and binary previews.</p>
</body>
</html>`;
}

async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  const serverUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'server.worker.js');

  const clientOptions: LanguageClientOptions = {
    documentSelector: ALL_LANGUAGES.map((lang) => ({
      language: lang,
    })),
    synchronize: {
      configurationSection: 'biofmt',
    },
  };

  client = new LanguageClient(
    'biofmtLanguageServer',
    'BioFmt Language Server',
    clientOptions,
    new Worker(serverUri.toString(true))
  );

  await client.start();

  const visibleRangeDisposable = vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
    if (client && ALL_LANGUAGES.includes(event.textEditor.document.languageId)) {
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
}

// --- Preview helpers (no Node.js APIs) ---

function getPreviewHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  document: vscode.TextDocument
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist', 'webview.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'webview', 'dist', 'styles.css')
  );

  const fileName = document.uri.path.split('/').pop() || 'unknown';

  return buildExternalAssetWebviewHtml({
    title: fileName,
    cspSource: webview.cspSource,
    styleUri: String(styleUri),
    scriptUri: String(scriptUri),
  });
}

function getDocumentRows(
  document: vscode.TextDocument,
  startLine: number,
  endLine: number,
  lineLimit = document.lineCount,
): string[] {
  const range = clampRowRange(startLine, endLine, Math.min(lineLimit, document.lineCount));
  if (!range) return [];

  const rows: string[] = [];
  for (let i = range.startLine; i < range.endLine; i++) {
    rows.push(document.lineAt(i).text);
  }
  return rows;
}

interface VcfHeaderInfo {
  fileformat?: string;
  headerEndLine: number;
  samples: string[];
  infoFields: { id: string; number: string; type: string; description: string }[];
  formatFields: { id: string; number: string; type: string; description: string }[];
  filterFields: { id: string; description: string }[];
  contigFields: { id: string; length?: number }[];
}

function parseVcfHeader(document: vscode.TextDocument): VcfHeaderInfo {
  const result: VcfHeaderInfo = {
    headerEndLine: 0,
    samples: [],
    infoFields: [],
    formatFields: [],
    filterFields: [],
    contigFields: [],
  };

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (!line.startsWith('#')) {
      result.headerEndLine = i;
      break;
    }

    if (line.startsWith('##fileformat=')) {
      result.fileformat = line.substring(13).trim();
    } else if (line.startsWith('##INFO=<')) {
      const parsed = parseStructuredField(line);
      if (parsed) result.infoFields.push(parsed);
    } else if (line.startsWith('##FORMAT=<')) {
      const parsed = parseStructuredField(line);
      if (parsed) result.formatFields.push(parsed);
    } else if (line.startsWith('##FILTER=<')) {
      const match = line.match(/ID=([^,>]+)/);
      const descMatch = line.match(/Description="([^"]*)"/);
      if (match) {
        result.filterFields.push({ id: match[1], description: descMatch?.[1] || '' });
      }
    } else if (line.startsWith('##contig=<')) {
      const match = line.match(/ID=([^,>]+)/);
      const lenMatch = line.match(/length=(\d+)/);
      if (match) {
        result.contigFields.push({
          id: match[1],
          length: lenMatch ? parseInt(lenMatch[1], 10) : undefined,
        });
      }
    } else if (line.startsWith('#CHROM')) {
      const columns = line.split('\t');
      result.samples = columns.slice(9);
      result.headerEndLine = i + 1;
    }
  }

  return result;
}

function parseStructuredField(line: string): { id: string; number: string; type: string; description: string } | null {
  const idMatch = line.match(/ID=([^,>]+)/);
  const numMatch = line.match(/Number=([^,>]+)/);
  const typeMatch = line.match(/Type=([^,>]+)/);
  const descMatch = line.match(/Description="([^"]*)"/);

  if (!idMatch) return null;
  return {
    id: idMatch[1],
    number: numMatch?.[1] || '.',
    type: typeMatch?.[1] || 'String',
    description: descMatch?.[1] || '',
  };
}

function getDocumentMetadata(document: vscode.TextDocument, headerInfo?: VcfHeaderInfo) {
  const fileName = document.uri.path.split('/').pop() || 'unknown';

  const config = vscode.workspace.getConfiguration('biofmt.preview');
  const maxLines = normalizePreviewMaxLines(config.get<number>('maxLines', 200000));

  return {
    fileName,
    languageId: document.languageId,
    lineCount: document.lineCount,
    previewSettings: {
      maxLines,
      sampleColumnLimit: config.get<number>('sampleColumnLimit', 10),
    },
    headerInfo,
    declarativeRender: getDeclarativeRender(document.languageId),
  };
}
