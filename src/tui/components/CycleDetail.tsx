import React, { useMemo } from 'react';
import type { OrchestratorCycle, Agent } from '../../shared/types.js';
import { ScrollablePanel } from './ScrollablePanel.js';
import {
  formatDuration,
  formatTime,
  statusColor,
  agentStatusIcon,
  truncate,
  extractFirstSentence,
  wrapText,
  durationColor,
  agentTypeColor,
  seg,
  singleLine,
  agentDisplayName,
  modeColor,
  type DetailLine,
} from '../lib/format.js';

interface Props {
  cycle: OrchestratorCycle;
  agents: Agent[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
}

function buildLines(cycle: OrchestratorCycle, agents: Agent[], width: number): DetailLine[] {
  const lines: DetailLine[] = [];
  const contentWidth = width - 4;
  const isRunning = !cycle.completedAt;
  const dur = cycle.completedAt
    ? formatDuration(cycle.timestamp, cycle.completedAt)
    : 'running';
  const cycleAgents = agents.filter((a) => cycle.agentsSpawned.includes(a.id));

  // Title
  lines.push(singleLine(` Cycle ${cycle.cycle}`, { bold: true }));

  // Status
  lines.push([
    seg('  '),
    seg(isRunning ? 'running' : 'completed', { color: isRunning ? 'green' : 'gray' }),
    seg(` · ${dur} · ${cycleAgents.length} agent${cycleAgents.length !== 1 ? 's' : ''}`, { dim: true }),
    ...(cycle.mode
      ? [
          seg(' · ', { dim: true }),
          seg(cycle.mode, {
            color: modeColor(cycle.mode),
          }),
        ]
      : []),
  ]);

  // Time
  lines.push(singleLine(
    `  ${formatTime(cycle.timestamp)}${cycle.completedAt ? ` → ${formatTime(cycle.completedAt)}` : ''}`,
    { dim: true },
  ));

  // Agents section
  lines.push(singleLine(' '));
  lines.push([seg('  ▎ ⊞ AGENTS', { color: 'green', bold: true })]);

  if (cycleAgents.length === 0) {
    lines.push(singleLine('    orchestrator spawning agents…', { dim: true, italic: true }));
  } else {
    for (const agent of cycleAgents) {
      const nameLabel = agentDisplayName(agent);
      const instrPreview = agent.instruction.split('\n')[0] || '';
      const latestReport = agent.reports.length > 0 ? agent.reports[agent.reports.length - 1]! : null;
      const reportSummary = latestReport && agent.status === 'completed'
        ? extractFirstSentence(latestReport.summary, contentWidth - 14)
        : null;
      const agentDur = formatDuration(agent.spawnedAt, agent.completedAt);
      const durClr = durationColor(agent.spawnedAt, agent.completedAt) || undefined;

      lines.push([
        seg('    '),
        seg(agentStatusIcon(agent.status), { color: statusColor(agent.status) }),
        seg(` ${agent.id}`, { bold: true }),
        seg(` ${truncate(nameLabel, contentWidth - 30)}`, {
          color: agentTypeColor(agent.agentType) || undefined,
          dim: !agentTypeColor(agent.agentType),
        }),
        seg(` · ${agent.status} · `, { dim: true }),
        seg(agentDur, { color: durClr, dim: !durClr }),
      ]);

      if (instrPreview) {
        lines.push(singleLine(`      ${truncate(instrPreview, contentWidth - 10)}`, { dim: true }));
      }

      if (reportSummary) {
        lines.push([
          seg('      '),
          seg('↳', { color: 'cyan' }),
          seg(` ${reportSummary}`, { dim: true }),
        ]);
      }
    }
  }

  // Next Prompt
  if (cycle.nextPrompt) {
    lines.push(singleLine(' '));
    lines.push([seg('  ▎ ▷ NEXT PROMPT', { color: 'yellow', bold: true })]);
    for (const wl of wrapText(cycle.nextPrompt, contentWidth - 6)) {
      lines.push(singleLine(`    ${wl}`, { dim: true }));
    }
  }

  return lines;
}

export function CycleDetail({ cycle, agents, width, height, scrollOffset = 0, focused = false }: Props) {
  const allLines = useMemo(
    () => buildLines(cycle, agents, width),
    [cycle, agents, width],
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
