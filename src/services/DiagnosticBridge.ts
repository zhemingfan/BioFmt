// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import { toPreviewDiagnostics } from '../shared/diagnostics';

/**
 * Forwards a document's VS Code diagnostics into a preview webview so it can
 * render row-level error markers. Pushes the current diagnostics immediately
 * and again whenever they change for this document. The pure transform lives in
 * `shared/diagnostics` (unit-tested); this module only bridges vscode → webview.
 *
 * Returns a Disposable that stops forwarding; dispose it when the panel closes.
 */
export function attachDiagnosticBridge(
  panel: vscode.WebviewPanel,
  uri: vscode.Uri
): vscode.Disposable {
  const push = () => {
    const diagnostics = toPreviewDiagnostics(vscode.languages.getDiagnostics(uri));
    // postMessage is a no-op if the webview isn't ready yet; the webview also
    // sends `requestDiagnostics` on mount to cover that race.
    void panel.webview.postMessage({ command: 'diagnostics', diagnostics });
  };

  const changeSub = vscode.languages.onDidChangeDiagnostics((e) => {
    if (e.uris.some((u) => u.toString() === uri.toString())) {
      push();
    }
  });

  // Initial push (best-effort; may land before the webview registers its
  // listener, which is why the webview re-requests on mount).
  push();

  return {
    dispose() {
      changeSub.dispose();
    },
  };
}

/** Send the current diagnostics for `uri` to the panel (answers requestDiagnostics). */
export function pushDiagnostics(panel: vscode.WebviewPanel, uri: vscode.Uri): void {
  const diagnostics = toPreviewDiagnostics(vscode.languages.getDiagnostics(uri));
  void panel.webview.postMessage({ command: 'diagnostics', diagnostics });
}
