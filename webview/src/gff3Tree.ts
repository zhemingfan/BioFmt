// SPDX-License-Identifier: GPL-3.0-or-later

// Builds a collapsible gene -> mRNA -> exon -> CDS hierarchy from GFF3 feature
// lines, using the Parent= attribute graph. Pure functions, no DOM — unit-tested
// in gff3Tree.test.ts and consumed by the Gff3TreeView component.

export interface Gff3FeatureNode {
  /** 0-based index of the feature line within the rows array (stable node key). */
  line: number;
  id?: string;
  name?: string;
  type: string;
  seqid: string;
  start: number;
  end: number;
  strand: string;
  parents: string[];
  children: Gff3FeatureNode[];
}

export interface FlatNode {
  node: Gff3FeatureNode;
  depth: number;
}

// Minimal GFF3 column-9 split: tag -> raw value, first occurrence wins.
function parseGff3Attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || raw === '.') return out;
  const normalized = raw.endsWith(';') ? raw.slice(0, -1) : raw;
  for (const part of normalized.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (!(key in out)) out[key] = part.slice(eq + 1);
  }
  return out;
}

/**
 * Parse GFF3 rows into a forest. Each feature line becomes a node; a node is
 * attached under the first Parent= value that resolves to a feature ID declared
 * in the file. Features with no Parent (or only unresolvable Parents) are roots.
 * Parent cycles are broken (the would-be child stays a root) so the result is
 * always a finite forest.
 */
export function buildGff3Tree(rows: string[]): Gff3FeatureNode[] {
  const nodes: Gff3FeatureNode[] = [];

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    if (line.startsWith('##FASTA')) break;
    if (!line || line.startsWith('#') || line.startsWith('>')) continue;

    const cols = line.split('\t');
    if (cols.length < 9) continue;

    const attrs = parseGff3Attrs(cols[8]);
    nodes.push({
      line: i,
      id: attrs.ID,
      name: attrs.Name,
      type: cols[2],
      seqid: cols[0],
      start: parseInt(cols[3], 10),
      end: parseInt(cols[4], 10),
      strand: cols[6],
      parents: attrs.Parent ? attrs.Parent.split(',') : [],
      children: [],
    });
  }

  const idToFirst = new Map<string, Gff3FeatureNode>();
  for (const node of nodes) {
    if (node.id && !idToFirst.has(node.id)) idToFirst.set(node.id, node);
  }

  const parentOf = new Map<Gff3FeatureNode, Gff3FeatureNode>();
  const isAncestor = (ancestor: Gff3FeatureNode, node: Gff3FeatureNode): boolean => {
    let cur: Gff3FeatureNode | undefined = node;
    while (cur) {
      if (cur === ancestor) return true;
      cur = parentOf.get(cur);
    }
    return false;
  };

  const roots: Gff3FeatureNode[] = [];
  for (const node of nodes) {
    let parent: Gff3FeatureNode | null = null;
    for (const pid of node.parents) {
      const candidate = idToFirst.get(pid);
      // Skip self-reference and any attachment that would close a cycle.
      if (candidate && candidate !== node && !isAncestor(node, candidate)) {
        parent = candidate;
        break;
      }
    }
    if (parent) {
      parent.children.push(node);
      parentOf.set(node, parent);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Depth-first flatten of the forest into a render list, skipping the children of
 * collapsed nodes. `collapsed` holds the `line` of each collapsed node. A visited
 * set guarantees termination even if the input forest somehow contains a cycle.
 */
export function flattenVisibleNodes(
  roots: Gff3FeatureNode[],
  collapsed: Set<number>,
): FlatNode[] {
  const out: FlatNode[] = [];
  const visited = new Set<Gff3FeatureNode>();

  const walk = (node: Gff3FeatureNode, depth: number): void => {
    if (visited.has(node)) return;
    visited.add(node);
    out.push({ node, depth });
    if (!collapsed.has(node.line)) {
      for (const child of node.children) walk(child, depth + 1);
    }
  };

  for (const root of roots) walk(root, 0);
  return out;
}
