import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { basename } from 'node:path';
import { bold, dim, red, green, yellow, cyan, magenta, colorize } from '../../shared/format.js';

interface SessionSummary {
  id: string;
  name?: string;
  task: string;
  status: string;
  agentCount: number;
  createdAt: string;
  cwd?: string;
  handoff?: {
    queuedAt: string;
    sentAt?: string;
    reclaimedAt?: string;
    target?: { provider: string; repo: string };
    lastError?: string;
  };
}

function statusColor(s: string): string {
  switch (s) {
    case 'active': return 'green';
    case 'paused': return 'yellow';
    case 'completed': return 'cyan';
    default: return '';
  }
}

function colorStatus(s: string): string {
  const name = statusColor(s);
  if (!name) return s;
  return colorize(s, name);
}

function handoffAnnotation(h: SessionSummary['handoff']): string {
  if (!h) return '';
  if (h.lastError) {
    return `  ${red(`handoff error: ${h.lastError}`)}`;
  }
  if (h.reclaimedAt) {
    return `  ${dim('(reclaimed)')}`;
  }
  if (h.sentAt && h.target) {
    return `  ${magenta(`→ ${h.target.provider}:${h.target.repo}`)}`;
  }
  if (h.target) {
    return `  ${magenta(`handoff queued → ${h.target.provider}:${h.target.repo}`)}`;
  }
  return `  ${magenta('quiesce queued')}`;
}

function truncateTask(task: string, max: number): string {
  if (task.length <= max) return task;
  return task.slice(0, max - 1) + '…';
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List sessions (defaults to current project)')
    .option('-a, --all', 'Show sessions from all projects')
    .option('--cwd <path>', 'Project directory to list sessions for (overrides SISYPHUS_CWD)')
    .option('-j, --json', 'Output raw JSON')
    .action(async (opts: { all?: boolean; cwd?: string; json?: boolean }) => {
      const cwd = opts.cwd ?? process.env['SISYPHUS_CWD'] ?? process.cwd();
      const request: Request = { type: 'list', cwd, all: opts.all };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessions = (response.data?.sessions ?? []) as SessionSummary[];
        const totalCount = response.data?.totalCount as number | undefined;
        const filtered = response.data?.filtered as boolean | undefined;

        if (opts.json) {
          console.log(JSON.stringify(sessions));
          return;
        }

        if (sessions.length === 0) {
          if (filtered && totalCount && totalCount > 0) {
            console.log(`No sessions in this project. ${totalCount} session(s) in other projects.`);
            console.log(`${dim('Run ')}sis list --all${dim(' to show all.')}`);
          } else {
            console.log('No sessions');
          }
          return;
        }

        for (const s of sessions) {
          const status = colorStatus(s.status);
          const agents = dim(`${s.agentCount} agent(s)`);
          const task = truncateTask(s.task, 60);
          const label = s.name ? `${s.name} ${dim(`(${s.id.slice(0, 8)})`)}` : s.id;
          const cwdLabel = opts.all && s.cwd ? `  ${dim(basename(s.cwd))}` : '';
          const handoffLabel = handoffAnnotation(s.handoff);
          console.log(`  ${bold(label)}  ${status}  ${agents}  ${task}${cwdLabel}${handoffLabel}`);
        }

        if (filtered && totalCount && totalCount > sessions.length) {
          const otherCount = totalCount - sessions.length;
          console.log(`\n${dim(`${otherCount} more session(s) in other projects. Run `)}sis list --all${dim(' to show all.')}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
