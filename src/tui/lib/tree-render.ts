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

/**
 * Pre-compute prefix strings for all tree nodes in O(n).
 * Avoids per-node O(n) scans during rendering.
 */
export function precomputePrefixes(nodes: TreeNode[]): void {
  const len = nodes.length;
  if (len === 0) return;

  // Step 1: Compute isLastSibling for each node in a single backward pass.
  // A node is "last sibling" if no later node at the same depth appears before
  // a node at a shallower depth (or end of array).
  const isLast = new Array<boolean>(len);
  // Track the last-seen index for each depth level
  const lastSeenAtDepth = new Map<number, number>();

  for (let i = len - 1; i >= 0; i--) {
    const depth = nodes[i]!.depth;
    // This node is last sibling if no node at same depth was seen after it
    // before a shallower node
    isLast[i] = !lastSeenAtDepth.has(depth);
    lastSeenAtDepth.set(depth, i);
    // Clear deeper depths (they belong to a different parent scope)
    for (const [d] of lastSeenAtDepth) {
      if (d > depth) lastSeenAtDepth.delete(d);
    }
  }

  // Step 2: Build prefix strings using pre-computed isLast data.
  // For ancestor connector lines, we need to know if the ancestor at each depth
  // is a last sibling. We maintain a stack of isLast values per depth.
  const ancestorIsLast: boolean[] = [];

  for (let i = 0; i < len; i++) {
    const node = nodes[i]!;

    if (node.depth === 0) {
      node.prefix = node.expandable ? (node.expanded ? '▼ ' : '▸ ') : '  ';
      ancestorIsLast[0] = isLast[i]!;
      continue;
    }

    // Update ancestor tracking
    ancestorIsLast[node.depth] = isLast[i]!;

    const parts: string[] = [];

    // Ancestor connectors (depth 1 to depth-1)
    for (let d = 1; d < node.depth; d++) {
      parts.push(ancestorIsLast[d] ? '  ' : '│ ');
    }

    // This node's connector
    parts.push(isLast[i] ? '└─' : '├─');

    // Expand indicator
    if (node.expandable) {
      parts.push(node.expanded ? '▼ ' : '▸ ');
    } else {
      parts.push(' ');
    }

    node.prefix = parts.join('');
  }
}
