import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';

function getTmuxSession(): string {
  try {
    return execSync('tmux display-message -p "#{session_name}"', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not running inside tmux');
  }
}

function getTmuxWindow(): string {
  try {
    return execSync('tmux display-message -p "#{window_id}"', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Not running inside tmux');
  }
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sisyphus session')
    .argument('<task>', 'Task description for the orchestrator')
    .action(async (task: string) => {
      const tmuxSession = getTmuxSession();
      const tmuxWindow = getTmuxWindow();
      const request: Request = { type: 'start', task, cwd: process.cwd(), tmuxSession, tmuxWindow };
      const response = await sendRequest(request);
      if (response.ok) {
        const sessionId = response.data?.sessionId as string;
        console.log(`Session started: ${sessionId}`);
        if (response.data?.tmuxWindow) {
          console.log(`Orchestrator spawned in tmux window: ${response.data.tmuxWindow}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
