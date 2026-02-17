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

export function registerResume(program: Command): void {
  program
    .command('resume')
    .description('Resume a paused session')
    .argument('<session-id>', 'Session ID to resume')
    .action(async (sessionId: string) => {
      const tmuxSession = getTmuxSession();
      const tmuxWindow = getTmuxWindow();
      const request: Request = { type: 'resume', sessionId, tmuxSession, tmuxWindow };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Session ${sessionId} resumed`);
        if (response.data?.tmuxWindow) {
          console.log(`Orchestrator respawned in tmux window: ${response.data.tmuxWindow}`);
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
