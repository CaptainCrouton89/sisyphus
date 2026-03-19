import React, { useMemo } from 'react';
import type { Agent } from '../../shared/types.js';
import type { ReportBlock } from '../lib/reports.js';
import { ScrollablePanel } from './ScrollablePanel.js';
import {
  formatDuration,
  formatTime,
  divider,
  statusColor,
  agentStatusIcon,
  wrapText,
  seg,
  singleLine,
  agentDisplayName,
  reportBadge,
  type DetailLine,
} from '../lib/format.js';

interface Props {
  agent: Agent;
  reportBlocks: ReportBlock[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
}

function buildLines(agent: Agent, reportBlocks: ReportBlock[], width: number): DetailLine[] {
  const lines: DetailLine[] = [];
  const contentWidth = width - 6; // border + padding + gutter
  const dur = formatDuration(agent.spawnedAt, agent.completedAt);
  const icon = agentStatusIcon(agent.status);
  const color = statusColor(agent.status);
  const totalReports = agent.reports.length;
  const nameLabel = agentDisplayName(agent);

  // Header
  lines.push([
    seg(' '),
    seg(icon, { color }),
    seg(' '),
    seg(agent.id, { bold: true }),
    seg(' ', { dim: true }),
    seg('·', { dim: true }),
    seg(' '),
    seg(nameLabel, { bold: true }),
  ]);

  // Status line
  lines.push(singleLine(
    `  ${agent.status} · ${dur} · ${agent.agentType} · ${totalReports} report${totalReports !== 1 ? 's' : ''}`,
    { dim: true },
  ));

  // Divider
  lines.push(singleLine('  ' + divider(contentWidth - 2), { dim: true }));

  if (reportBlocks.length === 0) {
    lines.push(singleLine(''));
    lines.push(singleLine('  No reports submitted yet.', { dim: true }));
    lines.push(singleLine(''));
    return lines;
  }

  for (let i = 0; i < reportBlocks.length; i++) {
    const report = reportBlocks[i]!;
    const time = formatTime(report.timestamp);

    if (i > 0) {
      lines.push(singleLine(''));
      lines.push(singleLine(`  ${divider(contentWidth - 2, '·')}`, { dim: true }));
      lines.push(singleLine(''));
    }

    // Report header badge
    const { label: badge, color: badgeColor } = reportBadge(report.type);
    lines.push([
      seg(`  ${badge}`, { color: badgeColor, bold: report.type === 'final' }),
      seg(`  ${time}`, { color: badgeColor }),
    ]);

    lines.push(singleLine(''));

    // Report content — wrapped to fit
    const wrapped = wrapText(report.content.trim(), contentWidth - 4);
    for (const line of wrapped) {
      lines.push(singleLine(`    ${line}`));
    }
  }

  lines.push(singleLine(''));
  return lines;
}

export function ReportView({ agent, reportBlocks, width, height, scrollOffset = 0, focused = false }: Props) {
  const lines = useMemo(
    () => buildLines(agent, reportBlocks, width),
    [agent, reportBlocks, width],
  );

  return (
    <ScrollablePanel
      lines={lines}
      width={width}
      height={height}
      scrollOffset={scrollOffset}
      focused={focused}
      borderColor="cyan"
    />
  );
}
