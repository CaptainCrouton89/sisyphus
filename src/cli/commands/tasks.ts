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
  pending: '\x1b[90m',
  in_progress: '\x1b[33m',
  complete: '\x1b[32m',
  blocked: '\x1b[31m',
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
    .action(async (description: string) => {
      const sessionId = getSessionId();
      const request: Request = { type: 'tasks_add', sessionId, description };
      const response = await sendRequest(request);
      if (response.ok) {
        const taskId = response.data?.taskId as string;
        console.log(`Task added: ${taskId}`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });

  tasks
    .command('update')
    .description('Update task status')
    .argument('<task-id>', 'Task ID (e.g. t1)')
    .requiredOption('--status <status>', 'New status (pending|in_progress|complete|blocked)')
    .action(async (taskId: string, opts: { status: string }) => {
      const sessionId = getSessionId();
      const request: Request = { type: 'tasks_update', sessionId, taskId, status: opts.status };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Task ${taskId} updated to ${opts.status}`);
      } else {
        console.error(`Error: ${response.error}`);
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
        process.exit(1);
      }
    });
}
