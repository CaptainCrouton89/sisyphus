import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
  rows: number;
  cols: number;
}

const HELP_WIDTH = 62;
const INNER = HELP_WIDTH - 2;

function pad(s: string): string {
  return s.padEnd(INNER);
}

function header(label: string): string {
  return pad(`  ── ${label} ──`);
}

function row(left: string, right: string): string {
  const col = Math.floor(INNER / 2);
  return (left.padEnd(col) + right).padEnd(INNER);
}

export function HelpOverlay({ mode, rows, cols }: Props) {
  if (mode !== 'help') return null;

  const marginLeft = Math.max(0, Math.floor((cols - HELP_WIDTH) / 2));
  const lines = [
    row('  hjkl/↑↓←→  navigate', '  tab  switch pane'),
    row('  enter  expand/open', '  t  toggle logs'),
    '',
    row('  n  new session', '  m  message orch.'),
    row('  R  resume session', '  C  continue session'),
    row('  b  rollback cycle', '  x  restart agent'),
    row('  r  re-run agent', '  g  edit goal'),
    row('  p  open roadmap', '  w  go to window'),
    row('  c  claude companion', '  q  quit'),
    '',
    row('  space → y  copy submenu', '  space → d  delete session'),
    row('  space → j  jump to pane', '  space → k  kill'),
    row('  space → q  quit', '  space → o  open dir'),
    row('  space → l  tail logs', '  space → /  search'),
    row('  space → a  spawn agent', '  space → m  msg agent'),
    row('  space → ?  help', '  space → 1-9  jump'),
    '',
    row('  y → p  session path', '  y → C  LLM context'),
    row('  y → l  logs content', '  y → s  session ID'),
  ];

  // Clamp overlay height to terminal height
  const overlayHeight = Math.min(lines.length + 4, rows - 2);

  return (
    <Box
      position="absolute"
      marginTop={Math.max(0, Math.floor((rows - overlayHeight) / 2))}
      marginLeft={marginLeft}
      width={HELP_WIDTH}
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
    >
      <Text bold color="yellow">{pad('  KEYBINDINGS  (esc or ? to close)')}</Text>
      <Text>{pad(' ')}</Text>
      {lines.map((line, i) => {
        if (line === '') return <Text key={i}>{pad(' ')}</Text>;
        return <Text key={i}>{pad(line)}</Text>;
      })}
      <Text>{pad(' ')}</Text>
    </Box>
  );
}
