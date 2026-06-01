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

  context.subscriptions.push(
    openPreviewCommand,
    openDiagnosticRuleCommand,
    openDiagnosticSpecCommand,
    copyDiagnosticRuleCommand
  );
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>${fileName}</title>
</head>
<body>
  <div id="root">
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading preview...</div>
    </div>
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
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
