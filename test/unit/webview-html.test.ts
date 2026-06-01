// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import { buildExternalAssetWebviewHtml } from '../../src/shared/webviewHtml';

describe('webview html helpers', () => {
  it('adds a restrictive CSP and escapes the webview title', () => {
    const html = buildExternalAssetWebviewHtml({
      title: 'evil"><script>alert(1)</script>.vcf',
      cspSource: 'vscode-resource://biofmt',
      styleUri: 'vscode-resource://biofmt/styles.css',
      scriptUri: 'vscode-resource://biofmt/webview.js',
    });

    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /style-src vscode-resource:\/\/biofmt/);
    assert.match(html, /script-src vscode-resource:\/\/biofmt/);
    assert.match(html, /<title>evil&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;\.vcf<\/title>/);
    assert.doesNotMatch(html, /<title>evil"><script>/);
  });
});
