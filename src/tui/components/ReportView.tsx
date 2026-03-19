import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Agent } from '../../shared/types.js';
import type { ReportBlock } from '../lib/reports.js';
import { formatDuration, formatTime, divider, statusColor, agentStatusIcon, wrapText } from '../lib/format.js';

interface Props {
  agent: Agent;
  reportBlocks: ReportBlock[];
  width: number;
  height: number;
  onClose: () => void;
}

export function ReportView({ agent, reportBlocks, width, height, onClose }: Props) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const contentWidth = width - 6; // border + padding + gutter

  // Build the rendered lines (memoized since report content is static)
  const lines = useMemo(() => {
    const lines: Array<{ text: string; color?: string; bold?: boolean; dim?: boolean }> = [];

    if (reportBlocks.length === 0) {
      lines.push({ text: '', dim: true });
      lines.push({ text: '  No reports submitted yet.', dim: true });
      lines.push({ text: '', dim: true });
      return lines;
    }

    for (let i = 0; i < reportBlocks.length; i++) {
      const report = reportBlocks[i]!;
      const time = formatTime(report.timestamp);

      if (i > 0) {
        lines.push({ text: '' });
        lines.push({ text: `  ${divider(contentWidth - 2, '·')}`, dim: true });
        lines.push({ text: '' });
      }

      // Report header
      const badge = report.type === 'final' ? 'FINAL' : 'UPDATE';
      const badgeColor = report.type === 'final' ? 'cyan' : 'yellow';
      lines.push({
        text: `  ${badge}  ${time}`,
        color: badgeColor,
        bold: report.type === 'final',
      });
      lines.push({ text: '' });

      // Report content — wrapped to fit
      const wrapped = wrapText(report.content.trim(), contentWidth - 4);
      for (const line of wrapped) {
        lines.push({ text: `    ${line}` });
      }
    }

    lines.push({ text: '' });
    return lines;
  }, [reportBlocks, contentWidth]);

  // Scroll bounds
  const viewableHeight = height - 7; // header (4) + footer (2) + border
  const maxScroll = Math.max(0, lines.length - viewableHeight);

  useInput((input, key) => {
    if (key.escape || key.return) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((o) => Math.min(maxScroll, o + 1));
      return;
    }
    // Page up/down with shift or brackets
    if (input === '[' || (key.upArrow && key.shift)) {
      setScrollOffset((o) => Math.max(0, o - Math.floor(viewableHeight / 2)));
      return;
    }
    if (input === ']' || (key.downArrow && key.shift)) {
      setScrollOffset((o) => Math.min(maxScroll, o + Math.floor(viewableHeight / 2)));
      return;
    }
  });

  // Visible slice
  const visible = lines.slice(scrollOffset, scrollOffset + viewableHeight);

  // Scroll position indicator
  const scrollPct = maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;
  const totalReports = agent.reports.length;
  const icon = agentStatusIcon(agent.status);
  const color = statusColor(agent.status);
  const dur = formatDuration(agent.spawnedAt, agent.completedAt);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      {/* Header */}
      <Text bold>
        {' '}
        <Text color={color}>{icon}</Text>
        {' '}
        {agent.id}
        {' '}
        <Text dimColor>·</Text>
        {' '}
        {agent.name !== agent.id ? agent.name : agent.agentType}
      </Text>
      <Text dimColor>
        {'  '}{agent.status} · {dur} · {agent.agentType} · {totalReports} report{totalReports !== 1 ? 's' : ''}
      </Text>
      <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>

      {/* Scrollable content */}
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, i) => (
          <Text
            key={i}
            color={line.color}
            bold={line.bold}
            dimColor={line.dim}
          >
            {line.text}
          </Text>
        ))}
      </Box>

      {/* Footer */}
      <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>
      <Text dimColor>
        {'  '}[esc] back  [↑↓] scroll  [{ }] page
        {'  '}
        <Text>{scrollPct}%</Text>
        {maxScroll > 0 && <Text dimColor> · {lines.length} lines</Text>}
      </Text>
    </Box>
  );
}
