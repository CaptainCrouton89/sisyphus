import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';

interface Props {
  mode: InputMode;
  detailFocused?: boolean;
  logsFocused?: boolean;
  showLogs?: boolean;
}

export function StatusLine({ mode, detailFocused = false, logsFocused = false, showLogs = false }: Props) {
  if (mode === 'report-detail') {
    return null;
  }

  if (mode === 'leader') {
    return (
      <Box paddingX={1}>
        <Text color="magenta" bold>LEADER</Text>
        <Text dimColor>  press a command key or [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode === 'copy-menu') {
    return (
      <Box paddingX={1}>
        <Text color="cyan" bold>COPY</Text>
        <Text dimColor>  [p] path  [C] context  [l] logs  [s] session ID  [esc] cancel</Text>
      </Box>
    );
  }

  if (mode === 'help') {
    return (
      <Box paddingX={1}>
        <Text color="yellow" bold>HELP</Text>
        <Text dimColor>  [esc] or [?] to dismiss</Text>
      </Box>
    );
  }

  if (mode === 'delete-confirm') {
    return (
      <Box paddingX={1}>
        <Text color="red" bold>DELETE</Text>
        <Text dimColor>  type &apos;yes&apos; to confirm, [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode === 'spawn-agent') {
    return (
      <Box paddingX={1}>
        <Text color="green" bold>SPAWN</Text>
        <Text dimColor>  enter agent instruction, [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode === 'search') {
    return (
      <Box paddingX={1}>
        <Text color="blue" bold>SEARCH</Text>
        <Text dimColor>  type to filter, enter to apply, [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode === 'message-agent') {
    return (
      <Box paddingX={1}>
        <Text color="cyan" bold>MESSAGE</Text>
        <Text dimColor>  enter message for agent, [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode === 'shell-command') {
    return (
      <Box paddingX={1}>
        <Text color="magenta" bold>SHELL</Text>
        <Text dimColor>  enter command, [esc] to cancel</Text>
      </Box>
    );
  }

  if (mode !== 'navigate') {
    return (
      <Box paddingX={1}>
        <Text dimColor>[enter] send  [esc] cancel</Text>
      </Box>
    );
  }

  if (logsFocused) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          [↑↓] scroll  [←/tab] back  [l]ogs hide
          {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [q]uit
        </Text>
      </Box>
    );
  }

  if (detailFocused) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          [↑↓] scroll  [←/tab] back to tree  [l]{showLogs ? 'ogs hide' : 'ogs show'}
          {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [q]uit
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>
        [↑↓] navigate  [←→] collapse/expand  [space] leader  [tab] detail  [l]{showLogs ? 'ogs hide' : 'ogs show'}
        {'  '}[m]sg  [k]ill  [g]oal  [n]ew  [p]lan  [w]indow  [R]esume  [x] restart  [b]ack  [q]uit
      </Text>
    </Box>
  );
}
