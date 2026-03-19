import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../shared/types.js';
import { formatTime, truncate, messageSourceLabel, messageSourceColor } from '../lib/format.js';

interface Props {
  messages: Message[];
  maxMessages: number;
  width: number;
}

export function MessageLog({ messages, maxMessages, width }: Props) {
  if (messages.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold dimColor>Messages</Text>
        <Text dimColor italic>  No messages</Text>
      </Box>
    );
  }

  const recent = messages.slice(-maxMessages);
  const contentWidth = Math.max(10, width - 20);

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Messages</Text>
      {recent.map((msg) => {
        const time = formatTime(msg.timestamp);
        const agentId = msg.source.type === 'agent' ? msg.source.agentId : undefined;
        const label = messageSourceLabel(msg.source.type, agentId);
        const color = messageSourceColor(msg.source.type);
        const content = truncate(msg.summary || msg.content, contentWidth);

        return (
          <Text key={msg.id}>
            {'  '}
            <Text dimColor>[{time}]</Text>
            {' '}
            <Text color={color} bold>{label}:</Text>
            {' '}
            {content}
          </Text>
        );
      })}
    </Box>
  );
}
