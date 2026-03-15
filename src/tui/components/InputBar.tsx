import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

export type InputMode =
  | 'navigate'
  | 'message'
  | 'new-session'
  | 'report-detail'
  | 'resume'
  | 'continue'
  | 'rollback'
  | 'leader'
  | 'copy-menu'
  | 'delete-confirm'
  | 'spawn-agent'
  | 'search'
  | 'message-agent'
  | 'shell-command'
  | 'help';

interface Props {
  mode: InputMode;
  defaultText?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

const INPUT_MODES = new Set<InputMode>([
  'resume',
  'continue',
  'rollback',
  'delete-confirm',
  'spawn-agent',
  'search',
  'message-agent',
  'shell-command',
]);

const PROMPTS: Partial<Record<InputMode, string>> = {
  resume: 'resume instructions (optional)',
  continue: 'new direction (optional)',
  rollback: 'cycle number',
  'delete-confirm': "type 'yes' to confirm delete:",
  'spawn-agent': 'agent instruction:',
  search: 'filter:',
  'message-agent': 'message:',
  'shell-command': '$ ',
};

const OPTIONAL_INPUT = new Set<InputMode>(['resume', 'continue', 'search']);

export function InputBar({ mode, defaultText, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const prevMode = useRef(mode);

  // Pre-fill text when entering a mode with defaultText; reset cursor on mode change
  useEffect(() => {
    if (mode !== prevMode.current) {
      if (INPUT_MODES.has(mode) && defaultText) {
        setText(defaultText);
        setCursorPos(defaultText.length);
      } else {
        setText('');
        setCursorPos(0);
      }
    }
    prevMode.current = mode;
  }, [mode, defaultText]);

  useInput(
    (input, key) => {
      if (key.return) {
        if (OPTIONAL_INPUT.has(mode) || text.trim()) {
          onSubmit(text.trim());
          setText('');
          setCursorPos(0);
        }
        return;
      }
      if (key.escape) {
        setText('');
        setCursorPos(0);
        onCancel();
        return;
      }
      if (key.leftArrow) {
        setCursorPos((p) => Math.max(0, p - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos((p) => Math.min(text.length, p + 1));
        return;
      }
      if (key.ctrl && input === 'a') {
        setCursorPos(0);
        return;
      }
      if (key.ctrl && input === 'e') {
        setCursorPos(text.length);
        return;
      }
      if (key.ctrl && input === 'k') {
        setText((t) => t.slice(0, cursorPos));
        // cursorPos stays the same (now at end)
        return;
      }
      if (key.ctrl && input === 'u') {
        setText((t) => t.slice(cursorPos));
        setCursorPos(0);
        return;
      }
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setText((t) => t.slice(0, cursorPos - 1) + t.slice(cursorPos));
          setCursorPos((p) => p - 1);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setText((t) => t.slice(0, cursorPos) + input + t.slice(cursorPos));
        setCursorPos((p) => p + input.length);
      }
    },
    { isActive: INPUT_MODES.has(mode) },
  );

  if (mode === 'navigate') {
    return (
      <Box paddingX={1}>
        <Text dimColor>Press [m] to message orchestrator, [n] for new session</Text>
      </Box>
    );
  }

  if (mode === 'report-detail' || mode === 'leader' || mode === 'copy-menu' || mode === 'help' || !INPUT_MODES.has(mode)) {
    return null;
  }

  const prompt = PROMPTS[mode] ?? mode;

  return (
    <Box paddingX={1}>
      <Text color="yellow">{prompt} &gt; </Text>
      <Text>{text.slice(0, cursorPos)}</Text>
      <Text inverse>{cursorPos < text.length ? text[cursorPos] : ' '}</Text>
      <Text>{text.slice(cursorPos + 1)}</Text>
      <Text dimColor>  (enter to send, esc to cancel)</Text>
    </Box>
  );
}
