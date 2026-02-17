import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

interface SessionSummary {
  id: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: '\x1b[32m',
  paused: '\x1b[33m',
  completed: '\x1b[36m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List all sessions')
    .action(async () => {
      const request: Request = { type: 'list' };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessions = (response.data?.sessions ?? []) as SessionSummary[];
        if (sessions.length === 0) {
          console.log('No sessions');
          return;
        }
        for (const s of sessions) {
          const color = STATUS_COLORS[s.status] ?? '';
          const status = `${color}${s.status}${RESET}`;
          const agents = `${DIM}${s.agentCount} agent(s)${RESET}`;
          console.log(`  ${BOLD}${s.id}${RESET}  ${status}  ${agents}  ${s.task}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
