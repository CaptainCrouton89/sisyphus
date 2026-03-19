import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../../shared/types.js';
import { computeActiveTimeMs } from '../../shared/utils.js';
import { buildPlanLines } from './PlanView.js';
import { ScrollablePanel } from './ScrollablePanel.js';
import {
  statusColor,
  formatDuration,
  formatTime,
  truncate,
  wrapText,
  stripFrontmatter,
  cleanMarkdown,
  seg,
  singleLine,
  type DetailLine,
} from '../lib/format.js';

interface Props {
  session: Session | null;
  planContent: string;
  goalContent?: string;
  logsContent?: string;
  width: number;
  height: number;
  paneAlive: boolean;
  scrollOffset?: number;
  focused?: boolean;
}

function buildLines(
  session: Session,
  planContent: string,
  goalContent: string | undefined,
  _logsContent: string | undefined,
  width: number,
  paneAlive: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const contentWidth = width - 4;
  const agents = session.agents ?? [];
  const cycles = session.orchestratorCycles ?? [];
  const messages = session.messages ?? [];
  const isDead = session.status === 'active' && !paneAlive;
  const conflicts = agents.filter((a) => a.mergeStatus === 'conflict');

  // Goal text
  const goalText = goalContent
    ? cleanMarkdown(stripFrontmatter(goalContent).trim())
    : session.task;
  goalText
    .split('\n')
    .flatMap((l) => wrapText(l, contentWidth - 2))
    .forEach((line, i) => {
      lines.push(singleLine(`${i === 0 ? ' ' : '  '}${line}`, { bold: true }));
    });

  // Status bar (mixed colors)
  const lastCycle = cycles.length > 0 ? cycles[cycles.length - 1]! : null;
  const cycleNum = lastCycle?.cycle ?? 0;
  const mode = lastCycle?.mode ?? '';
  const runningAgents = agents.filter((a) => a.status === 'running').length;
  const completedAgents = agents.filter((a) => a.status === 'completed').length;
  const elapsed = formatDuration(session.createdAt, session.completedAt);
  const activeMs = computeActiveTimeMs(session);
  const activeTime = formatDuration(activeMs);
  const modeColor = mode === 'planning' ? 'blue' : mode === 'implementation' ? 'green' : 'cyan';
  lines.push([
    seg('  '),
    seg(isDead ? '✕ dead' : session.status, {
      color: statusColor(isDead ? 'crashed' : session.status),
    }),
    seg(` · cycle ${cycleNum}`, { dim: true }),
    ...(mode ? [seg(' (', { dim: true }), seg(mode, { color: modeColor }), seg(')', { dim: true })] : []),
    seg(` · ${elapsed} · `, { dim: true }),
    seg(`${runningAgents} running`, { color: 'green' }),
    seg(' · ', { dim: true }),
    seg(`${completedAgents} done`, { color: 'cyan' }),
    seg(` · ${activeTime} active`, { dim: true }),
  ]);

  // Dead session warning
  if (isDead) {
    lines.push([
      seg('  '),
      seg(' ✕ DEAD ', { color: 'red', bold: true }),
      seg(' tmux window closed — kill or resume', { color: 'red' }),
    ]);
  }

  // Conflict banner
  if (conflicts.length > 0) {
    lines.push(
      singleLine(
        `  ⚠ ${conflicts.length} merge conflict${conflicts.length > 1 ? 's' : ''}`,
        { color: 'red', bold: true },
      ),
    );
    lines.push(
      singleLine(
        '  resolve in worktree, then [x] restart agent',
        { color: 'red', dim: true },
      ),
    );
  }

  // Plan section
  lines.push(singleLine(' '));
  lines.push([
    seg('  ▎ ◈ PLAN', { color: 'yellow', bold: true }),
  ]);
  const planLines = buildPlanLines(planContent, 99999, width);
  if (planLines.length === 0) {
    lines.push(singleLine('    orchestrator will create one', { dim: true, italic: true }));
  } else {
    for (const pl of planLines) {
      lines.push(singleLine(pl.text, { bold: pl.bold, dim: pl.dim, color: pl.color }));
    }
  }

  // Completion report
  if (session.status === 'completed' && session.completionReport) {
    lines.push(singleLine(' '));
    lines.push([seg('  ▎ ✓ COMPLETION', { color: 'cyan', bold: true })]);
    wrapText(cleanMarkdown(session.completionReport), contentWidth - 6).forEach(
      (l) => {
        lines.push(singleLine(`    ${l}`, { dim: true }));
      },
    );
  }

  // Cycles section — newest first, messages nested below the cycle they fed into
  lines.push(singleLine(' '));
  lines.push([
    seg('  ▎ ⟳ CYCLES', { color: 'blue', bold: true }),
    seg(` (${cycles.length})`, { dim: true }),
  ]);

  // Render one message as an indented sub-row under its cycle
  const pushMsgLine = (msg: (typeof messages)[number], connector: '└▸' | '├▸') => {
    const time = formatTime(msg.timestamp);
    const label =
      msg.source.type === 'user'
        ? 'You'
        : msg.source.type === 'agent'
          ? msg.source.agentId
          : '⚙ system';
    const labelColor =
      msg.source.type === 'user' ? 'yellow' : msg.source.type === 'agent' ? 'cyan' : 'gray';
    const maxContent = Math.max(10, contentWidth - label.length - 18);
    lines.push([
      seg(`    ${connector} `, { dim: true }),
      seg(`[${time}] `, { dim: true }),
      seg(`${label} `, { color: labelColor, bold: true }),
      seg(truncate(msg.summary || msg.content, maxContent), { dim: true }),
    ]);
  };

  if (cycles.length === 0) {
    lines.push(singleLine('    waiting for orchestrator…', { dim: true, italic: true }));
  } else {
    const sortedMsgs = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const reversedCycles = [...cycles].reverse(); // newest first in display

    // Strip namespace prefix for compact display (e.g., "devcore:programmer" → "programmer")
    const shortType = (t: string) => {
      const colonIdx = t.indexOf(':');
      return colonIdx >= 0 ? t.slice(colonIdx + 1) : t;
    };

    for (let i = 0; i < reversedCycles.length; i++) {
      const cycle = reversedCycles[i]!;
      const olderCycle = reversedCycles[i + 1]; // chronologically prior

      const isRunning = !cycle.completedAt;
      // Visual recency: newest completed = white, second = gray, rest = dim gray
      const isNewest = i === 0;
      const isSecond = i === 1;
      const dot = isRunning ? '●' : '○';
      const dotColor = isRunning ? 'green' : isNewest ? 'white' : 'gray';
      const rowDim = !isRunning && !isNewest && !isSecond;
      const duration = isRunning ? 'running' : formatDuration(cycle.timestamp, cycle.completedAt);
      const n = cycle.agentsSpawned.length;
      const startTime = formatTime(cycle.timestamp);

      // Compact mode label
      const modeLabel = cycle.mode
        ? cycle.mode === 'implementation' ? 'impl'
          : cycle.mode === 'planning' ? 'plan'
          : cycle.mode
        : '';
      const cycModeColor = cycle.mode === 'planning' ? 'blue' : cycle.mode === 'implementation' ? 'green' : 'cyan';

      const cycleAgents = agents.filter((a) => cycle.agentsSpawned.includes(a.id));

      // Padded fields for column alignment
      const cyclePad = `C${cycle.cycle}`.padEnd(4);
      const durPad = (isRunning ? 'running' : duration).padEnd(9);

      // Line 1: cycle metadata
      const headerRow: DetailLine = [
        seg(`  ${dot} `, { color: dotColor }),
        seg(cyclePad, { bold: isRunning || isNewest, dim: rowDim }),
        ...(isRunning
          ? [seg(durPad, { color: 'green', bold: true })]
          : [seg(durPad, { dim: rowDim })]),
        seg(startTime, { dim: true }),
        ...(modeLabel ? [seg('  ', {}), seg(modeLabel, { color: cycModeColor })] : []),
      ];
      lines.push(headerRow);

      // Line 2: agent detail — full names, grouped by type
      if (cycleAgents.length > 0) {
        const typeGroups = new Map<string, number>();
        for (const a of cycleAgents) {
          const t = shortType(a.agentType || a.name || a.id);
          typeGroups.set(t, (typeGroups.get(t) ?? 0) + 1);
        }
        const agentNames = [...typeGroups.entries()]
          .map(([t, count]) => count > 1 ? `${count}× ${t}` : t)
          .join(', ');
        lines.push([
          seg('      ', {}),
          seg(truncate(agentNames, contentWidth - 6), { dim: rowDim }),
        ]);
      } else if (n > 0) {
        lines.push([
          seg('      ', {}),
          seg(`${n} agent${n !== 1 ? 's' : ''}`, { dim: rowDim }),
        ]);
      }

      // Messages that fed into this cycle: sent after the prior cycle started, before this one
      const cycleTime = new Date(cycle.timestamp).getTime();
      const olderCycleTime = olderCycle ? new Date(olderCycle.timestamp).getTime() : 0;
      const cycleMsgs = sortedMsgs.filter((m) => {
        const t = new Date(m.timestamp).getTime();
        return t < cycleTime && t >= olderCycleTime;
      });
      cycleMsgs.forEach((msg, mi) => {
        pushMsgLine(msg, mi < cycleMsgs.length - 1 ? '├▸' : '└▸');
      });
    }

    // Messages predating all cycles (before the first cycle started)
    const firstCycleTime = new Date(reversedCycles[reversedCycles.length - 1]!.timestamp).getTime();
    const preMsgs = sortedMsgs.filter((m) => new Date(m.timestamp).getTime() < firstCycleTime);
    preMsgs.forEach((msg, mi) => {
      pushMsgLine(msg, mi < preMsgs.length - 1 ? '├▸' : '└▸');
    });
  }

  return lines;
}

export function SessionDetail({
  session,
  planContent,
  goalContent,
  logsContent,
  width,
  height,
  paneAlive,
  scrollOffset = 0,
  focused = false,
}: Props) {
  if (!session) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        justifyContent="center"
        alignItems="center"
      >
        <Text dimColor>Select a session to view details</Text>
      </Box>
    );
  }

  const allLines = useMemo(
    () => buildLines(session, planContent, goalContent, logsContent, width, paneAlive),
    [session, planContent, goalContent, logsContent, width, paneAlive],
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
