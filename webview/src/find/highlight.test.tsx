// SPDX-License-Identifier: GPL-3.0-or-later

import { render } from '@testing-library/react';
import { highlightMatches } from './highlight';

function renderNode(node: React.ReactNode): HTMLElement {
  return render(<div>{node}</div>).container;
}

describe('highlightMatches', () => {
  it('returns the original string when the query is empty', () => {
    expect(highlightMatches('hello', '', false)).toBe('hello');
  });

  it('returns the original string when there is no match', () => {
    expect(highlightMatches('hello', 'xyz', false)).toBe('hello');
  });

  it('wraps a case-insensitive match in a mark and preserves the full text', () => {
    const c = renderNode(highlightMatches('chr1 100', 'CHR', false));
    const mark = c.querySelector('mark.find-match');
    expect(mark?.textContent).toBe('chr');
    expect(c.textContent).toBe('chr1 100');
  });

  it('respects case sensitivity', () => {
    expect(highlightMatches('CHR1', 'chr', true)).toBe('CHR1');
    const c = renderNode(highlightMatches('CHR1', 'CHR', true));
    expect(c.querySelector('mark')?.textContent).toBe('CHR');
  });

  it('wraps every occurrence', () => {
    const c = renderNode(highlightMatches('aXaXa', 'a', false));
    expect(c.querySelectorAll('mark').length).toBe(3);
    expect(c.textContent).toBe('aXaXa');
  });
});
