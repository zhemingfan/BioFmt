// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen, act, fireEvent } from '@testing-library/react';
import { useTableFind } from './useTableFind';

const rows = ['chr1 100 A', 'chr2 200 C', 'chr1 300 G'];
const getText = (r: string) => r;

function Probe() {
  const find = useTableFind(rows, getText);
  return (
    <div>
      <input aria-label="q" onChange={(e) => find.setQuery(e.target.value)} />
      <button aria-label="next" onClick={find.next} />
      <button aria-label="prev" onClick={find.prev} />
      <button aria-label="filter" onClick={find.toggleFilter} />
      <span data-testid="count">{find.matchCount}</span>
      <span data-testid="ord">{find.activeOrdinal}</span>
      <span data-testid="display">{find.displayRows.length}</span>
      <span data-testid="active">{find.activeRow ?? 'none'}</span>
    </div>
  );
}

describe('useTableFind', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function type(value: string) {
    fireEvent.change(screen.getByLabelText('q'), { target: { value } });
    act(() => {
      jest.advanceTimersByTime(150); // flush the debounce
    });
  }

  it('counts matching rows for a debounced query', () => {
    render(<Probe />);
    type('chr1');
    expect(screen.getByTestId('count').textContent).toBe('2');
    // Not filtered: all rows still render.
    expect(screen.getByTestId('display').textContent).toBe('3');
    // First match is active.
    expect(screen.getByTestId('ord').textContent).toBe('1');
    expect(screen.getByTestId('active').textContent).toBe('chr1 100 A');
  });

  it('cycles the active match with next/prev (wrapping)', () => {
    render(<Probe />);
    type('chr1');
    fireEvent.click(screen.getByLabelText('next'));
    expect(screen.getByTestId('ord').textContent).toBe('2');
    expect(screen.getByTestId('active').textContent).toBe('chr1 300 G');
    fireEvent.click(screen.getByLabelText('next')); // wraps to first
    expect(screen.getByTestId('ord').textContent).toBe('1');
    fireEvent.click(screen.getByLabelText('prev')); // wraps to last
    expect(screen.getByTestId('ord').textContent).toBe('2');
  });

  it('filters the rendered rows to matches when toggled', () => {
    render(<Probe />);
    type('chr1');
    expect(screen.getByTestId('display').textContent).toBe('3');
    fireEvent.click(screen.getByLabelText('filter'));
    expect(screen.getByTestId('display').textContent).toBe('2');
  });

  it('reports zero matches and no active row for a miss', () => {
    render(<Probe />);
    type('zzz');
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('ord').textContent).toBe('0');
    expect(screen.getByTestId('active').textContent).toBe('none');
  });
});
