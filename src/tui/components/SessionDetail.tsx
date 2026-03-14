import React from 'react';
import { Box, Text } from 'ink';
import type { Session } from '../../shared/types.js';
import { PlanView } from './PlanView.js';
import { AgentTable } from './AgentTable.js';
import { CycleHistory } from './CycleHistory.js';
import { MessageLog } from './MessageLog.js';
import { statusColor, formatDuration, truncate, divider } from '../lib/format.js';

interface Props {
  session: Session | null;
  planContent: string;
  selectedAgentIndex: number;
  agentFocused: boolean;
  width: number;
  height: number;
  paneAlive: boolean;
}

export function SessionDetail({ session, planContent, selectedAgentIndex, agentFocused, width, height, paneAlive }: Props) {
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

  // Vertical budget: allocate space for each section
  const headerLines = 4; // task + stats + conflict/dead + divider
  const planLines = Math.min(5, Math.max(2, Math.floor(height * 0.1)));
  const cycleLines = Math.min(3, Math.max(1, cycles.length)) + 1;
  const messageLines = messages.length > 0 ? Math.min(3, messages.length) + 1 : 0;
  const agentDetailLines = 4; // scroll indicators (2) + selected agent detail (2)
  const sectionHeaders = 8; // dividers + section labels
  const fixedLines = headerLines + planLines + cycleLines + messageLines + agentDetailLines + sectionHeaders;
  const agentMaxVisible = Math.max(3, height - fixedLines);

  const isDead = session.status === 'active' && !paneAlive;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={agentFocused ? 'yellow' : 'gray'}
      paddingX={1}
    >
      {/* Task name */}
      <Text bold> {truncate(session.task, contentWidth - 2)}</Text>

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
        <Text color="red">  ⚠ tmux window closed — session is stale. Kill or resume it.</Text>
      )}

      {/* Conflict banner */}
      {conflicts.length > 0 && (
        <Text color="red" bold>
          {'  '}⚠ {conflicts.length} merge conflict{conflicts.length > 1 ? 's' : ''}
        </Text>
      )}

      {/* Plan */}
      <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>
      <Text bold dimColor>  Plan</Text>
      <PlanView content={planContent} maxLines={planLines} width={contentWidth} />

      {/* Agents */}
      <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>
      <Text bold dimColor>  Agents ({agents.length})</Text>
      <AgentTable
        agents={agents}
        selectedIndex={selectedAgentIndex}
        focused={agentFocused}
        width={contentWidth}
        maxVisible={agentMaxVisible}
      />

      {/* Cycles */}
      <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>
      <Text bold dimColor>  Cycles ({cycles.length})</Text>
      <CycleHistory cycles={cycles} maxCycles={3} />

      {/* Messages — only show if there are any */}
      {messages.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>{'  ' + divider(contentWidth - 2)}</Text>
          <Text bold dimColor>  Messages ({messages.length})</Text>
          <MessageLog messages={messages} maxMessages={3} width={contentWidth} />
        </Box>
      )}
    </Box>
  );
}
