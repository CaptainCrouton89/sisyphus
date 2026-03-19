import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { CycleLog } from '../hooks/usePolling.js';
import { ScrollablePanel } from './ScrollablePanel.js';
import {
  stripFrontmatter,
  cleanMarkdown,
  wrapText,
  seg,
  type DetailLine,
} from '../lib/format.js';

interface Props {
  cycleLogs: CycleLog[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
}

function buildLines(cycleLogs: CycleLog[], width: number): DetailLine[] {
  const lines: DetailLine[] = [];
  const contentWidth = width - 4;

  if (cycleLogs.length === 0) {
    return lines;
  }

  // Most recent first
  const sorted = [...cycleLogs].sort((a, b) => b.cycle - a.cycle);

  for (const { cycle, content } of sorted) {
    lines.push([seg(`  Cycle ${cycle}`, { color: 'blue', bold: true })]);

    const cleaned = cleanMarkdown(stripFrontmatter(content)).trim();
    if (cleaned) {
      for (const rawLine of cleaned.split('\n')) {
        const wrapped = wrapText(rawLine, contentWidth - 2);
        for (const wl of wrapped) {
          lines.push([seg(`    ${wl}`, { dim: true })]);
        }
      }
    }

    lines.push([seg(' ')]);
  }

  return lines;
}

export function LogsPanel({
  cycleLogs,
  width,
  height,
  scrollOffset = 0,
  focused = false,
}: Props) {
  if (cycleLogs.length === 0) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="round"
        borderColor={focused ? 'blue' : 'gray'}
        paddingX={1}
        justifyContent="center"
        alignItems="center"
      >
        <Text dimColor>No logs</Text>
      </Box>
    );
  }

  const allLines = useMemo(
    () => buildLines(cycleLogs, width),
    [cycleLogs, width],
  );

  return (
    <ScrollablePanel
      lines={allLines}
      width={width}
      height={height}
      scrollOffset={scrollOffset}
      focused={focused}
    />
  );
}
