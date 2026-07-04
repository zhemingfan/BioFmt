// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Paints gutter icons next to editor lines that have error/warning diagnostics.
 * VS Code already renders squiggles, overview-ruler ticks, and minimap marks for
 * published diagnostics — the per-line gutter glyph is the one editor decoration
 * it does not provide, so that is all this adds. Info/hint severities are left to
 * the squiggle to avoid gutter noise.
 */
export class DiagnosticGutter implements vscode.Disposable {
  private readonly errorDecoration: vscode.TextEditorDecorationType;
  private readonly warningDecoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    extensionPath: string,
    private readonly isSupportedLanguage: (languageId: string) => boolean
  ) {
    const icon = (name: string) =>
      vscode.Uri.file(path.join(extensionPath, 'media', name));

    this.errorDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon('gutter-error.svg'),
      gutterIconSize: 'contain',
    });
    this.warningDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon('gutter-warning.svg'),
      gutterIconSize: 'contain',
    });

    this.disposables.push(
      this.errorDecoration,
      this.warningDecoration,
      vscode.languages.onDidChangeDiagnostics((e) => this.onDiagnosticsChanged(e)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.refresh(editor);
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshVisible())
    );

    this.refreshVisible();
  }

  private onDiagnosticsChanged(e: vscode.DiagnosticChangeEvent): void {
    const changed = new Set(e.uris.map((u) => u.toString()));
    for (const editor of vscode.window.visibleTextEditors) {
      if (changed.has(editor.document.uri.toString())) {
        this.refresh(editor);
      }
    }
  }

  private refreshVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refresh(editor);
    }
  }

  private refresh(editor: vscode.TextEditor): void {
    if (!this.isSupportedLanguage(editor.document.languageId)) {
      editor.setDecorations(this.errorDecoration, []);
      editor.setDecorations(this.warningDecoration, []);
      return;
    }

    const errors: vscode.DecorationOptions[] = [];
    const warnings: vscode.DecorationOptions[] = [];

    for (const diag of vscode.languages.getDiagnostics(editor.document.uri)) {
      const line = diag.range.start.line;
      const gutterRange = new vscode.Range(line, 0, line, 0);
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        errors.push({ range: gutterRange });
      } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
        warnings.push({ range: gutterRange });
      }
    }

    editor.setDecorations(this.errorDecoration, errors);
    editor.setDecorations(this.warningDecoration, warnings);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
