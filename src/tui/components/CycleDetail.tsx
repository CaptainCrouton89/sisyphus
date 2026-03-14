import React from 'react';
import { Box, Text } from 'ink';
import type { OrchestratorCycle, Agent } from '../../shared/types.js';
import {
  formatDuration,
  formatTime,
  statusColor,
  agentStatusIcon,
  truncate,
  extractFirstSentence,
  wrapText,
} from '../lib/format.js';

interface Props {
  cycle: OrchestratorCycle;
  agents: Agent[];
  width: number;
  height: number;
}

export function CycleDetail({ cycle, agents, width, height }: Props) {
  const contentWidth = width - 4;
  const dur = cycle.completedAt
    ? formatDuration(cycle.timestamp, cycle.completedAt)
    : 'running';
  const isRunning = !cycle.completedAt;
  const cycleAgents = agents.filter((a) => cycle.agentsSpawned.includes(a.id));

  // Space budget for nextPrompt
  const headerLines = 4;
  // Each agent takes 1-3 lines (header + optional instruction + optional report)
  const agentLinesBudget = cycleAgents.reduce((sum, a) => {
    let n = 1;
    if (a.instruction) n++;
    if (a.status === 'completed' && a.reports.length > 0) n++;
    return sum + n;
  }, 0);
  const agentSectionLines = Math.max(1, agentLinesBudget) + 2; // +header +blank
  const promptAvailable = height - headerLines - agentSectionLines - 6;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      {/* Title */}
      <Text bold> Cycle {cycle.cycle}</Text>
      <Box>
        <Text dimColor>{'  '}</Text>
        <Text color={isRunning ? 'green' : 'gray'}>
          {isRunning ? 'running' : 'completed'}
        </Text>
        <Text dimColor>
          {' · '}{dur}
          {' · '}{cycleAgents.length} agent{cycleAgents.length !== 1 ? 's' : ''}
          {cycle.mode ? ` · ${cycle.mode}` : ''}
        </Text>
      </Box>
      <Text dimColor>{'  '}{formatTime(cycle.timestamp)}{cycle.completedAt ? ` → ${formatTime(cycle.completedAt)}` : ''}</Text>

      {/* Agents */}
      <Text>{' '}</Text>
      <Text color="green" bold>{'  '}▎ AGENTS</Text>
      {cycleAgents.length === 0 ? (
        <Text dimColor italic>{'    '}No agents spawned yet</Text>
      ) : (
        cycleAgents.map((agent) => {
          const nameLabel = agent.name !== agent.id ? agent.name : agent.agentType;
          const instrPreview = agent.instruction.split('\n')[0] || '';
          const latestReport = agent.reports.length > 0
            ? agent.reports[agent.reports.length - 1]!
            : null;
          const reportSummary = latestReport && agent.status === 'completed'
            ? extractFirstSentence(latestReport.summary, contentWidth - 14)
            : null;

          return (
            <Box key={agent.id} flexDirection="column">
              <Box>
                <Text>{'    '}</Text>
                <Text color={statusColor(agent.status)}>{agentStatusIcon(agent.status)}</Text>
                <Text bold> {agent.id}</Text>
                <Text dimColor> {truncate(nameLabel, contentWidth - 30)}</Text>
                <Text dimColor> · {agent.status} · {formatDuration(agent.spawnedAt, agent.completedAt)}</Text>
              </Box>
              {instrPreview && (
                <Text dimColor>{'      '}{truncate(instrPreview, contentWidth - 10)}</Text>
              )}
              {reportSummary && (
                <Text color="cyan">{'      '}→ {reportSummary}</Text>
              )}
            </Box>
          );
        })
      )}

      {/* Next Prompt */}
      {cycle.nextPrompt && (
        <>
          <Text>{' '}</Text>
          <Text color="yellow" bold>{'  '}▎ NEXT PROMPT</Text>
          {wrapText(cycle.nextPrompt, contentWidth - 6)
            .slice(0, Math.max(3, promptAvailable))
            .map((line, i) => (
              <Text key={i} dimColor>{'    '}{line}</Text>
            ))}
        </>
      )}
    </Box>
  );
}
