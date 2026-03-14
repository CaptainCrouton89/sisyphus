import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type InputMode = 'navigate' | 'message' | 'new-session' | 'report-detail' | 'resume' | 'continue';

interface Props {
  mode: InputMode;
  onSubmitMessage: (text: string) => void;
  onSubmitNewSession: (task: string) => void;
  onSubmitResume: (message: string) => void;
  onSubmitContinue: (message: string) => void;
  onCancel: () => void;
}

const INPUT_MODES = new Set<InputMode>(['message', 'new-session', 'resume', 'continue']);

const PROMPTS: Partial<Record<InputMode, string>> = {
  message: 'message',
  'new-session': 'new session task',
  resume: 'resume instructions (optional)',
  continue: 'new direction (optional)',
};

export function InputBar({ mode, onSubmitMessage, onSubmitNewSession, onSubmitResume, onSubmitContinue, onCancel }: Props) {
  const [text, setText] = useState('');

  useInput(
    (input, key) => {
      if (key.return) {
        // resume/continue allow empty input
        if (mode === 'resume') {
          onSubmitResume(text.trim());
          setText('');
          return;
        }
        if (mode === 'continue') {
          onSubmitContinue(text.trim());
          setText('');
          return;
        }
        if (text.trim()) {
          if (mode === 'message') {
            onSubmitMessage(text.trim());
          } else if (mode === 'new-session') {
            onSubmitNewSession(text.trim());
          }
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
