import React from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../../shared/types.js';
import { PlanView } from './PlanView.js';
import { CycleHistory } from './CycleHistory.js';
import { MessageLog } from './MessageLog.js';
import { statusColor, formatDuration, truncate, wrapText, stripFrontmatter, cleanMarkdown } from '../lib/format.js';

interface Props {
  session: Session | null;
  planContent: string;
  goalContent?: string;
  logsContent?: string;
  width: number;
  height: number;
  paneAlive: boolean;
}

function SectionHeader({ label, count, color }: { label: string; count?: number; color: string }) {
  return (
    <Box>
      <Text color={color} bold>{'  '}▎ {label}</Text>
      {count != null && <Text dimColor> ({count})</Text>}
    </Box>
  );
}

export function SessionDetail({ session, planContent, goalContent, logsContent, width, height, paneAlive }: Props) {
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

  const agents = session.agents ?? [];
  const cycles = session.orchestratorCycles ?? [];
  const messages = session.messages ?? [];

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
  const conflicts = agents.filter((a) => a.mergeStatus === 'conflict');
  const contentWidth = width - 4;

  // Dynamic layout
  const headerLines = 3 + (conflicts.length > 0 ? 1 : 0) + (session.status === 'active' && !paneAlive ? 1 : 0);
  const availableLines = height - headerLines - 4;
  const hasCompletion = session.status === 'completed' && session.completionReport;
  const hasLogs = !!logsContent?.trim() && !!stripFrontmatter(logsContent!).trim();

  // Section budgets — plan gets the lion's share, others are compact
  const cycleLines = Math.min(8, Math.max(1, cycles.length)) + 2; // +2 for header + blank
  const messageLines = messages.length > 0 ? Math.min(6, messages.length) + 2 : 0;
  const completionLines = hasCompletion ? Math.min(6, Math.max(3, Math.floor(availableLines * 0.12))) + 2 : 0;
  const logsLines = hasLogs ? Math.min(5, Math.max(2, Math.floor(availableLines * 0.08))) + 2 : 0;
  const planLines = Math.max(5, availableLines - cycleLines - messageLines - completionLines - logsLines);

  const isDead = session.status === 'active' && !paneAlive;

  // Clean logs content
  const cleanLogs = hasLogs ? stripFrontmatter(logsContent!) : '';
  const logEntries = cleanLogs
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== '---' && !l.startsWith('description:'));

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      {/* Task name */}
      <Text bold> {truncate(goalContent ? cleanMarkdown(goalContent.split('\n')[0]!) : session.task, contentWidth - 2)}</Text>

      {/* Status bar */}
      <Box>
        <Text dimColor>{'  '}</Text>
        <Text color={statusColor(isDead ? 'crashed' : session.status)}>
          {isDead ? '✕ dead' : session.status}
        </Text>
        <Text dimColor>
          {' · '}cycle {cycleNum}{mode ? ` (${mode})` : ''}
          {' · '}{elapsed}
          {' · '}{runningAgents}↑ {completedAgents}✓
          {' · '}{agentMinutes}m agent-time
        </Text>
      </Box>

      {/* Dead session warning */}
      {isDead && (
        <Text color="red">{'  '}⚠ tmux window closed — session is stale. Kill or resume it.</Text>
      )}

      {/* Conflict banner */}
      {conflicts.length > 0 && (
        <Text color="red" bold>
          {'  '}⚠ {conflicts.length} merge conflict{conflicts.length > 1 ? 's' : ''}
        </Text>
      )}

      {/* Plan */}
      <Text>{' '}</Text>
      <SectionHeader label="PLAN" color="yellow" />
      <PlanView content={planContent} maxLines={planLines} width={contentWidth} />

      {/* Completion report */}
      {hasCompletion && (
        <Box flexDirection="column">
          <Text>{' '}</Text>
          <SectionHeader label="COMPLETION" color="cyan" />
          {wrapText(cleanMarkdown(session.completionReport!), contentWidth - 6)
            .slice(0, completionLines - 2)
            .map((line, i) => (
              <Text key={i} dimColor>{'    '}{line}</Text>
            ))}
        </Box>
      )}

      {/* Cycles */}
      <Text>{' '}</Text>
      <SectionHeader label="CYCLES" count={cycles.length} color="blue" />
      <CycleHistory cycles={cycles} maxCycles={cycleLines - 2} />

      {/* Messages */}
      {messages.length > 0 && (
        <Box flexDirection="column">
          <Text>{' '}</Text>
          <SectionHeader label="MESSAGES" count={messages.length} color="magenta" />
          <MessageLog messages={messages} maxMessages={messageLines - 2} width={contentWidth} />
        </Box>
      )}

      {/* Logs */}
      {hasLogs && logEntries.length > 0 && (
        <Box flexDirection="column">
          <Text>{' '}</Text>
          <SectionHeader label="LOGS" color="gray" />
          {logEntries.slice(0, logsLines - 2).map((line, i) => (
            <Text key={i} dimColor>{'    '}{truncate(cleanMarkdown(line), contentWidth - 6)}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
