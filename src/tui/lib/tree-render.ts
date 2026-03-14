import type { TreeNode } from '../types/tree.js';

/**
 * Render box-drawing prefix for a tree node.
 * Produces connectors like: │ ├─ ▸  or  └─ ▼
 */
export function renderTreePrefix(node: TreeNode, nodes: TreeNode[], index: number): string {
  if (node.depth === 0) {
    return node.expandable ? (node.expanded ? '▼ ' : '▸ ') : '  ';
  }

  const parts: string[] = [];

  // For each ancestor depth level (1..depth-1), draw │ or space
  for (let d = 1; d < node.depth; d++) {
    parts.push(isAncestorLastSibling(nodes, index, d) ? '  ' : '│ ');
  }

  // Connector for this node
  parts.push(isLastSibling(nodes, index) ? '└─' : '├─');

  // Expand indicator
  if (node.expandable) {
    parts.push(node.expanded ? '▼ ' : '▸ ');
  } else {
    parts.push(' ');
  }

  return parts.join('');
}

/** Check if the node at `index` is the last among its siblings (same depth, same parent) */
function isLastSibling(nodes: TreeNode[], index: number): boolean {
  const depth = nodes[index]!.depth;
  for (let i = index + 1; i < nodes.length; i++) {
    if (nodes[i]!.depth === depth) return false;
    if (nodes[i]!.depth < depth) return true;
  }
  return true;
}

/** Check if the ancestor at `depth` for the node at `index` is the last among its siblings */
function isAncestorLastSibling(nodes: TreeNode[], index: number, depth: number): boolean {
  // Find the ancestor at this depth by scanning backward
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i]!.depth === depth) {
      return isLastSibling(nodes, i);
    }
    if (nodes[i]!.depth < depth) return true;
  }
  return true;
}
