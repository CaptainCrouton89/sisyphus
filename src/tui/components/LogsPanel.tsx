import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { CycleLog } from '../hooks/usePolling.js';
import { stripFrontmatter, cleanMarkdown, wrapText } from '../lib/format.js';

interface Props {
  cycleLogs: CycleLog[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
}

type Seg = {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
};

type DetailLine = Seg[];

function seg(text: string, opts?: Partial<Omit<Seg, 'text'>>): Seg {
  return { text, ...opts };
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

  const innerHeight = height - 2;
  const hasOverflow = allLines.length > innerHeight;
  const viewableHeight = hasOverflow ? innerHeight - 1 : innerHeight;
  const maxScroll = Math.max(0, allLines.length - viewableHeight);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const visible = allLines.slice(effectiveOffset, effectiveOffset + viewableHeight);
  const padCount = viewableHeight - visible.length;
  const scrollPct =
    maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'blue' : 'gray'}
      paddingX={1}
    >
      {visible.map((line, i) => (
        <Text key={effectiveOffset + i}>
          {line.map((s, j) => (
            <Text key={j} color={s.color} bold={s.bold} dimColor={s.dim}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
      {padCount > 0 &&
        Array.from({ length: padCount }, (_, i) => (
          <Text key={`pad-${i}`}>{' '}</Text>
        ))}
      {hasOverflow && (
        <Text dimColor>
          {'  '}[tab] scroll · {scrollPct}% · {allLines.length} lines
        </Text>
      )}
    </Box>
  );
}
