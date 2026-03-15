import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../../shared/types.js';
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
  const agentMinutes = Math.round(
    agents.reduce((sum, a) => {
      const start = new Date(a.spawnedAt).getTime();
      const end = a.completedAt ? new Date(a.completedAt).getTime() : Date.now();
      return sum + (end - start) / 60000;
    }, 0),
  );
  lines.push([
    seg('  '),
    seg(isDead ? '✕ dead' : session.status, {
      color: statusColor(isDead ? 'crashed' : session.status),
    }),
    seg(
      ` · cycle ${cycleNum}${mode ? ` (${mode})` : ''} · ${elapsed} · ${runningAgents}↑ ${completedAgents}✓ · ${agentMinutes}m agent-time`,
      { dim: true },
    ),
  ]);

  // Dead session warning
  if (isDead) {
    lines.push(
      simple(
        '  ⚠ tmux window closed — session is stale. Kill or resume it.',
        { color: 'red' },
      ),
    );
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
    seg('  ▎ PLAN', { color: 'yellow', bold: true }),
  ]);
  const planLines = buildPlanLines(planContent, 99999, width);
  if (planLines.length === 0) {
    lines.push(simple('    No plan yet', { dim: true, italic: true }));
  } else {
    for (const pl of planLines) {
      lines.push(simple(pl.text, { bold: pl.bold, dim: pl.dim, color: pl.color }));
    }
  }

  // Completion report
  if (session.status === 'completed' && session.completionReport) {
    lines.push(simple(' '));
    lines.push([seg('  ▎ COMPLETION', { color: 'cyan', bold: true })]);
    wrapText(cleanMarkdown(session.completionReport), contentWidth - 6).forEach(
      (l) => {
        lines.push(simple(`    ${l}`, { dim: true }));
      },
    );
  }

  // Cycles section
  lines.push(simple(' '));
  lines.push([
    seg('  ▎ CYCLES', { color: 'blue', bold: true }),
    seg(` (${cycles.length})`, { dim: true }),
  ]);
  if (cycles.length === 0) {
    lines.push(simple('  No cycles yet', { dim: true, italic: true }));
  } else {
    [...cycles].reverse().forEach((cycle) => {
      const duration = cycle.completedAt
        ? formatDuration(cycle.timestamp, cycle.completedAt)
        : 'running';
      const n = cycle.agentsSpawned.length;
      const m = cycle.mode ? `${cycle.mode}` : '';
      lines.push(
        simple(
          `  C${cycle.cycle}: ${n} agent${n !== 1 ? 's' : ''} · ${duration}${m ? ` · ${m}` : ''}`,
          { dim: true },
        ),
      );
    });
  }

  // Messages section
  if (messages.length > 0) {
    lines.push(simple(' '));
    lines.push([
      seg('  ▎ MESSAGES', { color: 'magenta', bold: true }),
      seg(` (${messages.length})`, { dim: true }),
    ]);
    messages.forEach((msg) => {
      const time = formatTime(msg.timestamp);
      const label =
        msg.source.type === 'user'
          ? 'You'
          : msg.source.type === 'agent'
            ? msg.source.agentId
            : 'system';
      const color =
        msg.source.type === 'user'
          ? 'yellow'
          : msg.source.type === 'agent'
            ? 'cyan'
            : 'gray';
      const content = truncate(
        msg.summary || msg.content,
        Math.max(10, contentWidth - 20),
      );
      lines.push([
        seg(`  [${time}] `, { dim: true }),
        seg(`${label}: `, { color, bold: true }),
        seg(content),
      ]);
    });
  }

  // Logs section
  const hasLogs = !!logsContent?.trim() && !!stripFrontmatter(logsContent!).trim();
  if (hasLogs) {
    const cleanLogs = stripFrontmatter(logsContent!);
    const logEntries = cleanLogs
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== '---' && !l.startsWith('description:'));

    if (logEntries.length > 0) {
      lines.push(simple(' '));
      lines.push([seg('  ▎ LOGS', { color: 'gray', bold: true })]);
      logEntries.forEach((l) => {
        lines.push(
          simple(
            `    ${truncate(cleanMarkdown(l), contentWidth - 6)}`,
            { dim: true },
          ),
        );
      });
    }
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
