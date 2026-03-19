import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode } from '../types/tree.js';
import { renderTreePrefix } from '../lib/tree-render.js';
import {
  statusColor,
  statusIndicator,
  agentStatusIcon,
  truncate,
  formatDuration,
  formatTime,
  formatTimeAgo,
  durationColor,
} from '../lib/format.js';

interface Props {
  nodes: TreeNode[];
  cursorIndex: number;
  width: number;
  height: number;
  focused: boolean;
}

export function SessionTree({ nodes, cursorIndex, width, height, focused }: Props) {
  if (nodes.length === 0) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="round"
        borderColor={focused ? 'yellow' : 'gray'}
        paddingX={1}
      >
        <Text bold> Sessions </Text>
        <Text dimColor>No sessions found.</Text>
        <Text dimColor>Press [n] to create one.</Text>
        <Text dimColor>Press [?] for all keybindings.</Text>
      </Box>
    );
  }

  const maxVisible = Math.max(1, height - 4);
  const halfVisible = Math.floor(maxVisible / 2);
  const scrollOffset = Math.max(
    0,
    Math.min(cursorIndex - halfVisible, nodes.length - maxVisible),
  );
  const visible = nodes.slice(scrollOffset, scrollOffset + maxVisible);
  const contentWidth = width - 4; // border + padding

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'yellow' : 'gray'}
      paddingX={1}
    >
      {scrollOffset > 0 && <Text dimColor>  ↑ {scrollOffset} more</Text>}

      {visible.map((node, i) => {
        const realIdx = scrollOffset + i;
        const isSelected = realIdx === cursorIndex;
        const prefix = renderTreePrefix(node, nodes, realIdx);
        const { icon, label, meta, color, dim, metaColor } = renderNodeContent(
          node,
          contentWidth - prefix.length,
        );

        return (
          <Text key={node.id} inverse={isSelected && focused} bold={isSelected}>
            {prefix}
            <Text color={color} dimColor={dim}>
              {icon}
            </Text>
            {icon ? ' ' : ''}
            <Text dimColor={dim}>{label}</Text>
            {meta ? <Text color={metaColor} dimColor={!metaColor}> {meta}</Text> : null}
          </Text>
        );
      })}

      {scrollOffset + maxVisible < nodes.length && (
        <Text dimColor>  ↓ {nodes.length - scrollOffset - maxVisible} more</Text>
      )}
    </Box>
  );
}

function renderNodeContent(
  node: TreeNode,
  maxWidth: number,
): { icon: string; label: string; meta: string; color: string; dim: boolean; metaColor?: string } {
  switch (node.type) {
    case 'session': {
      const icon = statusIndicator(node.status);
      const color = statusColor(node.status);
      const dim = node.status === 'completed';
      const cyclePart = node.cycleCount > 0 ? `C${node.cycleCount}` : '';
      const dur = formatDuration(node.createdAt, node.completedAt);
      const agopart = node.status === 'completed' && node.completedAt ? formatTimeAgo(node.completedAt) : '';
      const meta = [cyclePart, dur, agopart].filter(Boolean).join(' ');
      const maxTask = Math.max(8, maxWidth - meta.length - 4);
      return { icon, label: truncate(node.task, maxTask), meta, color, dim };
    }
    case 'cycle': {
      const isRunning = !node.completedAt;
      const dur = node.completedAt
        ? formatDuration(node.timestamp, node.completedAt)
        : 'running';
      const agents = `${node.agentCount} agent${node.agentCount !== 1 ? 's' : ''}`;
      const modeShort = node.mode === 'implementation' ? 'impl' : node.mode === 'planning' ? 'plan' : node.mode;
      const mode = modeShort ? ` · ${modeShort}` : '';
      return {
        icon: isRunning ? '●' : '○',
        label: `C${node.cycleNumber}`,
        meta: `${dur} · ${agents}${mode}`,
        color: isRunning ? 'green' : 'gray',
        dim: !isRunning,
      };
    }
    case 'agent': {
      const icon = agentStatusIcon(node.status);
      const color = statusColor(node.status);
      const dur = formatDuration(node.spawnedAt, node.completedAt);
      const durClr = durationColor(node.spawnedAt, node.completedAt) || undefined;
      const dim = node.status === 'completed';
      const displayName = node.name !== node.agentId ? node.name : node.agentType;
      const maxLabel = Math.max(8, maxWidth - dur.length - 4);
      return {
        icon,
        label: truncate(displayName, maxLabel),
        meta: dur,
        color,
        dim,
        metaColor: durClr,
      };
    }
    case 'report': {
      const badge = node.reportType === 'final' ? 'FINAL' : 'UPDATE';
      const time = formatTime(node.timestamp);
      return {
        icon: node.reportType === 'final' ? '◆' : '◇',
        label: `${badge} ${time}`,
        meta: '',
        color: node.reportType === 'final' ? 'cyan' : 'yellow',
        dim: false,
      };
    }
    case 'messages':
      return {
        icon: '✉',
        label: `Messages (${node.count})`,
        meta: '',
        color: 'yellow',
        dim: false,
      };
    case 'message': {
      const maxLabel = Math.max(8, maxWidth - 8);
      return {
        icon: '·',
        label: truncate(`${node.source}: ${node.summary}`, maxLabel),
        meta: formatTime(node.timestamp),
        color: 'gray',
        dim: true,
      };
    }
    case 'context':
      return {
        icon: '⊞',
        label: `Context (${node.fileCount})`,
        meta: '',
        color: 'white',
        dim: node.fileCount === 0,
      };
    case 'context-file': {
      const maxLabel = Math.max(8, maxWidth - 4);
      return {
        icon: '·',
        label: truncate(node.label, maxLabel),
        meta: '',
        color: 'gray',
        dim: false,
      };
    }
  }
}
