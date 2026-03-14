import React from 'react';
import { Box, Text } from 'ink';
import type { OrchestratorCycle } from '../../shared/types.js';
import { formatDuration } from '../lib/format.js';

interface Props {
  cycles: OrchestratorCycle[];
  maxCycles: number;
}

export function CycleHistory({ cycles, maxCycles }: Props) {
  if (cycles.length === 0) {
    return (
      <Box>
        <Text dimColor italic>  No cycles yet</Text>
      </Box>
    );
  }

  const recent = cycles.slice(-maxCycles).reverse();

  return (
    <Box flexDirection="column">
      {recent.map((cycle) => {
        const duration = cycle.completedAt
          ? formatDuration(cycle.timestamp, cycle.completedAt)
          : 'running';
        const n = cycle.agentsSpawned.length;
        const mode = cycle.mode ? `${cycle.mode}` : '';

        return (
          <Text key={cycle.cycle} dimColor>
            {'  '}C{cycle.cycle}: {n} agent{n !== 1 ? 's' : ''} · {duration}
            {mode ? ` · ${mode}` : ''}
          </Text>
        );
      })}
    </Box>
  );
}
