// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowStatus } from './RowStatus';
import { DiagnosticsProvider } from '../diagnostics/DiagnosticsContext';
import type { PreviewDiagnostic } from '../../../src/shared/diagnostics';

const diags: PreviewDiagnostic[] = [
  { line: 5, endLine: 5, severity: 'error', message: 'bad thing', code: 'VCF-S005' },
];

function wrap(ui: React.ReactElement, onReveal: (line: number) => void = () => {}) {
  return render(
    <DiagnosticsProvider diagnostics={diags} onRevealLine={onReveal}>
      {ui}
    </DiagnosticsProvider>
  );
}

describe('RowStatus', () => {
  it('renders a clickable marker with a code+message tooltip for a diagnostic line', () => {
    wrap(<RowStatus line={5} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('title')).toContain('[VCF-S005] bad thing');
    expect(btn.className).toContain('row-status-error');
  });

  it('calls revealLine with the row line on click', () => {
    const onReveal = jest.fn();
    wrap(<RowStatus line={5} />, onReveal);
    fireEvent.click(screen.getByRole('button'));
    expect(onReveal).toHaveBeenCalledWith(5);
  });

  it('renders an empty placeholder for a clean line', () => {
    const { container } = wrap(<RowStatus line={99} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('.row-status')).not.toBeNull();
  });

  it('renders an empty placeholder when the line is undefined', () => {
    const { container } = wrap(<RowStatus line={undefined} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('.row-status')).not.toBeNull();
  });
});
