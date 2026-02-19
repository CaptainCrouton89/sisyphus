import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

function isInWorktree(): boolean {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf-8' }).trim();
    return gitDir !== commonDir;
  } catch {
    return false;
  }
}

function getUncommittedChanges(): string | null {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status || null;
  } catch {
    return null;
  }
}

export function registerSubmit(program: Command): void {
  program
    .command('submit')
    .description('Submit work report and exit (agent only)')
    .option('--report <report>', 'Work report (or pipe via stdin)')
    .action(async (opts: { report?: string }) => {
      assertTmux();
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (!sessionId || !agentId) {
        console.error('Error: SISYPHUS_SESSION_ID and SISYPHUS_AGENT_ID environment variables must be set');
        process.exit(1);
      }

      // Block submit if worktree has uncommitted changes — they'd be lost on merge
      if (isInWorktree()) {
        const changes = getUncommittedChanges();
        if (changes) {
          console.error('Error: uncommitted changes in worktree. Your branch is merged automatically after submit — uncommitted work will be lost.');
          console.error('\nCommit first:\n  git add -A && git commit -m "description of changes"\n');
          console.error('Or discard:\n  git checkout -- .\n');
          console.error('Uncommitted changes:');
          console.error(changes);
          process.exit(1);
        }
      }

      const report = opts.report ?? await readStdin();
      if (!report) {
        console.error('Error: provide --report or pipe content via stdin');
        process.exit(1);
      }

      const request: Request = { type: 'submit', sessionId, agentId, report };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log('Report submitted successfully');
        console.log('Your pane will close. The orchestrator resumes when all agents finish.');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
