import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, Agent, OrchestratorCycle } from '../../shared/types.js';
import { computeActiveTimeMs } from '../../shared/utils.js';
import { roadmapPath } from '../../shared/paths.js';
import { formatDuration, statusColor } from '../../shared/format.js';

const COLOR_CODES: Record<string, string> = {
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[37m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorize(text: string, status: string): string {
  const colorName = statusColor(status);
  const code = COLOR_CODES[colorName];
  if (!code) return `${text}\x1b[0m`;
  return `${code}${text}\x1b[0m`;
}

function inferOrchestratorPhase(session: Session): string {
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return 'planning';
  const lastCycle = cycles[cycles.length - 1];

  if (!lastCycle.completedAt) {
    // Orchestrator pane is alive
    const elapsed = Date.now() - new Date(lastCycle.timestamp).getTime();
    if (elapsed < 5000 || lastCycle.agentsSpawned.length === 0) return 'planning';
    return 'spawning';
  } else {
    // Orchestrator yielded
    const runningAgents = session.agents.filter(
      a => lastCycle.agentsSpawned.includes(a.id) && a.status === 'running'
    );
    if (runningAgents.length > 0) {
      return `waiting on ${runningAgents.map(a => a.id).join(', ')}`;
    }
    return 'starting';
  }
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

function formatCycle(cycle: OrchestratorCycle, phase?: string): string {
  let duration: string;
  if (cycle.completedAt) {
    duration = ` ${DIM}(${formatDuration(cycle.timestamp, cycle.completedAt)})${RESET}`;
  } else {
    const elapsed = formatDuration(cycle.timestamp, null);
    duration = ` ${DIM}(running, ${elapsed})${RESET}`;
  }
  const agents = cycle.agentsSpawned.length > 0
    ? ` — agents: ${cycle.agentsSpawned.join(', ')}`
    : '';
  const phaseStr = phase ? ` — orchestrator: ${phase}` : '';
  return `    Cycle ${cycle.cycle}${duration}${agents}${phaseStr}`;
}

function computeLastActivity(session: Session): Date | null {
  const timestamps: number[] = [];

  for (const cycle of session.orchestratorCycles) {
    timestamps.push(new Date(cycle.timestamp).getTime());
    if (cycle.completedAt) timestamps.push(new Date(cycle.completedAt).getTime());
  }

  for (const agent of session.agents) {
    timestamps.push(new Date(agent.spawnedAt).getTime());
    if (agent.completedAt) timestamps.push(new Date(agent.completedAt).getTime());
    for (const r of agent.reports) {
      timestamps.push(new Date(r.timestamp).getTime());
    }
  }

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function readRoadmapTodos(cwd: string, sessionId: string): string[] {
  try {
    const content = readFileSync(roadmapPath(cwd, sessionId), 'utf8');
    return content
      .split('\n')
      .filter(line => /^\s*- \[ \]/.test(line))
      .map(line => line.replace(/^\s*- \[ \]\s*/, ''))
      .slice(0, 5);
  } catch {
    return [];
  }
}

function printSession(session: Session): void {
  const status = colorize(session.status, session.status);
  const sessionDuration = formatDuration(session.createdAt, session.completedAt);
  console.log(`\n${BOLD}Session: ${session.id}${RESET}`);
  console.log(`  Status: ${status}`);
  console.log(`  Task: ${session.task}`);
  if (session.context) {
    const truncated = session.context.length > 120 ? session.context.slice(0, 120) + '...' : session.context;
    console.log(`  Context: ${truncated}`);
  }
  console.log(`  CWD: ${session.cwd}`);
  console.log(`  Created: ${session.createdAt}`);
  const activeTime = formatDuration(computeActiveTimeMs(session));
  console.log(`  Duration: ${sessionDuration}${session.completedAt ? '' : ' (ongoing)'} (${activeTime} active)`);

  const lastActivity = computeLastActivity(session);
  if (lastActivity) {
    console.log(`  Last activity: ${formatDuration(Date.now() - lastActivity.getTime())} ago`);
  }

  console.log(`  Orchestrator cycles: ${session.orchestratorCycles.length}`);

  // Active agents block
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length > 0) {
    console.log(`\n${BOLD}Active agents (${runningAgents.length}):${RESET}`);
    for (const agent of runningAgents) {
      const name = `${BOLD}${agent.name}${RESET}`;
      const type = `${DIM}(${agent.agentType})${RESET}`;
      const duration = formatDuration(agent.spawnedAt, null);
      console.log(`  ${agent.id}  ${name}  ${type}  running ${duration}`);
    }
  }

  // Roadmap pending todos
  const todos = readRoadmapTodos(session.cwd, session.id);
  if (todos.length > 0) {
    console.log(`\n${BOLD}Remaining (${todos.length} unchecked):${RESET}`);
    for (const todo of todos) {
      console.log(`  - ${todo}`);
    }
  }

  if (session.orchestratorCycles.length > 0) {
    console.log(`\n  ${BOLD}Cycles:${RESET}`);
    const cycles = session.orchestratorCycles;
    for (let i = 0; i < cycles.length; i++) {
      const isLast = i === cycles.length - 1;
      const phase = isLast && session.status === 'active' ? inferOrchestratorPhase(session) : undefined;
      console.log(formatCycle(cycles[i], phase));
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
