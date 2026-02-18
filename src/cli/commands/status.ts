import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, Agent, OrchestratorCycle } from '../../shared/types.js';

const STATUS_COLORS: Record<string, string> = {
  active: '\x1b[32m',    // green
  paused: '\x1b[33m',    // yellow
  completed: '\x1b[36m', // cyan
  running: '\x1b[32m',   // green
  killed: '\x1b[31m',    // red
  crashed: '\x1b[31m',   // red
  lost: '\x1b[90m',      // gray
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorize(text: string, status: string): string {
  const color = STATUS_COLORS[status] ?? '';
  return `${color}${text}${RESET}`;
}

function formatDuration(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const totalSeconds = Math.floor((end - start) / 1000);
  if (totalSeconds < 0) return '0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatAgent(agent: Agent): string {
  const status = colorize(agent.status, agent.status);
  const name = `${BOLD}${agent.name}${RESET}`;
  const type = `${DIM}(${agent.agentType})${RESET}`;
  const duration = formatDuration(agent.spawnedAt, agent.completedAt);
  let line = `    ${agent.id} ${name} ${type} — ${status} ${DIM}(${duration})${RESET}`;
  if (agent.reports.length > 0) {
    for (const r of agent.reports) {
      const label = r.type === 'final' ? 'Final' : 'Update';
      line += `\n      ${label}: ${r.summary}`;
    }
  }
  if (agent.killedReason) {
    line += `\n      Reason: ${agent.killedReason}`;
  }
  return line;
}

function formatCycle(cycle: OrchestratorCycle): string {
  const duration = cycle.completedAt
    ? ` ${DIM}(${formatDuration(cycle.timestamp, cycle.completedAt)})${RESET}`
    : ` ${DIM}(running)${RESET}`;
  const agents = cycle.agentsSpawned.length > 0
    ? ` — agents: ${cycle.agentsSpawned.join(', ')}`
    : '';
  return `    Cycle ${cycle.cycle}${duration}${agents}`;
}

function printSession(session: Session): void {
  const status = colorize(session.status, session.status);
  const sessionDuration = formatDuration(session.createdAt, session.completedAt);
  console.log(`\n${BOLD}Session: ${session.id}${RESET}`);
  console.log(`  Status: ${status}`);
  console.log(`  Task: ${session.task}`);
  console.log(`  CWD: ${session.cwd}`);
  console.log(`  Created: ${session.createdAt}`);
  console.log(`  Duration: ${sessionDuration}${session.completedAt ? '' : ' (ongoing)'}`);
  console.log(`  Orchestrator cycles: ${session.orchestratorCycles.length}`);

  if (session.orchestratorCycles.length > 0) {
    console.log(`\n  ${BOLD}Cycles:${RESET}`);
    for (const cycle of session.orchestratorCycles) {
      console.log(formatCycle(cycle));
    }
  }

  if (session.agents.length > 0) {
    console.log(`\n  ${BOLD}Agents:${RESET}`);
    for (const agent of session.agents) {
      console.log(formatAgent(agent));
    }
  }
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show session status')
    .argument('[session-id]', 'Session ID (defaults to SISYPHUS_SESSION_ID env)')
    .action(async (sessionIdArg?: string) => {
      const sessionId = sessionIdArg ?? process.env.SISYPHUS_SESSION_ID;

      const request: Request = { type: 'status', sessionId };
      const response = await sendRequest(request);
      if (response.ok) {
        const session = response.data?.session as Session | undefined;
        if (session) {
          printSession(session);
        } else {
          console.log('No session found');
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
