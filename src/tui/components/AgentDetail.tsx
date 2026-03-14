import React from 'react';
import { Box, Text } from 'ink';
import type { Agent } from '../../shared/types.js';
import type { ReportBlock } from '../lib/reports.js';
import {
  formatDuration,
  formatTime,
  statusColor,
  agentStatusIcon,
  wrapText,
  cleanMarkdown,
} from '../lib/format.js';

interface Props {
  agent: Agent;
  reportBlocks?: ReportBlock[];
  width: number;
  height: number;
}

export function AgentDetail({ agent, reportBlocks, width, height }: Props) {
  const contentWidth = width - 4;
  const dur = formatDuration(agent.spawnedAt, agent.completedAt);
  const icon = agentStatusIcon(agent.status);
  const color = statusColor(agent.status);
  const nameLabel = agent.name !== agent.id ? agent.name : agent.agentType;

  // Dynamic line budget
  const metaLines = 3; // header + status + blank
  const alertLines = (agent.killedReason ? 1 : 0) + (agent.mergeStatus === 'conflict' && agent.mergeDetails ? 2 : 0);
  const timestampLines = 1 + (agent.completedAt ? 1 : 0) + (agent.paneId ? 1 : 0) + (agent.worktreePath ? 1 : 0) + (agent.branchName ? 1 : 0) + 2; // +header +blank
  const reportHeader = agent.reports.length > 0 ? 2 : 0; // header + blank
  const fixedLines = metaLines + alertLines + timestampLines + reportHeader + 4; // borders

  const hasResolvedReports = reportBlocks && reportBlocks.length > 0;
  const availableForContent = Math.max(6, height - fixedLines);

  // Split: instruction gets 40% when reports exist, otherwise most of it
  let instrMaxLines: number;
  let reportMaxLines: number;
  if (hasResolvedReports) {
    instrMaxLines = Math.max(4, Math.floor(availableForContent * 0.35));
    reportMaxLines = Math.max(4, availableForContent - instrMaxLines);
  } else {
    const summaryLines = agent.reports.length;
    instrMaxLines = Math.max(4, availableForContent - summaryLines - 1);
    reportMaxLines = summaryLines;
  }

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      {/* Header */}
      <Text bold>
        {' '}<Text color={color}>{icon}</Text> {agent.id} · {nameLabel}
      </Text>
      <Box>
        <Text dimColor>{'  '}</Text>
        <Text color={color}>{agent.status}</Text>
        <Text dimColor>
          {' · '}{dur} · {agent.agentType}
          {agent.mergeStatus ? ` · merge: ${agent.mergeStatus}` : ''}
        </Text>
      </Box>

      {/* Alerts */}
      {agent.killedReason && (
        <Text color="red">{'  '}⚠ {agent.killedReason}</Text>
      )}
      {agent.mergeStatus === 'conflict' && agent.mergeDetails && (
        <Box flexDirection="column">
          {wrapText(agent.mergeDetails, contentWidth - 6).map((line, i) => (
            <Text key={i} color="red">{'  '}⚠ {line}</Text>
          ))}
        </Box>
      )}

      {/* Instruction */}
      <Text>{' '}</Text>
      <Text color="white" bold>{'  '}▎ INSTRUCTION</Text>
      {wrapText(agent.instruction, contentWidth - 6)
        .slice(0, instrMaxLines)
        .map((line, i) => (
          <Text key={i} dimColor>{'    '}{line}</Text>
        ))}

      {/* Reports */}
      {agent.reports.length > 0 && (
        <>
          <Text>{' '}</Text>
          <Text color="cyan" bold>{'  '}▎ REPORTS ({agent.reports.length})</Text>
          {hasResolvedReports ? (
            <Box flexDirection="column">
              {reportBlocks.slice(0, Math.min(reportBlocks.length, 3)).map((block, i) => {
                const badge = block.type === 'final' ? 'FINAL' : 'UPDATE';
                const badgeColor = block.type === 'final' ? 'cyan' : 'yellow';
                const linesPerReport = Math.max(2, Math.floor(reportMaxLines / Math.min(reportBlocks.length, 3)) - 2);
                return (
                  <Box key={i} flexDirection="column">
                    {i > 0 && <Text>{' '}</Text>}
                    <Box>
                      <Text>{'    '}</Text>
                      <Text color={badgeColor} bold={block.type === 'final'}>{badge}</Text>
                      <Text dimColor> {formatTime(block.timestamp)}</Text>
                    </Box>
                    {wrapText(cleanMarkdown(block.content.trim()), contentWidth - 10)
                      .slice(0, linesPerReport)
                      .map((line, j) => (
                        <Text key={j} dimColor>{'      '}{line}</Text>
                      ))}
                  </Box>
                );
              })}
            </Box>
          ) : (
            agent.reports.slice(0, reportMaxLines).map((report, i) => {
              const badge = report.type === 'final' ? 'FINAL' : 'UPDATE';
              const badgeColor = report.type === 'final' ? 'cyan' : 'yellow';
              return (
                <Box key={i}>
                  <Text>{'    '}</Text>
                  <Text color={badgeColor} bold={report.type === 'final'}>{badge}</Text>
                  <Text dimColor> {formatTime(report.timestamp)}  {report.summary.split('\n')[0]}</Text>
                </Box>
              );
            })
          )}
        </>
      )}

      {/* Metadata */}
      <Text>{' '}</Text>
      <Text color="gray" bold>{'  '}▎ META</Text>
      <Text dimColor>{'    '}Spawned: {formatTime(agent.spawnedAt)}</Text>
      {agent.completedAt && (
        <Text dimColor>{'    '}Completed: {formatTime(agent.completedAt)}</Text>
      )}
      {agent.paneId && <Text dimColor>{'    '}Pane: {agent.paneId}</Text>}
      {agent.worktreePath && <Text dimColor>{'    '}Worktree: {agent.worktreePath}</Text>}
      {agent.branchName && <Text dimColor>{'    '}Branch: {agent.branchName}</Text>}
    </Box>
  );
}
