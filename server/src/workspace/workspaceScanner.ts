// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as url from 'url';
import type { Connection } from 'vscode-languageserver/node';
import { getValidator } from '../validators';
import type { BioFmtSettings, ValidatorContext } from '../validators/types';
import { defaultSettings } from '../validators/types';

interface WorkspaceFile {
  uri: string;
  languageId: string;
}

export class WorkspaceScanner {
  private cancelled = false;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async scanFiles(
    files: WorkspaceFile[],
    connection: Connection,
    settings?: BioFmtSettings,
    maxFileSizeMB = 10,
    openUris?: Set<string>,
  ): Promise<{ scanned: number; errors: number }> {
    this.cancelled = false;
    this.running = true;

    let scanned = 0;
    let errors = 0;

    for (let idx = 0; idx < files.length; idx++) {
      if (this.cancelled) break;

      const file = files[idx];

      // Skip files already open in the editor (they use viewport-aware validation)
      if (openUris && openUris.has(file.uri)) continue;

      const result = await this.validateFile(file, connection, settings || defaultSettings, maxFileSizeMB);
      if (result !== null) {
        scanned++;
        errors += result;
      }

      // Yield to event loop every 10 files to avoid blocking hover/diagnostics
      if (idx % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    this.running = false;
    return { scanned, errors };
  }

  private async validateFile(
    file: WorkspaceFile,
    connection: Connection,
    settings: BioFmtSettings,
    maxFileSizeMB: number,
  ): Promise<number | null> {
    try {
      const filePath = url.fileURLToPath(file.uri);
      const stat = await fs.promises.stat(filePath);

      // Skip files over size limit
      if (stat.size > maxFileSizeMB * 1024 * 1024) return null;

      const text = await fs.promises.readFile(filePath, 'utf-8');
      const validator = getValidator(file.languageId);
      if (!validator) return null;

      const lines = text.split(/\r?\n/);
      const context: ValidatorContext = {
        uri: file.uri,
        lineCount: lines.length,
        headerEndLine: 0,
        bufferLines: 1000, // validate first 1000 lines of non-open files
      };

      const diagnostics = validator(text, settings, context);

      // Limit diagnostics per file
      const limited = diagnostics.length > settings.validation.maxDiagnostics
        ? diagnostics.slice(0, settings.validation.maxDiagnostics)
        : diagnostics;

      connection.sendDiagnostics({ uri: file.uri, diagnostics: limited });
      return limited.length;
    } catch {
      // File may have been deleted or become inaccessible
      return null;
    }
  }

  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Clear diagnostics for files that are no longer in the workspace file list.
   */
  clearStale(currentUris: Set<string>, previousUris: Set<string>, connection: Connection): void {
    for (const uri of previousUris) {
      if (!currentUris.has(uri)) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
    }
  }
}
