// SPDX-License-Identifier: GPL-3.0-or-later

import { render, screen, fireEvent } from '@testing-library/react';
import { useGridKeyboard, type UseGridKeyboardOptions } from './useGridKeyboard';

type ProbeProps = Partial<UseGridKeyboardOptions>;

function Probe(props: ProbeProps) {
  const grid = useGridKeyboard({
    rowCount: props.rowCount ?? 5,
    colCount: props.colCount ?? 3,
    scrollToRow: props.scrollToRow,
    onActivate: props.onActivate,
    onEscape: props.onEscape,
  });
  return (
    <div data-testid="grid" tabIndex={0} onKeyDown={grid.handleKeyDown}>
      <span data-testid="focus">
        {grid.focused ? `${grid.focused.row},${grid.focused.col}` : 'none'}
      </span>
      <input data-testid="inp" />
    </div>
  );
}

function key(k: string, init: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(screen.getByTestId('grid'), { key: k, ...init });
}

const focus = () => screen.getByTestId('focus').textContent;

describe('useGridKeyboard', () => {
  it('starts unfocused and enters at 0,0 on first ArrowDown', () => {
    render(<Probe />);
    expect(focus()).toBe('none');
    key('ArrowDown');
    expect(focus()).toBe('0,0');
  });

  it('moves down/right and clamps at edges', () => {
    render(<Probe rowCount={3} colCount={2} />);
    key('ArrowDown'); // 0,0
    key('ArrowDown'); // 1,0
    key('ArrowRight'); // 1,1
    expect(focus()).toBe('1,1');
    key('ArrowRight'); // clamp col
    expect(focus()).toBe('1,1');
    key('ArrowUp');
    key('ArrowUp');
    key('ArrowUp'); // clamp row at 0
    expect(focus()).toBe('0,1');
  });

  it('supports Home/End and Ctrl+Home/End', () => {
    render(<Probe rowCount={10} colCount={4} />);
    key('ArrowDown');
    key('End');
    expect(focus()).toBe('0,3'); // last column
    key('Home');
    expect(focus()).toBe('0,0'); // first column
    key('End', { ctrlKey: true });
    expect(focus()).toBe('9,0'); // last row
    key('Home', { ctrlKey: true });
    expect(focus()).toBe('0,0'); // first row
  });

  it('pages by the configured size', () => {
    render(<Probe rowCount={100} colCount={1} pageSize={10} />);
    key('ArrowDown'); // 0,0
    key('PageDown');
    expect(focus()).toBe('10,0');
    key('PageUp');
    expect(focus()).toBe('0,0');
  });

  it('calls scrollToRow with the focused row on move', () => {
    const scrollToRow = jest.fn();
    render(<Probe scrollToRow={scrollToRow} />);
    key('ArrowDown');
    key('ArrowDown');
    expect(scrollToRow).toHaveBeenLastCalledWith(1);
  });

  it('fires onActivate for the focused row on Enter', () => {
    const onActivate = jest.fn();
    render(<Probe onActivate={onActivate} />);
    key('ArrowDown');
    key('ArrowDown'); // row 1
    key('Enter');
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it('Escape clears focus when onEscape does not consume it', () => {
    render(<Probe />);
    key('ArrowDown');
    expect(focus()).toBe('0,0');
    key('Escape');
    expect(focus()).toBe('none');
  });

  it('Escape keeps focus when onEscape returns true (consumed)', () => {
    const onEscape = jest.fn(() => true);
    render(<Probe onEscape={onEscape} />);
    key('ArrowDown');
    key('Escape');
    expect(onEscape).toHaveBeenCalled();
    expect(focus()).toBe('0,0');
  });

  it('ignores navigation keys while an input is focused', () => {
    render(<Probe />);
    fireEvent.keyDown(screen.getByTestId('inp'), { key: 'ArrowDown' });
    expect(focus()).toBe('none');
  });
});
