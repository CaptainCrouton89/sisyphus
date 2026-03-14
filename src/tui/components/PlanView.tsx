import React from 'react';
import { Box, Text } from 'ink';
import { truncate, wrapText, stripFrontmatter, cleanMarkdown } from '../lib/format.js';

interface Props {
  content: string;
  maxLines: number;
  width: number;
}

interface PlanLine {
  text: string;
  bold?: boolean;
  dim?: boolean;
  color?: string;
}

function buildPlanLines(content: string, maxLines: number, width: number): PlanLine[] {
  const clean = stripFrontmatter(content);
  if (!clean.trim()) return [];

  const contentWidth = width - 4;
  const lines: PlanLine[] = [];
  const rawLines = clean.split('\n');

  for (const rawLine of rawLines) {
    if (lines.length >= maxLines) break;

    const trimmed = rawLine.trim();

    // Skip frontmatter artifacts
    if (trimmed === '---') continue;

    // Headers — bold, with level-based indentation
    const headerMatch = rawLine.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1]!.length;
      const headerText = cleanMarkdown(headerMatch[2]!);
      const indent = '  '.repeat(Math.max(0, level - 1));
      if (lines.length > 0) lines.push({ text: '' }); // breathing room before headers
      lines.push({
        text: `    ${indent}${headerText}`,
        bold: true,
        color: level <= 2 ? 'white' : undefined,
      });
      continue;
    }

    // Empty lines — pass through (but collapse multiples)
    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1]!.text !== '') {
        lines.push({ text: '' });
      }
      continue;
    }

    // Numbered list items — clean markdown, preserve numbering
    const listMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (listMatch) {
      const cleaned = `${listMatch[1]}. ${cleanMarkdown(listMatch[2]!)}`;
      const wrapped = wrapText(cleaned, contentWidth - 6);
      for (const wl of wrapped) {
        if (lines.length >= maxLines) break;
        lines.push({ text: `    ${wl}`, dim: true });
      }
      continue;
    }

    // Bullet items
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
      const cleaned = `· ${cleanMarkdown(bulletMatch[1]!)}`;
      const wrapped = wrapText(cleaned, contentWidth - 6);
      for (const wl of wrapped) {
        if (lines.length >= maxLines) break;
        lines.push({ text: `    ${wl}`, dim: true });
      }
      continue;
    }

    // Regular content — clean and wrap
    const cleaned = cleanMarkdown(trimmed);
    const wrapped = wrapText(cleaned, contentWidth - 4);
    for (const wl of wrapped) {
      if (lines.length >= maxLines) break;
      lines.push({ text: `    ${wl}`, dim: true });
    }
  }

  // Truncation indicator
  const totalContentLines = rawLines.filter((l) => l.trim()).length;
  if (lines.length >= maxLines && totalContentLines > maxLines) {
    lines[lines.length - 1] = { text: '    … [p] open in editor', dim: true };
  }

  return lines;
}

export function PlanView({ content, maxLines, width }: Props) {
  const lines = buildPlanLines(content, maxLines, width);

  if (lines.length === 0) {
    return (
      <Box>
        <Text dimColor italic>    No plan yet</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} bold={line.bold} dimColor={line.dim} color={line.color}>
          {line.text}
        </Text>
      ))}
    </Box>
  );
}
