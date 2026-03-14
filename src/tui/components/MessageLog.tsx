import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../shared/types.js';
import { formatTime, truncate } from '../lib/format.js';

interface Props {
  messages: Message[];
  maxMessages: number;
  width: number;
}

function sourceLabel(msg: Message): string {
  if (msg.source.type === 'user') return 'You';
  if (msg.source.type === 'agent') return msg.source.agentId;
  return 'system';
}

function sourceColor(msg: Message): string {
  if (msg.source.type === 'user') return 'yellow';
  if (msg.source.type === 'agent') return 'cyan';
  return 'gray';
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
        const label = sourceLabel(msg);
        const color = sourceColor(msg);
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
