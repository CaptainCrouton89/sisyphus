import React from 'react';
import { Box, Text } from 'ink';
import { truncate } from '../lib/format.js';

interface Props {
  content: string;
  maxLines: number;
  width: number;
}

interface Header {
  level: number;
  text: string;
}

function parseHeaders(content: string): Header[] {
  const headers: Header[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headers.push({
        level: match[1]!.length,
        text: match[2]!
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/~~(.+?)~~/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .trim(),
      });
    }
  }
  return headers;
}

export function PlanView({ content, maxLines, width }: Props) {
  if (!content.trim()) {
    return (
      <Box>
        <Text dimColor italic>  No plan yet</Text>
      </Box>
    );
  }

  const headers = parseHeaders(content);

  if (headers.length === 0) {
    // Fallback: first few non-empty lines
    const rawLines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, maxLines);

    return (
      <Box flexDirection="column">
        {rawLines.map((line, i) => (
          <Text key={i} dimColor>  {truncate(line, width - 4)}</Text>
        ))}
      </Box>
    );
  }

  // Find the minimum heading level to normalize indentation
  const minLevel = Math.min(...headers.map((h) => h.level));
  const visible = headers.slice(0, maxLines);
  const remaining = headers.length - visible.length;

  return (
    <Box flexDirection="column">
      {visible.map((h, i) => {
        const indent = '  '.repeat(h.level - minLevel);
        const isTopLevel = h.level === minLevel;
        const maxText = width - 4 - indent.length - 2;

        return (
          <Text key={i} bold={isTopLevel} dimColor={!isTopLevel}>
            {'  '}{indent}{isTopLevel ? '▸' : '·'} {truncate(h.text, maxText)}
          </Text>
        );
      })}
      {remaining > 0 && (
        <Text dimColor>  … {remaining} more sections  [p] open in editor</Text>
      )}
    </Box>
  );
}
