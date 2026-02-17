import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Task } from '../../shared/types.js';

function getSessionId(): string {
  const sessionId = process.env.SISYPHUS_SESSION_ID;
  if (!sessionId) {
    console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
    process.exit(1);
  }
  return sessionId;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '\x1b[2m',        // dim
  pending: '\x1b[90m',     // gray
  in_progress: '\x1b[33m', // yellow
  done: '\x1b[32m',        // green
};
const RESET = '\x1b[0m';

export function registerTasks(program: Command): void {
  const tasks = program
    .command('tasks')
    .description('Manage session tasks');

  tasks
    .command('add')
    .description('Add a new task')
    .argument('<description>', 'Task description')
    .option('--status <status>', 'Initial status (draft|pending)', 'pending')
    .action(async (description: string, opts: { status: string }) => {
      const sessionId = getSessionId();
      const request: Request = { type: 'tasks_add', sessionId, description, status: opts.status !== 'pending' ? opts.status : undefined };
      const response = await sendRequest(request);
      if (response.ok) {
        const taskId = response.data?.taskId as string;
        console.log(`Task added: ${taskId} [${opts.status}]`);
      } else {
        console.error(`Error: ${response.error}`);
        if (response.error?.includes("Unknown session")) console.error("Hint: run `sisyphus list` to see active sessions.");
        process.exit(1);
      }
    });

  tasks
    .command('update')
    .description('Update a task')
    .argument('<task-id>', 'Task ID (e.g. t1)')
    .option('--status <status>', 'New status (draft|pending|in_progress|done)')
    .option('--description <description>', 'New description')
    .action(async (taskId: string, opts: { status?: string; description?: string }) => {
      if (!opts.status && !opts.description) {
        console.error('Error: provide --status and/or --description');
        process.exit(1);
      }
      const sessionId = getSessionId();
      const request: Request = { type: 'tasks_update', sessionId, taskId, status: opts.status, description: opts.description };
      const response = await sendRequest(request);
      if (response.ok) {
        const parts: string[] = [];
        if (opts.status) parts.push(`status → ${opts.status}`);
        if (opts.description) parts.push(`description updated`);
        console.log(`Task ${taskId}: ${parts.join(', ')}`);
      } else {
        console.error(`Error: ${response.error}`);
        if (response.error?.includes("not found")) console.error("Hint: run `sisyphus tasks list` to see current tasks.");
        if (response.error?.includes("Unknown session")) console.error("Hint: run `sisyphus list` to see active sessions.");
        process.exit(1);
      }
    });

  tasks
    .command('list')
    .description('List all tasks')
    .action(async () => {
      const sessionId = getSessionId();
      const request: Request = { type: 'tasks_list', sessionId };
      const response = await sendRequest(request);
      if (response.ok) {
        const taskList = (response.data?.tasks ?? []) as Task[];
        if (taskList.length === 0) {
          console.log('No tasks');
          return;
        }
        for (const task of taskList) {
          const color = STATUS_COLORS[task.status] ?? '';
          console.log(`  ${task.id}: ${task.description} [${color}${task.status}${RESET}]`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        if (response.error?.includes("Unknown session")) console.error("Hint: run `sisyphus list` to see active sessions.");
        process.exit(1);
      }
    });
}
