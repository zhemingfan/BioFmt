// SPDX-License-Identifier: GPL-3.0-or-later

import type { VsCodeApi, MessageToExtension } from './types';

let _vscode: VsCodeApi | null = null;

export function getVsCode(): VsCodeApi {
  if (_vscode === null) {
    _vscode = acquireVsCodeApi();
  }
  return _vscode;
}

export function postMessage(message: MessageToExtension): void {
  getVsCode().postMessage(message);
}

export function navigateToRegion(chrom: string, start: number, end: number): void {
  postMessage({ command: 'navigateToRegion', chrom, start, end });
}
