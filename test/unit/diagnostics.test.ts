// SPDX-License-Identifier: GPL-3.0-or-later

import * as assert from 'assert';
import {
  toPreviewDiagnostics,
  worstSeverity,
  type PreviewDiagnostic,
  type PreviewDiagnosticSeverity,
} from '../../src/shared/diagnostics';

describe('shared/diagnostics', () => {
  describe('toPreviewDiagnostics', () => {
    it('maps range lines, severity, message, and a string code', () => {
      const result = toPreviewDiagnostics([
        { range: { start: { line: 4 }, end: { line: 4 } }, severity: 0, message: 'bad POS', code: 'VCF-S005' },
      ]);
      assert.deepStrictEqual(result, [
        { line: 4, endLine: 4, severity: 'error', message: 'bad POS', code: 'VCF-S005' },
      ]);
    });

    it('maps every numeric severity to its name', () => {
      const sev = (n: number) =>
        toPreviewDiagnostics([{ range: { start: { line: 0 }, end: { line: 0 } }, severity: n, message: 'm' }])[0].severity;
      assert.strictEqual(sev(0), 'error');
      assert.strictEqual(sev(1), 'warning');
      assert.strictEqual(sev(2), 'info');
      assert.strictEqual(sev(3), 'hint');
    });

    it('defaults missing severity to error (VS Code treats undefined as Error)', () => {
      const r = toPreviewDiagnostics([{ range: { start: { line: 1 }, end: { line: 1 } }, message: 'm' }]);
      assert.strictEqual(r[0].severity, 'error');
    });

    it('stringifies numeric and object codes; leaves undefined undefined', () => {
      const num = toPreviewDiagnostics([{ range: { start: { line: 0 }, end: { line: 0 } }, severity: 1, message: 'm', code: 42 }]);
      assert.strictEqual(num[0].code, '42');
      const obj = toPreviewDiagnostics([{ range: { start: { line: 0 }, end: { line: 0 } }, severity: 1, message: 'm', code: { value: 'X1' } }]);
      assert.strictEqual(obj[0].code, 'X1');
      const none = toPreviewDiagnostics([{ range: { start: { line: 0 }, end: { line: 0 } }, severity: 1, message: 'm' }]);
      assert.strictEqual(none[0].code, undefined);
    });

    it('preserves multi-line ranges', () => {
      const r = toPreviewDiagnostics([{ range: { start: { line: 3 }, end: { line: 7 } }, severity: 0, message: 'm' }]);
      assert.strictEqual(r[0].line, 3);
      assert.strictEqual(r[0].endLine, 7);
    });
  });

  describe('worstSeverity', () => {
    const d = (severity: PreviewDiagnosticSeverity): PreviewDiagnostic => ({
      line: 0,
      endLine: 0,
      severity,
      message: 'm',
    });

    it('returns undefined for an empty set', () => {
      assert.strictEqual(worstSeverity([]), undefined);
    });

    it('picks the most severe regardless of order', () => {
      assert.strictEqual(worstSeverity([d('info'), d('error'), d('warning')]), 'error');
      assert.strictEqual(worstSeverity([d('hint'), d('warning'), d('info')]), 'warning');
      assert.strictEqual(worstSeverity([d('info'), d('hint')]), 'info');
    });
  });
});
