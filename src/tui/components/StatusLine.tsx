import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
  detailFocused?: boolean;
}

export function StatusLine({ mode, detailFocused = false }: Props) {
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

  if (detailFocused) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          [↑↓] scroll  [←/tab] back to tree
          {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [q]uit
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>
        [↑↓] navigate  [←→] collapse/expand  [space] toggle  [tab] detail
        {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [b]ack  [q]uit
      </Text>
    </Box>
  );
}
