import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, Agent, Task } from '../../shared/types.js';

const STATUS_COLORS: Record<string, string> = {
  active: '\x1b[32m',    // green
  paused: '\x1b[33m',    // yellow
  completed: '\x1b[36m', // cyan
  running: '\x1b[32m',   // green
  killed: '\x1b[31m',    // red
  crashed: '\x1b[31m',   // red
  lost: '\x1b[90m',      // gray
  pending: '\x1b[90m',   // gray
  in_progress: '\x1b[33m', // yellow
  complete: '\x1b[32m',  // green
  blocked: '\x1b[31m',   // red
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function colorize(text: string, status: string): string {
  const color = STATUS_COLORS[status] ?? '';
  return `${color}${text}${RESET}`;
}

function formatAgent(agent: Agent): string {
  const status = colorize(agent.status, agent.status);
  const name = `${BOLD}${agent.name}${RESET}`;
  const type = `${DIM}(${agent.agentType})${RESET}`;
  let line = `    ${agent.id} ${name} ${type} — ${status}`;
  if (agent.report) {
    line += `\n      Report: ${agent.report}`;
  }
  if (agent.killedReason) {
    line += `\n      Reason: ${agent.killedReason}`;
  }
  return line;
}

function formatTask(task: Task): string {
  const status = colorize(task.status, task.status);
  return `    ${task.id}: ${task.description} [${status}]`;
}

function printSession(session: Session): void {
  const status = colorize(session.status, session.status);
  console.log(`\n${BOLD}Session: ${session.id}${RESET}`);
  console.log(`  Status: ${status}`);
  console.log(`  Task: ${session.task}`);
  console.log(`  CWD: ${session.cwd}`);
  console.log(`  Created: ${session.createdAt}`);
  console.log(`  Orchestrator cycles: ${session.orchestratorCycles.length}`);

  if (session.tasks.length > 0) {
    console.log(`\n  ${BOLD}Tasks:${RESET}`);
    for (const task of session.tasks) {
      console.log(formatTask(task));
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
