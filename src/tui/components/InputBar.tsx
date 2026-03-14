import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

export type InputMode = 'navigate' | 'message' | 'new-session' | 'report-detail' | 'resume' | 'continue' | 'rollback';

interface Props {
  mode: InputMode;
  defaultText?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

const INPUT_MODES = new Set<InputMode>(['message', 'new-session', 'resume', 'continue', 'rollback']);

const PROMPTS: Partial<Record<InputMode, string>> = {
  message: 'message',
  'new-session': 'new session task',
  resume: 'resume instructions (optional)',
  continue: 'new direction (optional)',
  rollback: 'cycle number',
};

const OPTIONAL_INPUT = new Set<InputMode>(['resume', 'continue']);

export function InputBar({ mode, defaultText, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const prevMode = useRef(mode);

  // Pre-fill text when entering a mode with defaultText
  useEffect(() => {
    if (mode !== prevMode.current && INPUT_MODES.has(mode) && defaultText) {
      setText(defaultText);
    }
    prevMode.current = mode;
  }, [mode, defaultText]);

  useInput(
    (input, key) => {
      if (key.return) {
        if (OPTIONAL_INPUT.has(mode) || text.trim()) {
          onSubmit(text.trim());
          setText('');
        }
        return;
      }
      if (key.escape) {
        setText('');
        onCancel();
        return;
      }
      if (key.backspace || key.delete) {
        setText((t) => t.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setText((t) => t + input);
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

  if (mode === 'report-detail') {
    return null;
  }

  const prompt = PROMPTS[mode] ?? mode;

  return (
    <Box paddingX={1}>
      <Text color="yellow">{prompt} &gt; </Text>
      <Text>{text}</Text>
      <Text dimColor>█</Text>
      <Text dimColor>  (enter to send, esc to cancel)</Text>
    </Box>
  );
}
