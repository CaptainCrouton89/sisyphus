import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
  rows: number;
  cols: number;
}

const LEADER_WIDTH = 26;
const LEADER_HEIGHT = 16; // 14 lines + 2 border
const COPY_HEIGHT = 9;    // 7 lines + 2 border
// Full inner width between left and right border chars
const INNER = LEADER_WIDTH - 2;

/** Pad a string to fill the full width between borders so no background chars leak. */
function pad(s: string): string {
  return s.padEnd(INNER);
}

export function LeaderOverlay({ mode, rows, cols }: Props) {
  if (mode === 'leader') {
    return (
      <Box
        position="absolute"
        marginTop={rows - LEADER_HEIGHT - 2}
        marginLeft={cols - LEADER_WIDTH - 1}
        width={LEADER_WIDTH}
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
      >
        <Text bold color="magenta">{pad('  LEADER')}</Text>
        <Text>{pad(' ')}</Text>
        <Text>{pad('  y  copy menu')}</Text>
        <Text>{pad('  d  delete session')}</Text>
        <Text>{pad('  l  daemon logs')}</Text>
        <Text>{pad('  o  open session dir')}</Text>
        <Text>{pad('  a  spawn agent')}</Text>
        <Text>{pad('  m  message agent')}</Text>
        <Text>{pad('  /  search')}</Text>
        <Text>{pad('  !  shell command')}</Text>
        <Text>{pad('  ?  help')}</Text>
        <Text>{pad(' 1-9  jump to session')}</Text>
        <Text>{pad(' ')}</Text>
        <Text dimColor>{pad('  esc  dismiss')}</Text>
      </Box>
    );
  }

  if (mode === 'copy-menu') {
    return (
      <Box
        position="absolute"
        marginTop={rows - COPY_HEIGHT - 2}
        marginLeft={cols - LEADER_WIDTH - 1}
        width={LEADER_WIDTH}
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
      >
        <Text bold color="cyan">{pad('  COPY')}</Text>
        <Text>{pad(' ')}</Text>
        <Text>{pad('  p  session path')}</Text>
        <Text>{pad('  C  LLM context')}</Text>
        <Text>{pad('  l  logs content')}</Text>
        <Text>{pad('  s  session ID')}</Text>
        <Text dimColor>{pad('  esc  cancel')}</Text>
      </Box>
    );
  }

  return null;
}
