import type { Command } from 'commander';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { shellQuote } from '../../shared/shell.js';

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('Open the interactive requirements review TUI')
    .argument('[file]', 'Path to requirements.json (auto-detected from session if omitted)')
    .option('--session-id <id>', 'Session ID to find requirements for')
    .option('--cwd <path>', 'Project directory')
    .option('--window', 'Open in a new tmux window instead of inline')
    .action(async (file, opts) => {
      const cwd = opts.cwd || process.env.SISYPHUS_CWD || process.cwd();
      let reqPath: string;

      if (file) {
        reqPath = resolve(file);
      } else {
        // Try to find requirements.json from session
        const sessionId = opts.sessionId || process.env.SISYPHUS_SESSION_ID;
        if (sessionId) {
          reqPath = join(cwd, '.sisyphus', 'sessions', sessionId, 'context', 'requirements.json');
        } else {
          // Try to find any session with requirements.json
          const sessionsDir = join(cwd, '.sisyphus', 'sessions');
          if (existsSync(sessionsDir)) {
            const { readdirSync } = await import('node:fs');
            const sessions = readdirSync(sessionsDir);
            for (const s of sessions.reverse()) {
              const candidate = join(sessionsDir, s, 'context', 'requirements.json');
              if (existsSync(candidate)) {
                reqPath = candidate;
                break;
              }
            }
          }
          if (!reqPath!) {
            console.error('Error: No requirements.json found. Provide a path or use --session-id.');
            process.exit(1);
          }
        }
      }

      if (!existsSync(reqPath)) {
        console.error(`Error: File not found: ${reqPath}`);
        process.exit(1);
      }

      const reviewPath = join(import.meta.dirname, 'review.js');

      if (opts.window) {
        // Open in new tmux window
        const windowId = execSync(
          `tmux new-window -n "requirements-review" -P -F "#{window_id}"`,
          { encoding: 'utf-8' },
        ).trim();
        const cmd = `node ${shellQuote(reviewPath)} ${shellQuote(reqPath)}; exit`;
        execSync(`tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`);
        console.log(`Review opened in tmux window ${windowId}`);
      } else {
        // Run inline
        execSync(`node ${shellQuote(reviewPath)} ${shellQuote(reqPath)}`, {
          stdio: 'inherit',
        });
      }
    });
}
