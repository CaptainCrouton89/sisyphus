import React from 'react';
import { Box, Text } from 'ink';
import type { InputMode } from './InputBar.js';
import type { TreeNodeType } from '../types/tree.js';

interface Props {
  mode: InputMode;
  detailFocused?: boolean;
  logsFocused?: boolean;
  showLogs?: boolean;
  cursorNodeType?: TreeNodeType;
}

export function StatusLine({ mode, detailFocused = false, logsFocused = false, showLogs = false, cursorNodeType }: Props) {
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
        <Text bold>[jk/↑↓]</Text><Text dimColor> scroll  </Text>
        <Text bold>[h/←/tab]</Text><Text dimColor> back  </Text>
        <Text bold>[t]</Text><Text dimColor>oggle logs  </Text>
        <Text dimColor>│ </Text>
        <Text bold>[m]</Text><Text dimColor>sg  </Text>
        <Text bold>[g]</Text><Text dimColor>oal  </Text>
        <Text bold>[n]</Text><Text dimColor>ew  </Text>
        <Text bold>[p]</Text><Text dimColor>lan  </Text>
        <Text bold>[w]</Text><Text dimColor>indow  </Text>
        <Text bold>[R]</Text><Text dimColor>esume  </Text>
        <Text bold>[q]</Text><Text dimColor>uit</Text>
      </Box>
    );
  }

  if (detailFocused) {
    return (
      <Box paddingX={1}>
        <Text bold>[jk/↑↓]</Text><Text dimColor> scroll  </Text>
        <Text bold>[h/←/tab]</Text><Text dimColor> back  </Text>
        <Text bold>[t]</Text><Text dimColor>oggle logs  </Text>
        <Text dimColor>│ </Text>
        <Text bold>[m]</Text><Text dimColor>sg  </Text>
        <Text bold>[g]</Text><Text dimColor>oal  </Text>
        <Text bold>[n]</Text><Text dimColor>ew  </Text>
        <Text bold>[p]</Text><Text dimColor>lan  </Text>
        <Text bold>[w]</Text><Text dimColor>indow  </Text>
        <Text bold>[R]</Text><Text dimColor>esume  </Text>
        <Text bold>[q]</Text><Text dimColor>uit</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text bold>[hjkl]</Text><Text dimColor> navigate  </Text>
      <Text dimColor>│ </Text>
      {cursorNodeType === 'context-file' && <><Text bold>[e]</Text><Text dimColor>dit  </Text><Text bold>[⏎]</Text><Text dimColor> open  </Text></>}
      <Text bold>[space]</Text><Text dimColor> leader  </Text>
      <Text bold>[tab]</Text><Text dimColor> detail  </Text>
      <Text bold>[t]</Text><Text dimColor>oggle logs  </Text>
      <Text dimColor>│ </Text>
      <Text bold>[m]</Text><Text dimColor>sg  </Text>
      <Text bold>[n]</Text><Text dimColor>ew  </Text>
      <Text bold>[R]</Text><Text dimColor>esume  </Text>
      <Text bold>[q]</Text><Text dimColor>uit</Text>
    </Box>
  );
}
