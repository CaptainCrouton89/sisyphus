import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync } from 'node:fs';
import type { Agent, AgentReport } from '../../shared/types.js';
import { formatDuration, formatTime, divider, statusColor, agentStatusIcon } from '../lib/format.js';

interface Props {
  agent: Agent;
  width: number;
  height: number;
  onClose: () => void;
}

interface ReportBlock {
  type: 'update' | 'final';
  timestamp: string;
  content: string;
  summary: string;
}

function loadReportContent(report: AgentReport): string {
  try {
    return readFileSync(report.filePath, 'utf-8');
  } catch {
    return report.summary;
  }
}

function wrapText(text: string, width: number): string[] {
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    // Word wrap
    let remaining = rawLine;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(' ', width);
      if (breakAt <= 0) breakAt = width;
      result.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}

export function ReportView({ agent, width, height, onClose }: Props) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const contentWidth = width - 6; // border + padding + gutter

  // Build the rendered lines (memoized since report content is static)
  const { lines, reportOffsets } = useMemo(() => {
    const lines: Array<{ text: string; color?: string; bold?: boolean; dim?: boolean }> = [];
    const reportOffsets: number[] = [];

    // Reverse chronological
    const reports: ReportBlock[] = [...agent.reports]
      .reverse()
      .map((r) => ({
        type: r.type,
        timestamp: r.timestamp,
        content: loadReportContent(r),
        summary: r.summary,
      }));

    if (reports.length === 0) {
      lines.push({ text: '', dim: true });
      lines.push({ text: '  No reports submitted yet.', dim: true });
      lines.push({ text: '', dim: true });
      return { lines, reportOffsets };
    }

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i]!;
      const time = formatTime(report.timestamp);

      if (i > 0) {
        lines.push({ text: '' });
        lines.push({ text: `  ${divider(contentWidth - 2, '·')}`, dim: true });
        lines.push({ text: '' });
      }

      reportOffsets.push(lines.length);

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
    return { lines, reportOffsets };
  }, [agent.reports, contentWidth]);

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
            key={scrollOffset + i}
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
