// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { FileProvider } from './types';
import { discoverIndex } from './indexDiscovery';
import { BgzfTextProvider } from './BgzfTextProvider';
import { TabixProvider } from './TabixProvider';
import { BamProvider } from './BamProvider';

/**
 * Format detection from file extension for indexed/binary files.
 * Maps compound extensions to language IDs.
 */
function detectFormatId(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.vcf.gz')) return 'omics-vcf';
  if (lower.endsWith('.bed.gz')) return 'omics-bed';
  if (lower.endsWith('.gff3.gz')) return 'omics-gff3';
  if (lower.endsWith('.gff.gz')) return 'omics-gff3';
  if (lower.endsWith('.bam')) return 'omics-bam';
  if (lower.endsWith('.fasta.gz') || lower.endsWith('.fa.gz')) return 'omics-fasta';
  if (lower.endsWith('.fastq.gz') || lower.endsWith('.fq.gz')) return 'omics-fastq';
  return 'unknown';
}

/**
 * CustomReadonlyEditorProvider for binary and indexed files.
 * Opens a webview panel (same React app as text previews) but backed by
 * a FileProvider that supports region-based queries instead of line-based reads.
 */
export class IndexedEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'biofmt.indexedPreview';

  /** Active providers keyed by document URI, so we can clean up on close */
  private activeProviders = new Map<string, FileProvider>();

  constructor(private context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const uri = document.uri;
    const fileName = path.basename(uri.fsPath);
    const formatId = detectFormatId(fileName);

    // Discover index
    const indexInfo = await discoverIndex(uri);

    // Set up webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist')),
      ],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    // Create the appropriate FileProvider based on format
    // Phase 2: just stub metadata — actual providers (Tabix, BAM) come in Phases 3-4
    const provider = await this.createProvider(uri, formatId, indexInfo);
    if (provider) {
      this.activeProviders.set(uri.toString(), provider);
    }

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'getMetadata': {
            if (provider) {
              const meta = await provider.getMetadata();
              const config = vscode.workspace.getConfiguration('biofmt.preview');
              webviewPanel.webview.postMessage({
                command: 'metadata',
                lineCount: meta.lineCount ?? 0,
                languageId: meta.formatId,
                fileName: meta.fileName,
                providerType: meta.type,
                references: meta.references,
                previewSettings: {
                  maxLines: config.get<number>('maxLines', 200000),
                  maxBytes: config.get<number>('maxBytes', 52428800),
                  downsampleLimit: config.get<number>('downsampleLimit', 200000),
                  sampleColumnLimit: config.get<number>('sampleColumnLimit', 10),
                  maxRegionRecords: config.get<number>('maxRegionRecords', 10000),
                },
              });
            } else {
              webviewPanel.webview.postMessage({
                command: 'metadata',
                lineCount: 0,
                languageId: formatId,
                fileName,
                providerType: 'indexed',
                error: indexInfo ? undefined : 'No index file found',
              });
            }
            break;
          }

          case 'requestRows': {
            if (provider) {
              const rows = await provider.getRows(message.startLine, message.endLine);
              webviewPanel.webview.postMessage({
                command: 'rowData',
                rows,
                startLine: message.startLine,
              });
            }
            break;
          }

          case 'requestRegion': {
            if (provider?.getRegion) {
              try {
                const result = await provider.getRegion(
                  message.chrom,
                  message.start,
                  message.end,
                );
                webviewPanel.webview.postMessage({
                  command: 'regionData',
                  rows: result.rows,
                  chrom: message.chrom,
                  start: message.start,
                  end: message.end,
                  requestId: message.requestId,
                  hasMore: result.hasMore,
                });
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                webviewPanel.webview.postMessage({
                  command: 'regionData',
                  rows: [],
                  chrom: message.chrom,
                  start: message.start,
                  end: message.end,
                  requestId: message.requestId,
                  hasMore: false,
                  error: errMsg,
                });
              }
            }
            break;
          }

          case 'requestReferences': {
            if (provider?.getReferences) {
              const refs = await provider.getReferences();
              webviewPanel.webview.postMessage({
                command: 'references',
                refs,
              });
            }
            break;
          }
        }
      },
      undefined,
      this.context.subscriptions,
    );

    // Cleanup on close
    webviewPanel.onDidDispose(() => {
      const p = this.activeProviders.get(uri.toString());
      if (p) {
        p.dispose();
        this.activeProviders.delete(uri.toString());
      }
    });
  }

  /**
   * Create a FileProvider for the given file based on format and available index.
   */
  private async createProvider(
    uri: vscode.Uri,
    formatId: string,
    indexInfo: { type: string; uri: vscode.Uri } | null,
  ): Promise<FileProvider | null> {
    const fileName = path.basename(uri.fsPath).toLowerCase();

    // Tabix-indexed bgzipped files: use region-based random access
    if (fileName.endsWith('.gz') && indexInfo && (indexInfo.type === 'tbi' || indexInfo.type === 'csi')) {
      return TabixProvider.create(uri, formatId, indexInfo as { type: 'tbi' | 'csi'; uri: vscode.Uri });
    }

    // Bgzipped files without index: decompress fully
    if (fileName.endsWith('.gz')) {
      return BgzfTextProvider.create(uri, formatId);
    }

    // BAM files with .bai or .csi index
    if (fileName.endsWith('.bam') && indexInfo && (indexInfo.type === 'bai' || indexInfo.type === 'csi')) {
      return BamProvider.create(uri, indexInfo as { type: 'bai' | 'csi'; uri: vscode.Uri });
    }

    return null;
  }

  private getHtml(webview: vscode.Webview): string {
    const webviewDistPath = path.join(this.context.extensionPath, 'webview', 'dist', 'webview.js');
    const styleDistPath = path.join(this.context.extensionPath, 'webview', 'dist', 'styles.css');

    let scriptContent = '';
    let styleContent = '';

    if (fs.existsSync(webviewDistPath)) {
      const scriptUri = webview.asWebviewUri(vscode.Uri.file(webviewDistPath));
      scriptContent = `<script src="${scriptUri}"></script>`;
    }

    if (fs.existsSync(styleDistPath)) {
      styleContent = fs.readFileSync(styleDistPath, 'utf-8');
    }

    const fallbackStyles = styleContent || `
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        margin: 0; padding: 0;
      }
      .loading { display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 16px; }
      .spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-editor-lineHighlightBackground); border-top-color: var(--vscode-focusBorder); border-radius: 50%; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;

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
}
