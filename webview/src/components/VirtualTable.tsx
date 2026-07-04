// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useDiagnostics } from '../diagnostics/DiagnosticsContext';
import { RowStatus, RowStatusHeaderSpacer, severityRowClass, STATUS_COL_WIDTH } from './RowStatus';
import { useTableFind } from '../find/useTableFind';
import { FindBar } from './FindBar';
import { useGridKeyboard } from '../keyboard/useGridKeyboard';

// Row type allows string columns plus extra parsed metadata (prefixed with _)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableRow = Record<string, any>;

export interface ColumnDefinition {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  render?: (value: string, row: TableRow, rowIndex: number) => React.ReactNode;
}

export interface VirtualTableProps {
  columns: ColumnDefinition[];
  rows: TableRow[];
  rowHeight?: number;
  headerHeight?: number;
  onRowClick?: (row: TableRow, index: number) => void;
  expandedRow?: number | null;
  renderExpandedContent?: (row: TableRow, index: number) => React.ReactNode;
  onScroll?: (scrollInfo: { scrollOffset: number }) => void;
  className?: string;
  /** Enable search bar for filtering rows by text. Default: true */
  searchable?: boolean;
  /** Enable TSV export button. Default: true */
  exportable?: boolean;
  /**
   * Extract a row's 0-based source line, used to attach diagnostic markers.
   * Defaults to `Number(row._lineNumber) - 1` (the convention most previews use).
   */
  getRowLine?: (row: TableRow) => number | undefined;
}

const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_HEADER_HEIGHT = 36;
const COL_MIN_WIDTH = 60;

