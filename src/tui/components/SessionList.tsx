import React from 'react';
import { Box, Text } from 'ink';
import type { SessionSummary } from '../hooks/usePolling.js';
import { statusColor, statusIndicator, truncate, formatTimeAgo } from '../lib/format.js';

interface Props {
  sessions: SessionSummary[];
  selectedIndex: number;
  focused: boolean;
  width: number;
}

export function SessionList({ sessions, selectedIndex, focused, width }: Props) {
  if (sessions.length === 0) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="round"
        borderColor={focused ? 'yellow' : 'gray'}
        paddingX={1}
      >
        <Text bold> Sessions </Text>
        <Text dimColor>No sessions found.</Text>
        <Text dimColor>Press [n] to create one.</Text>
      </Box>
    );
  }

  const maxTask = width - 6;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'yellow' : 'gray'}
      paddingX={1}
    >
      <Text bold> Sessions </Text>
      {sessions.map((s, i) => {
        const isSelected = i === selectedIndex;
        const indicator = statusIndicator(s.status);
        const color = statusColor(s.status);
        const task = truncate(s.task, maxTask);
        const meta = `${s.agentCount} agents · ${s.status === 'completed' ? formatTimeAgo(s.createdAt) : s.status}`;

        return (
          <Box key={s.id} flexDirection="column">
            <Text
              inverse={isSelected && focused}
              bold={isSelected}
            >
              <Text color={color}>{indicator}</Text> {task}
            </Text>
            <Text dimColor>  {meta}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
