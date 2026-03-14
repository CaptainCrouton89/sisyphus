import React from 'react';
import { Box, Text } from 'ink';
import type { Agent } from '../../shared/types.js';
import { statusColor, formatDuration, truncate, agentStatusIcon, extractFirstSentence } from '../lib/format.js';

interface Props {
  agents: Agent[];
  selectedIndex: number;
  focused: boolean;
  width: number;
  maxVisible: number;
}

export function AgentTable({ agents, selectedIndex, focused, width, maxVisible }: Props) {
  if (agents.length === 0) {
    return (
      <Box>
        <Text dimColor italic>  No agents</Text>
      </Box>
    );
  }

  // Scroll so selected item stays visible — 1 line per agent
  const visibleCount = Math.min(agents.length, maxVisible);
  const halfVisible = Math.floor(visibleCount / 2);
  const scrollOffset = Math.max(
    0,
    Math.min(selectedIndex - halfVisible, agents.length - visibleCount),
  );
  const visible = agents.slice(scrollOffset, scrollOffset + visibleCount);
  const taskWidth = Math.max(10, width - 24);

  return (
    <Box flexDirection="column">
      {scrollOffset > 0 && (
        <Text dimColor>    ↑ {scrollOffset} more</Text>
      )}

      {visible.map((agent, i) => {
        const realIdx = scrollOffset + i;
        const selected = realIdx === selectedIndex && focused;
        const color = statusColor(agent.status);
        const icon = agentStatusIcon(agent.status);
        const dur = formatDuration(agent.spawnedAt, agent.completedAt);
        const conflict = agent.mergeStatus === 'conflict';
        const label = agent.name !== agent.id ? agent.name : truncate(agent.instruction, taskWidth);

        return (
          <Text key={agent.id} inverse={selected}>
            {'    '}
            <Text color={conflict ? 'red' : color}>{conflict ? '⚠' : icon}</Text>
            {' '}
            <Text bold>{agent.id}</Text>
            <Text dimColor> {dur.padStart(6)}</Text>
            {'  '}
            {truncate(label, taskWidth)}
          </Text>
        );
      })}

      {scrollOffset + visibleCount < agents.length && (
        <Text dimColor>    ↓ {agents.length - scrollOffset - visibleCount} more</Text>
      )}

      {/* Selected agent detail — shown below the list */}
      {focused && agents[selectedIndex] && (
        <SelectedAgentDetail agent={agents[selectedIndex]!} width={width} />
      )}
    </Box>
  );
}

function SelectedAgentDetail({ agent, width }: { agent: Agent; width: number }) {
  const detailWidth = width - 8;
  const finalReport = agent.reports.find((r) => r.type === 'final');
  const lastUpdate = agent.reports.filter((r) => r.type === 'update').pop();
  const report = finalReport ?? lastUpdate;
  const summary = report
    ? extractFirstSentence(report.summary, detailWidth)
    : null;

  return (
    <Box flexDirection="column" paddingLeft={4} marginTop={0}>
      <Text dimColor>
        {'  '}type: {agent.agentType} · status: {agent.status}
        {agent.mergeStatus ? ` · merge: ${agent.mergeStatus}` : ''}
      </Text>
      {summary && (
        <Text dimColor>  ↳ {summary}</Text>
      )}
      {agent.mergeStatus === 'conflict' && agent.mergeDetails && (
        <Text color="red">  ⚠ {truncate(agent.mergeDetails, detailWidth)}</Text>
      )}
    </Box>
  );
}
