import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
}

export function StatusLine({ mode }: Props) {
  if (mode === 'report-detail') {
    return null;
  }

  if (mode !== 'navigate') {
    return (
      <Box paddingX={1}>
        <Text dimColor>[enter] send  [esc] cancel</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>
        [↑↓] navigate  [←→] collapse/expand  [space] toggle
        {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [b]ack  [q]uit
      </Text>
    </Box>
  );
}
