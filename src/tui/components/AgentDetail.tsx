import React, { useMemo } from 'react';
import type { Agent } from '../../shared/types.js';
import type { ReportBlock } from '../lib/reports.js';
import { ScrollablePanel } from './ScrollablePanel.js';
import {
  formatDuration,
  formatTime,
  statusColor,
  agentStatusIcon,
  wrapText,
  cleanMarkdown,
  seg,
  singleLine,
  type DetailLine,
} from '../lib/format.js';

interface Props {
  agent: Agent;
  reportBlocks?: ReportBlock[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
}

function buildLines(agent: Agent, reportBlocks: ReportBlock[] | undefined, width: number): DetailLine[] {
  const lines: DetailLine[] = [];
  const contentWidth = width - 4;
  const dur = formatDuration(agent.spawnedAt, agent.completedAt);
  const icon = agentStatusIcon(agent.status);
  const color = statusColor(agent.status);
  const nameLabel = agent.name !== agent.id ? agent.name : agent.agentType;
  const maxMergeLines = 3;

  // Header
  lines.push([
    seg(' '),
    seg(icon, { color }),
    seg(` ${agent.id} · ${nameLabel}`, { bold: true }),
  ]);

  // Status line
  const mergeSegs: ReturnType<typeof seg>[] = [];
  if (agent.mergeStatus) {
    mergeSegs.push(seg(' · ', { dim: true }));
    switch (agent.mergeStatus) {
      case 'merged':
        mergeSegs.push(seg('⊕ merged', { color: 'green' }));
        break;
      case 'pending':
        mergeSegs.push(seg('◌ pending', { color: 'yellow' }));
        break;
      case 'no-changes':
        mergeSegs.push(seg('∅ no changes', { color: 'gray' }));
        break;
      case 'conflict':
        mergeSegs.push(seg('⚠ conflict', { color: 'red' }));
        break;
      default:
        mergeSegs.push(seg(agent.mergeStatus, { dim: true }));
    }
  }
  lines.push([
    seg('  '),
    seg(agent.status, { color }),
    seg(` · ${dur} · ${agent.agentType}`, { dim: true }),
    ...mergeSegs,
  ]);

  // Alerts
  if (agent.killedReason) {
    lines.push(singleLine(`  ⚠ ${agent.killedReason}`, { color: 'red' }));
  }

  if (agent.mergeStatus === 'conflict' && agent.mergeDetails) {
    for (const ml of wrapText(agent.mergeDetails, contentWidth - 6).slice(0, maxMergeLines)) {
      lines.push(singleLine(`  ⚠ ${ml}`, { color: 'red' }));
    }
  }

  if (agent.mergeStatus === 'conflict') {
    lines.push(singleLine('  resolve conflicts in worktree dir, then restart', { color: 'red', dim: true }));
  }

  // Instruction
  lines.push(singleLine(' '));
  lines.push(singleLine('  ▎ ▷ INSTRUCTION', { color: 'white', bold: true }));
  for (const wl of wrapText(agent.instruction, contentWidth - 6)) {
    lines.push(singleLine(`    ${wl}`, { dim: true }));
  }

  // Reports
  if (agent.reports.length > 0) {
    const hasResolved = reportBlocks && reportBlocks.length > 0;
    lines.push(singleLine(' '));
    lines.push([seg(`  ▎ ◇ REPORTS (${agent.reports.length})`, { color: 'cyan', bold: true })]);

    if (hasResolved) {
      for (let i = 0; i < reportBlocks.length; i++) {
        const block = reportBlocks[i]!;
        const badge = block.type === 'final' ? 'FINAL' : 'UPDATE';
        const badgeColor = block.type === 'final' ? 'cyan' : 'yellow';

        if (i > 0) lines.push(singleLine(' '));
        lines.push([
          seg('    '),
          seg(badge, { color: badgeColor, bold: block.type === 'final' }),
          seg(` ${formatTime(block.timestamp)}`, { dim: true }),
        ]);
        for (const wl of wrapText(cleanMarkdown(block.content.trim()), contentWidth - 10)) {
          lines.push(singleLine(`      ${wl}`, { dim: true }));
        }
      }
    } else {
      for (const report of agent.reports) {
        const badge = report.type === 'final' ? 'FINAL' : 'UPDATE';
        const badgeColor = report.type === 'final' ? 'cyan' : 'yellow';
        lines.push([
          seg('    '),
          seg(badge, { color: badgeColor, bold: report.type === 'final' }),
          seg(` ${formatTime(report.timestamp)}  ${report.summary.split('\n')[0]}`, { dim: true }),
        ]);
      }
    }
  }

  // Metadata
  lines.push(singleLine(' '));
  lines.push(singleLine('  ▎ ◦ META', { color: 'gray', bold: true }));
  lines.push(singleLine(`    Spawned: ${formatTime(agent.spawnedAt)}`, { dim: true }));
  if (agent.completedAt) {
    lines.push(singleLine(`    Completed: ${formatTime(agent.completedAt)}`, { dim: true }));
  }
  if (agent.paneId) {
    lines.push(singleLine(`    Pane: ${agent.paneId}`, { dim: true }));
  }
  if (agent.worktreePath) {
    lines.push(singleLine(`    Worktree: ${agent.worktreePath}`, { dim: true }));
  }
  if (agent.branchName) {
    lines.push(singleLine(`    Branch: ${agent.branchName}`, { dim: true }));
  }

  return lines;
}

export function AgentDetail({ agent, reportBlocks, width, height, scrollOffset = 0, focused = false }: Props) {
  const allLines = useMemo(
    () => buildLines(agent, reportBlocks, width),
    [agent, reportBlocks, width],
  );

  return (
    <ScrollablePanel
      lines={allLines}
      width={width}
      height={height}
      scrollOffset={scrollOffset}
      focused={focused}
    />
  );
}
