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

      if (!OMICS_LANGUAGES.includes(languageId)) {
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

      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'requestRows': {
              const rows = getDocumentRows(document, message.startLine, message.endLine);
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

  context.subscriptions.push(openPreviewCommand);
}

async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  const serverUri = vscode.Uri.joinPath(context.extensionUri, 'dist', 'server.worker.js');

  const clientOptions: LanguageClientOptions = {
    documentSelector: OMICS_LANGUAGES.map((lang) => ({
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

function getDocumentRows(document: vscode.TextDocument, startLine: number, endLine: number): string[] {
  const rows: string[] = [];
  const maxLine = Math.min(endLine, document.lineCount);
  for (let i = startLine; i < maxLine; i++) {
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

  return {
    fileName,
    languageId: document.languageId,
    lineCount: document.lineCount,
    previewSettings: {
      maxLines: config.get<number>('maxLines', 200000),
      sampleColumnLimit: config.get<number>('sampleColumnLimit', 10),
    },
    headerInfo,
  };
}
