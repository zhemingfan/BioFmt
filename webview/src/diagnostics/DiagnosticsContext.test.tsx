// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen } from '@testing-library/react';
import { DiagnosticsProvider, useDiagnostics } from './DiagnosticsContext';
import type { PreviewDiagnostic } from '../../../src/shared/diagnostics';

function Probe() {
  const d = useDiagnostics();
  return (
    <div>
      <span data-testid="has">{String(d.hasDiagnostics)}</span>
      <span data-testid="markers">{d.markerLines.join(',')}</span>
      <span data-testid="counts">{`${d.counts.error}/${d.counts.warning}/${d.counts.info}`}</span>
      <span data-testid="worst4">{String(d.worstFor(4))}</span>
      <span data-testid="worst2">{String(d.worstFor(2))}</span>
      <span data-testid="worst0">{String(d.worstFor(0))}</span>
    </div>
  );
}

const diags: PreviewDiagnostic[] = [
  { line: 4, endLine: 4, severity: 'error', message: 'e', code: 'C1' },
  { line: 4, endLine: 4, severity: 'warning', message: 'w' },
  { line: 2, endLine: 2, severity: 'info', message: 'i' },
];

describe('DiagnosticsProvider', () => {
  it('groups by line and computes markers, counts, and worst severity', () => {
    render(
      <DiagnosticsProvider diagnostics={diags} onRevealLine={() => {}}>
        <Probe />
      </DiagnosticsProvider>
    );
    expect(screen.getByTestId('has').textContent).toBe('true');
    expect(screen.getByTestId('markers').textContent).toBe('2,4');
    expect(screen.getByTestId('counts').textContent).toBe('1/1/1');
    // Line 4 has error + warning → worst is error.
    expect(screen.getByTestId('worst4').textContent).toBe('error');
    expect(screen.getByTestId('worst2').textContent).toBe('info');
    // Line 0 is clean.
    expect(screen.getByTestId('worst0').textContent).toBe('undefined');
  });

  it('reports no diagnostics when empty', () => {
    render(
      <DiagnosticsProvider diagnostics={[]} onRevealLine={() => {}}>
        <Probe />
      </DiagnosticsProvider>
    );
    expect(screen.getByTestId('has').textContent).toBe('false');
    expect(screen.getByTestId('markers').textContent).toBe('');
  });
});
