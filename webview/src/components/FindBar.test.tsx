// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen, fireEvent } from '@testing-library/react';
import { FindBar } from './FindBar';
import type { TableFind } from '../find/useTableFind';

function mockFind(over: Partial<TableFind<unknown>> = {}): TableFind<unknown> {
  return {
    isOpen: true,
    open: jest.fn(),
    close: jest.fn(),
    query: 'chr',
    setQuery: jest.fn(),
    caseSensitive: false,
    toggleCase: jest.fn(),
    filterToMatches: false,
    toggleFilter: jest.fn(),
    matchCount: 3,
    activeOrdinal: 1,
    next: jest.fn(),
    prev: jest.fn(),
    displayRows: [],
    activeRow: undefined,
    scrollIndex: 0,
    scrollTick: 0,
    inputRef: { current: null },
    highlight: (t: string) => t,
    ...over,
  };
}

describe('FindBar', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<FindBar find={mockFind({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the active match position', () => {
    render(<FindBar find={mockFind()} />);
    expect(screen.getByText('1 / 3')).toBeTruthy();
  });

  it('shows "No results" for a query with no matches', () => {
    render(<FindBar find={mockFind({ matchCount: 0, activeOrdinal: 0 })} />);
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('wires the buttons to their handlers', () => {
    const find = mockFind();
    render(<FindBar find={find} />);
    fireEvent.click(screen.getByLabelText('Next match'));
    expect(find.next).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Previous match'));
    expect(find.prev).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Close find'));
    expect(find.close).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Match case'));
    expect(find.toggleCase).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Filter to matching rows'));
    expect(find.toggleFilter).toHaveBeenCalled();
  });

  it('navigates on Enter and Shift+Enter from the input', () => {
    const find = mockFind();
    render(<FindBar find={find} />);
    const input = screen.getByLabelText('Find in preview');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(find.next).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(find.prev).toHaveBeenCalled();
  });

  it('disables navigation when there are no matches', () => {
    render(<FindBar find={mockFind({ matchCount: 0, activeOrdinal: 0 })} />);
    expect((screen.getByLabelText('Next match') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Previous match') as HTMLButtonElement).disabled).toBe(true);
  });
});
