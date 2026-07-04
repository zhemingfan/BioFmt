// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosticNav } from './DiagnosticNav';
import { DiagnosticsProvider } from '../diagnostics/DiagnosticsContext';
import type { PreviewDiagnostic } from '../../../src/shared/diagnostics';

const diags: PreviewDiagnostic[] = [
  { line: 2, endLine: 2, severity: 'error', message: 'e1' },
  { line: 9, endLine: 9, severity: 'warning', message: 'w1' },
];

describe('DiagnosticNav', () => {
  it('renders nothing when there are no diagnostics', () => {
    const { container } = render(
      <DiagnosticsProvider diagnostics={[]} onRevealLine={() => {}}>
        <DiagnosticNav />
      </DiagnosticsProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows error/warning counts labelled "in view"', () => {
    const { container } = render(
      <DiagnosticsProvider diagnostics={diags} onRevealLine={() => {}}>
        <DiagnosticNav />
      </DiagnosticsProvider>
    );
    expect(container.querySelector('.dn-error')?.textContent).toMatch(/1 error/);
    expect(container.querySelector('.dn-warning')?.textContent).toMatch(/1 warning/);
    // getByText throws if the node is absent, so calling it is the assertion.
    expect(screen.getByText('in view')).toBeTruthy();
  });

  it('cycles through markers on Next, wrapping at the end', () => {
    const onReveal = jest.fn();
    render(
      <DiagnosticsProvider diagnostics={diags} onRevealLine={onReveal}>
        <DiagnosticNav />
      </DiagnosticsProvider>
    );
    const next = screen.getByLabelText('Next error');
    fireEvent.click(next);
    expect(onReveal).toHaveBeenLastCalledWith(2);
    fireEvent.click(next);
    expect(onReveal).toHaveBeenLastCalledWith(9);
    fireEvent.click(next); // wraps back to the first
    expect(onReveal).toHaveBeenLastCalledWith(2);
  });

  it('goes to the last marker on Previous from the start', () => {
    const onReveal = jest.fn();
    render(
      <DiagnosticsProvider diagnostics={diags} onRevealLine={onReveal}>
        <DiagnosticNav />
      </DiagnosticsProvider>
    );
    fireEvent.click(screen.getByLabelText('Previous error'));
    expect(onReveal).toHaveBeenLastCalledWith(9);
  });
});
