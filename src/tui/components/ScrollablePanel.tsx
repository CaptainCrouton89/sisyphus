import React from 'react';
import { Box, Text } from 'ink';
import type { DetailLine } from '../lib/format.js';

interface Props {
  lines: DetailLine[];
  width: number;
  height: number;
  scrollOffset?: number;
  focused?: boolean;
  borderColor?: string;
}

/**
 * Generic scrollable panel that renders DetailLine[] with windowed scrolling.
 *
 * Key design choices:
 * - Uses positional keys (key={i}) so React reuses nodes during scroll
 * - Clamps scroll offset to valid range
 * - Shows scroll indicator when content overflows
 * - Pads short content to fill available height (prevents layout shift)
 */
export function ScrollablePanel({
  lines,
  width,
  height,
  scrollOffset = 0,
  focused = false,
  borderColor = 'gray',
}: Props) {
  const innerHeight = height - 2; // top + bottom border
  const hasOverflow = lines.length > innerHeight;
  const viewableHeight = hasOverflow ? innerHeight - 1 : innerHeight; // reserve 1 for indicator
  const maxScroll = Math.max(0, lines.length - viewableHeight);
  const effectiveOffset = Math.min(scrollOffset, maxScroll);
  const visible = lines.slice(effectiveOffset, effectiveOffset + viewableHeight);
  const padCount = Math.max(0, viewableHeight - visible.length);
  const scrollPct = maxScroll > 0 ? Math.round((effectiveOffset / maxScroll) * 100) : 100;

  return (
    <Box
      flexDirection="column"
      width={width}
      overflow="hidden"
      borderStyle="round"
      borderColor={focused ? 'blue' : borderColor}
      paddingX={1}
    >
      {visible.map((segs, i) => (
        <Text key={i}>
          {segs.map((s, j) => (
            <Text key={j} color={s.color} bold={s.bold} dimColor={s.dim} italic={s.italic}>
              {s.text}
            </Text>
          ))}
        </Text>
      ))}
      {padCount > 0 &&
        Array.from({ length: padCount }, (_, i) => (
          <Text key={`p${i}`}>{' '}</Text>
        ))}
      {hasOverflow && (
        <Text dimColor>
          {'  '}↕ {scrollPct}% · {lines.length} lines
        </Text>
      )}
    </Box>
  );
}
