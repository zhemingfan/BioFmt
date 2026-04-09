// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as vscode from 'vscode';
import { Buffer } from 'buffer';
import type { GenericFilehandle, Stats } from 'generic-filehandle';

/**
 * Implements the generic-filehandle interface using Node.js fs for local files.
 * This enables @gmod libraries to do byte-range reads on local files.
 *
 * For file:// URIs, we use Node.js fs.open/fs.read for true random access.
 * Remote URIs are not supported (would require reading the entire file).
 */
export class VsCodeFileHandle implements GenericFilehandle {
  private fd: number | undefined;
  private filePath: string;

  constructor(uri: vscode.Uri) {
    if (uri.scheme !== 'file') {
      throw new Error(`VsCodeFileHandle only supports local file:// URIs, got ${uri.scheme}://`);
    }
    this.filePath = uri.fsPath;
  }

  private async getFd(): Promise<number> {
    if (this.fd === undefined) {
      this.fd = await new Promise<number>((resolve, reject) => {
        fs.open(this.filePath, 'r', (err, fd) => {
          if (err) reject(err);
          else resolve(fd);
        });
      });
    }
    return this.fd;
  }

  async read(
    buf: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number; buffer: Buffer }> {
    const fd = await this.getFd();
    return new Promise((resolve, reject) => {
      fs.read(fd, buf, offset, length, position, (err, bytesRead, buffer) => {
        if (err) reject(err);
        else resolve({ bytesRead, buffer });
      });
    });
  }

  async readFile(): Promise<Buffer>;
  async readFile(options: BufferEncoding): Promise<string>;
  async readFile(options?: any): Promise<Buffer | string> {
    return new Promise((resolve, reject) => {
      const encoding = typeof options === 'string' ? options : options?.encoding;
      fs.readFile(this.filePath, encoding, (err, data) => {
        if (err) reject(err);
        else resolve(data as Buffer | string);
      });
    });
  }

  async stat(): Promise<Stats> {
    return new Promise((resolve, reject) => {
      fs.stat(this.filePath, (err, stats) => {
        if (err) reject(err);
        else resolve({ size: stats.size });
      });
    });
  }

  async close(): Promise<void> {
    if (this.fd !== undefined) {
      const fd = this.fd;
      this.fd = undefined;
      return new Promise((resolve, reject) => {
        fs.close(fd, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}