function exportRowsAsTsv(columns: ColumnDefinition[], rows: TableRow[]) {
  const header = columns.map(c => c.label).join('\t');
  const lines = rows.map(row =>
    columns.map(c => String(row[c.key] ?? '')).join('\t')
  );
  const content = [header, ...lines].join('\n');
  const blob = new Blob([content], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'export.tsv';
  a.click();
  URL.revokeObjectURL(url);
}

export function VirtualTable({
  columns,
  rows,
  rowHeight = DEFAULT_ROW_HEIGHT,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  onRowClick,
  expandedRow,
  renderExpandedContent,
  onScroll,
  className = '',
  searchable = true,
  exportable = true,
  getRowLine,
}: VirtualTableProps) {
  const [containerHeight, setContainerHeight] = useState(600);
  const [resizeOverrides, setResizeOverrides] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Diagnostic markers: when the extension has forwarded diagnostics for this
  // document, prepend a status column keyed by each row's source line.
  const { hasDiagnostics: showStatus, worstFor, registerScroller } = useDiagnostics();
  const listRef = useRef<List>(null);
  const resolveLine = useCallback(
    (row: TableRow): number | undefined =>
      getRowLine
        ? getRowLine(row)
        : row._lineNumber != null
          ? Number(row._lineNumber) - 1
          : undefined,
    [getRowLine]
  );

  // Measure container
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect();
      setContainerHeight(Math.max(rect.height - headerHeight, 200));
    }
  }, [headerHeight]);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, colKey: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key: colKey, startX: e.clientX, startWidth: currentWidth };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(COL_MIN_WIDTH, startWidth + delta);
      setResizeOverrides(prev => ({ ...prev, [key]: newWidth }));
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Reset overrides when columns change
  useEffect(() => {
    setResizeOverrides({});
  }, [columns]);

  // Calculate column widths
  const columnWidths = useMemo(() => {
    return columns.map(col => {
      const baseWidth = resizeOverrides[col.key] ?? col.width ?? 150;
      return {
        ...col,
        computedWidth: baseWidth,
        computedMinWidth: col.minWidth || COL_MIN_WIDTH,
        computedMaxWidth: resizeOverrides[col.key] ? resizeOverrides[col.key] : (col.maxWidth || 400),
      };
    });
  }, [columns, resizeOverrides]);

  // In-preview find (Cmd+F): highlight + jump, with optional filter-to-matches.
  const getRowText = useCallback(
    (row: TableRow) => columns.map((c) => String(row[c.key] ?? '')).join('\n'),
    [columns]
  );
  const find = useTableFind(rows, getRowText);
  const displayRows = find.displayRows;

  // Scroll to the active match whenever next/prev is pressed.
  useEffect(() => {
    if (find.matchCount > 0) listRef.current?.scrollToItem(find.scrollIndex, 'center');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.scrollTick]);

  // Keyboard navigation: arrow/paging focus with Enter to activate a row.
  const grid = useGridKeyboard({
    rowCount: displayRows.length,
    colCount: columns.length,
    scrollToRow: (r) => listRef.current?.scrollToItem(r, 'smart'),
    onActivate: (r) => onRowClick?.(displayRows[r], r),
  });

  // Register how to scroll this list to a given source line (for error nav).
  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;
  useEffect(() => {
    if (!showStatus) return;
    registerScroller((line: number) => {
      const idx = displayRowsRef.current.findIndex((r) => resolveLine(r) === line);
      if (idx >= 0) listRef.current?.scrollToItem(idx, 'center');
    });
    return () => registerScroller(null);
  }, [showStatus, resolveLine, registerScroller]);

  // Row renderer
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const row = displayRows[index];
    if (!row) return null;

    const isExpanded = expandedRow === index;
    const isActiveMatch = row === find.activeRow;
    const line = showStatus ? resolveLine(row) : undefined;
    const sev = showStatus && line != null ? worstFor(line) : undefined;
    const baseStyle: React.CSSProperties = {
      ...style,
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--vscode-widget-border, #333)',
      cursor: onRowClick ? 'pointer' : 'default',
    };

    return (
      <div
        style={baseStyle}
        className={`virtual-table-row ${isExpanded ? 'expanded' : ''} ${severityRowClass(sev)} ${isActiveMatch ? 'find-active-row' : ''} ${grid.isRowFocused(index) ? 'grid-row-focused' : ''}`}
        onClick={() => { grid.focus(index, 0); onRowClick?.(row, index); }}
      >
        {showStatus && <RowStatus line={line} />}
        {columnWidths.map((col, colIdx) => (
          <div
            key={col.key}
            className={`virtual-table-cell ${grid.isFocused(index, colIdx) ? 'grid-cell-focused' : ''}`}
            style={{
              width: col.computedWidth,
              minWidth: col.computedMinWidth,
              maxWidth: col.computedMaxWidth,
              padding: '0 8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title={row[col.key] || ''}
          >
            {col.render
              ? col.render(row[col.key] || '', row, index)
              : find.highlight(String(row[col.key] ?? ''))}
          </div>
        ))}
      </div>
    );
  }, [displayRows, columnWidths, expandedRow, onRowClick, showStatus, resolveLine, worstFor, find.highlight, find.activeRow, grid.isRowFocused, grid.isFocused, grid.focus]);

  // Calculate total width (add the status column when diagnostics are shown)
  const totalWidth =
    columnWidths.reduce((sum, col) => sum + col.computedWidth, 0) +
    (showStatus ? STATUS_COL_WIDTH : 0);

  return (
    <div
      ref={containerRef}
      className={`virtual-table-container ${className}`}
      style={{ flex: 1, overflow: 'hidden' }}
      tabIndex={0}
      onKeyDown={grid.handleKeyDown}
    >
      {/* Search/Export toolbar */}
      {(searchable || exportable) && (
        <div
          className="virtual-table-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderBottom: '1px solid var(--vscode-widget-border, #333)',
            background: 'var(--vscode-editor-background)',
          }}
        >
          {searchable && (
            find.isOpen ? (
              <FindBar find={find} />
            ) : (
              <button
                type="button"
                className="find-open-btn"
                title="Find in preview (Ctrl/Cmd+F)"
                onClick={find.open}
              >
                Find
              </button>
            )
          )}
          {exportable && (
            <button
              onClick={() => exportRowsAsTsv(columns, displayRows)}
              title="Export visible rows as TSV"
              style={{
                marginLeft: 'auto',
                padding: '3px 10px',
                border: '1px solid var(--vscode-button-border, #3c3c3c)',
                background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
                color: 'var(--vscode-button-secondaryForeground, #ccc)',
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: '0.8em',
              }}
            >
              Export TSV
            </button>
          )}
        </div>
      )}
      {/* Header */}
      <div
        className="virtual-table-header"
        style={{
          display: 'flex',
          height: headerHeight,
          alignItems: 'center',
          borderBottom: '2px solid var(--vscode-widget-border, #333)',
          background: 'var(--vscode-editor-background)',
          fontWeight: 600,
          position: 'sticky',
          top: 0,
          zIndex: 1,
          minWidth: totalWidth,
        }}
      >
        {showStatus && <RowStatusHeaderSpacer />}
        {columnWidths.map(col => (
          <div
            key={col.key}
            className="virtual-table-header-cell"
            style={{
              width: col.computedWidth,
              minWidth: col.computedMinWidth,
              maxWidth: col.computedMaxWidth,
              padding: '0 8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              position: 'relative',
            }}
            title={col.label}
          >
            {col.label}
            <div
              className="virtual-table-resize-handle"
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 5,
                cursor: 'col-resize',
                userSelect: 'none',
              }}
              onMouseDown={(e) => handleResizeStart(e, col.key, col.computedWidth)}
            />
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: totalWidth }}>
          <List
            ref={listRef}
            height={containerHeight}
            itemCount={displayRows.length}
            itemSize={rowHeight}
            width="100%"
            onScroll={onScroll}
          >
            {Row}
          </List>
        </div>
      </div>

      {/* Expanded row content */}
      {expandedRow !== null && expandedRow !== undefined && renderExpandedContent && displayRows[expandedRow] && (
        <div className="virtual-table-expanded-content">
          {renderExpandedContent(displayRows[expandedRow], expandedRow)}
        </div>
      )}
    </div>
  );
}
