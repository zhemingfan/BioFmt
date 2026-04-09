// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import * as path from 'path';
import type { FileProvider, ProviderMetadata } from './types';

/**
 * FileProvider backed by a VS Code TextDocument.
 * This wraps the existing line-based read logic for text format files.
 */
export class TextDocumentProvider implements FileProvider {
  constructor(private document: vscode.TextDocument) {}

  async getRows(startLine: number, endLine: number): Promise<string[]> {
    const rows: string[] = [];
    const maxLine = Math.min(endLine, this.document.lineCount);
    for (let i = startLine; i < maxLine; i++) {
      rows.push(this.document.lineAt(i).text);
    }
    return rows;
  }

  async getMetadata(): Promise<ProviderMetadata> {
    let fileSize = 0;
    try {
      const stat = await vscode.workspace.fs.stat(this.document.uri);
      fileSize = stat.size;
    } catch {
      // untitled docs may not have a stat
    }

    return {
      type: 'text',
      lineCount: this.document.lineCount,
      hasIndex: false,
      fileSize,
      formatId: this.document.languageId,
      fileName: path.basename(this.document.fileName),
    };
  }

  dispose(): void {
    // TextDocument lifecycle is managed by VS Code, nothing to dispose
  }
}
