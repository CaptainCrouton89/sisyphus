import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
  focus: 'sessions' | 'agents';
}

export function StatusLine({ mode, focus }: Props) {
  if (mode === 'report-detail') {
    return null; // ReportView renders its own footer
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
        [m]sg  [k]ill  [g]o  [n]ew  [c]laude  [p]lan  [R]esume  [C]ontinue  [q]uit
        {focus === 'agents' ? '  [r]e-run  [j]ump  [enter] reports' : ''}
        {'  [tab] focus'}
      </Text>
    </Box>
  );
}
