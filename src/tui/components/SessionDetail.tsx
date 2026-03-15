import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../../shared/types.js';
import { computeActiveTimeMs } from '../../shared/utils.js';
import { buildPlanLines } from './PlanView.js';
import {
  statusColor,
  formatDuration,
  formatTime,
  truncate,
  wrapText,
  stripFrontmatter,
  cleanMarkdown,
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

type Seg = {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
};

type DetailLine = Seg[];

function seg(text: string, opts?: Partial<Omit<Seg, 'text'>>): Seg {
  return { text, ...opts };
}

function simple(text: string, opts?: Partial<Omit<Seg, 'text'>>): DetailLine {
  return [seg(text, opts)];
}

function buildLines(
  session: Session,
  planContent: string,
  goalContent: string | undefined,
  logsContent: string | undefined,
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
      lines.push(simple(`${i === 0 ? ' ' : '  '}${line}`, { bold: true }));
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
      simple(
        `  ⚠ ${conflicts.length} merge conflict${conflicts.length > 1 ? 's' : ''}`,
        { color: 'red', bold: true },
      ),
    );
  }

  // Plan section
  lines.push(simple(' '));
  lines.push([
    seg('  ▎ ◈ PLAN', { color: 'yellow', bold: true }),
  ]);
  const planLines = buildPlanLines(planContent, 99999, width);
  if (planLines.length === 0) {
    lines.push(simple('    orchestrator will create one', { dim: true, italic: true }));
  } else {
    for (const pl of planLines) {
      lines.push(simple(pl.text, { bold: pl.bold, dim: pl.dim, color: pl.color }));
    }
  }

  // Completion report
  if (session.status === 'completed' && session.completionReport) {
    lines.push(simple(' '));
    lines.push([seg('  ▎ ✓ COMPLETION', { color: 'cyan', bold: true })]);
    wrapText(cleanMarkdown(session.completionReport), contentWidth - 6).forEach(
      (l) => {
        lines.push(simple(`    ${l}`, { dim: true }));
      },
    );
  }

  // Cycles section — newest first, messages nested below the cycle they fed into
  lines.push(simple(' '));
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
    lines.push(simple('    waiting for orchestrator…', { dim: true, italic: true }));
  } else {
    const sortedMsgs = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const reversedCycles = [...cycles].reverse(); // newest first in display

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

      // For cycles with 1–2 agents, show agent type inline instead of just "N agents"
      const cycleAgents = agents.filter((a) => cycle.agentsSpawned.includes(a.id));
      const agentDetail =
        cycleAgents.length === 1
          ? truncate(cycleAgents[0]!.agentType || cycleAgents[0]!.name, 14)
          : cycleAgents.length === 2
            ? cycleAgents.map((a) => truncate(a.agentType || a.name, 10)).join(' + ')
            : `${n} agent${n !== 1 ? 's' : ''}`;

      const row: DetailLine = [
        seg(`  ${dot} `, { color: dotColor }),
        seg(`C${cycle.cycle}`, { bold: isRunning || isNewest, dim: rowDim }),
        seg('  ', {}),
        ...(isRunning
          ? [seg('running', { color: 'green', bold: true })]
          : [seg(duration, { dim: rowDim })]),
        seg('  ·  ', { dim: true }),
        seg(agentDetail, { dim: rowDim }),
        ...(cycle.mode ? [seg('  ·  ', { dim: true }), seg(cycle.mode, { color: cycle.mode === 'planning' ? 'blue' : cycle.mode === 'implementation' ? 'green' : 'cyan' })] : []),
        seg(`  ${startTime}`, { dim: true }),
      ];
      lines.push(row);

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

  const innerHeight = height - 2; // borders only
  const hasOverflow = allLines.length > innerHeight;
  const viewableHeight = hasOverflow ? innerHeight - 1 : innerHeight;
  const maxScroll = Math.max(0, allLines.length - viewableHeight);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const visible = allLines.slice(effectiveOffset, effectiveOffset + viewableHeight);
  const padCount = viewableHeight - visible.length;
  const scrollPct =
    maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'blue' : 'gray'}
      paddingX={1}
    >
      {visible.map((line, i) => (
        <Text key={effectiveOffset + i}>
          {line.map((s, j) => (
            <Text
              key={j}
              color={s.color}
              bold={s.bold}
              dimColor={s.dim}
              italic={s.italic}
            >
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
      {padCount > 0 &&
        Array.from({ length: padCount }, (_, i) => (
          <Text key={`pad-${i}`}>{' '}</Text>
        ))}
      {hasOverflow && (
        <Text dimColor>
          {'  '}[tab] scroll · {scrollPct}% · {allLines.length} lines
        </Text>
      )}
    </Box>
  );
}
