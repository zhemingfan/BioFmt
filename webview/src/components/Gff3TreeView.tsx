// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { buildGff3Tree, flattenVisibleNodes, Gff3FeatureNode } from '../gff3Tree';
import { navigateToRegion } from '../vscodeApi';

interface Gff3TreeViewProps {
  rows: string[];
}

const ROW_HEIGHT = 26;
const INDENT = 16;
// Safety cap on rendered nodes; large trees are sliced with a visible notice.
const MAX_VISIBLE_NODES = 50000;

// Common GFF3 feature types mapped to VS Code chart colors; others fall back.
const TYPE_COLORS: Record<string, string> = {
  gene: 'var(--vscode-charts-blue, #569cd6)',
  mRNA: 'var(--vscode-charts-green, #4ec9b0)',
  transcript: 'var(--vscode-charts-green, #4ec9b0)',
  exon: 'var(--vscode-charts-orange, #ce9178)',
  CDS: 'var(--vscode-charts-purple, #c586c0)',
  five_prime_UTR: 'var(--vscode-charts-yellow, #dcdcaa)',
  three_prime_UTR: 'var(--vscode-charts-yellow, #dcdcaa)',
};

function typeColor(type: string): string {
  return TYPE_COLORS[type] || 'var(--vscode-descriptionForeground, #999)';
}

function navigateToNode(node: Gff3FeatureNode): void {
  if (!node.seqid || isNaN(node.start) || isNaN(node.end)) return;
  // GFF3 is 1-based inclusive -> 0-based half-open
  navigateToRegion(node.seqid, node.start - 1, node.end);
}

export function Gff3TreeView({ rows }: Gff3TreeViewProps) {
  const roots = useMemo(() => buildGff3Tree(rows), [rows]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [height, setHeight] = useState(600);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setHeight(Math.max(node.getBoundingClientRect().height, 200));
  }, []);

  const visible = useMemo(() => flattenVisibleNodes(roots, collapsed), [roots, collapsed]);
  const capped = visible.length > MAX_VISIBLE_NODES;
  const shown = capped ? visible.slice(0, MAX_VISIBLE_NODES) : visible;

  const toggle = useCallback((line: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    const next = new Set<number>();
    const walk = (n: Gff3FeatureNode) => {
      if (n.children.length > 0) {
        next.add(n.line);
        n.children.forEach(walk);
      }
    };
    roots.forEach(walk);
    setCollapsed(next);
  }, [roots]);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const { node, depth } = shown[index];
      const hasChildren = node.children.length > 0;
      const isCollapsed = collapsed.has(node.line);
      const label = node.name || node.id || `(${node.type})`;
      const coords = `${node.seqid}:${node.start}-${node.end}`;

      return (
        <div
          style={{ ...style, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          className="gff3-tree-row"
        >
          <span style={{ display: 'inline-block', width: depth * INDENT, flexShrink: 0 }} />
          {hasChildren ? (
            <span
              role="button"
              title={isCollapsed ? 'Expand' : 'Collapse'}
              onClick={() => toggle(node.line)}
              style={{ cursor: 'pointer', width: 14, flexShrink: 0, userSelect: 'none', opacity: 0.8 }}
            >
              {isCollapsed ? '▶' : '▼'}
            </span>
          ) : (
            <span style={{ display: 'inline-block', width: 14, flexShrink: 0 }} />
          )}
          <span style={{ color: typeColor(node.type), fontWeight: 600, flexShrink: 0 }}>{node.type}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          {node.seqid && !isNaN(node.start) && (
            <span
              className="nav-link"
              title={`Go to ${coords}`}
              onClick={(e) => {
                e.stopPropagation();
                navigateToNode(node);
              }}
              style={{ marginLeft: 'auto', opacity: 0.75, flexShrink: 0 }}
            >
              {coords}
              {node.strand === '+' || node.strand === '-' ? ` (${node.strand})` : ''}
            </span>
          )}
        </div>
      );
    },
    [shown, collapsed, toggle],
  );

  if (roots.length === 0) {
    return <div className="tip">No GFF3 features with a parent/child hierarchy were found.</div>;
  }

  return (
    <div className="gff3-tree" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        className="filter-bar"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <button onClick={expandAll}>Expand all</button>
        <button onClick={collapseAll}>Collapse all</button>
        <span className="filter-info">
          {roots.length.toLocaleString()} root{roots.length === 1 ? '' : 's'} &middot;{' '}
          {visible.length.toLocaleString()} shown
        </span>
        {capped && (
          <span className="filter-info">
            (capped at first {MAX_VISIBLE_NODES.toLocaleString()})
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <List height={height} itemCount={shown.length} itemSize={ROW_HEIGHT} width="100%">
          {Row}
        </List>
      </div>
    </div>
  );
}
