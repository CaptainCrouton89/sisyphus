import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { basename } from 'node:path';

interface SessionSummary {
  id: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
  cwd?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: '\x1b[32m',
  paused: '\x1b[33m',
  completed: '\x1b[36m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function truncateTask(task: string, max: number): string {
  if (task.length <= max) return task;
  return task.slice(0, max - 1) + '…';
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List sessions (defaults to current project)')
    .option('-a, --all', 'Show sessions from all projects')
    .action(async (opts: { all?: boolean }) => {
      const cwd = process.cwd();
      const request: Request = { type: 'list', cwd, all: opts.all };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessions = (response.data?.sessions ?? []) as SessionSummary[];
        const totalCount = response.data?.totalCount as number | undefined;
        const filtered = response.data?.filtered as boolean | undefined;

        if (sessions.length === 0) {
          if (filtered && totalCount && totalCount > 0) {
            console.log(`No sessions in this project. ${totalCount} session(s) in other projects.`);
            console.log(`${DIM}Run ${RESET}sisyphus list --all${DIM} to show all.${RESET}`);
          } else {
            console.log('No sessions');
          }
          return;
        }

        for (const s of sessions) {
          const color = STATUS_COLORS[s.status] ?? '';
          const status = `${color}${s.status}${RESET}`;
          const agents = `${DIM}${s.agentCount} agent(s)${RESET}`;
          const task = truncateTask(s.task, 60);
          const cwdLabel = opts.all && s.cwd ? `  ${DIM}${basename(s.cwd)}${RESET}` : '';
          console.log(`  ${BOLD}${s.id}${RESET}  ${status}  ${agents}  ${task}${cwdLabel}`);
        }

        if (filtered && totalCount && totalCount > sessions.length) {
          const otherCount = totalCount - sessions.length;
          console.log(`\n${DIM}${otherCount} more session(s) in other projects. Run ${RESET}sisyphus list --all${DIM} to show all.${RESET}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
