import type { Command } from 'commander';
import { join, resolve, dirname } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { shellQuote } from '../../shared/shell.js';

export function registerReview(program: Command): void {
  program
    .command('requirements')
    .description('Interactive EARS requirements reviewer — approve, comment on, and refine requirements produced by the requirements agent')
    .argument('[file]', 'Path to requirements.json (auto-detected from session if omitted)')
    .option('--session-id <id>', 'Session ID to find requirements for')
    .option('--cwd <path>', 'Project directory')
    .option('--window', 'Open in a new tmux window instead of inline')
    .option('--wait', 'Block until review completes and print feedback (implies --window)')
    .addHelpText('after', `
File resolution (first match wins):
  1. Positional [file] argument
  2. --session-id (or SISYPHUS_SESSION_ID env) → .sisyphus/sessions/<id>/context/requirements.json
  3. Most recent session with a requirements.json

Examples:
  $ sisyphus requirements                              Auto-detect from current session
  $ sisyphus requirements path/to/requirements.json    Open a specific file
  $ sisyphus requirements --session-id abc123           Target a specific session
  $ sisyphus requirements --window                     Open in a new tmux window
  $ sisyphus requirements --wait                       Block until review completes (for agent use)
`)
    .action(async (file, opts) => {
      await runReviewTui(file, opts, {
        filename: 'requirements.json',
        binaryName: 'review.js',
        windowName: 'requirements-review',
        feedbackFilename: 'review-feedback.md',
        notFoundMessage: 'No requirements.json found. Provide a path or use --session-id.',
      });
    });

  program
    .command('design')
    .description('Interactive design walkthrough — review architecture decisions, trade-offs, and component designs produced by the design agent')
    .argument('[file]', 'Path to design.json (auto-detected from session if omitted)')
    .option('--session-id <id>', 'Session ID to find design for')
    .option('--cwd <path>', 'Project directory')
    .option('--window', 'Open in a new tmux window instead of inline')
    .option('--wait', 'Block until review completes and print feedback (implies --window)')
    .addHelpText('after', `
File resolution (first match wins):
  1. Positional [file] argument
  2. --session-id (or SISYPHUS_SESSION_ID env) → .sisyphus/sessions/<id>/context/design.json
  3. Most recent session with a design.json

Examples:
  $ sisyphus design                              Auto-detect from current session
  $ sisyphus design path/to/design.json          Open a specific file
  $ sisyphus design --session-id abc123           Target a specific session
  $ sisyphus design --wait                        Block until review completes (for agent use)
`)
    .action(async (file, opts) => {
      await runReviewTui(file, opts, {
        filename: 'design.json',
        binaryName: 'design.js',
        windowName: 'design-walkthrough',
        feedbackFilename: 'design-feedback.md',
        notFoundMessage: 'No design.json found. Provide a path or use --session-id.',
      });
    });
}

interface ReviewTuiConfig {
  filename: string;
  binaryName: string;
  windowName: string;
  feedbackFilename: string;
  notFoundMessage: string;
}

async function runReviewTui(
  file: string | undefined,
  opts: { sessionId?: string; cwd?: string; window?: boolean; wait?: boolean },
  config: ReviewTuiConfig,
): Promise<void> {
  const cwd = opts.cwd || process.env.SISYPHUS_CWD || process.cwd();
  let targetPath: string;

  if (file) {
    targetPath = resolve(file);
  } else {
    const sessionId = opts.sessionId || process.env.SISYPHUS_SESSION_ID;
    if (sessionId) {
      targetPath = join(cwd, '.sisyphus', 'sessions', sessionId, 'context', config.filename);
    } else {
      const sessionsDir = join(cwd, '.sisyphus', 'sessions');
      if (existsSync(sessionsDir)) {
        const { readdirSync } = await import('node:fs');
        const sessions = readdirSync(sessionsDir);
        for (const s of sessions.reverse()) {
          const candidate = join(sessionsDir, s, 'context', config.filename);
          if (existsSync(candidate)) {
            targetPath = candidate;
            break;
          }
        }
      }
      if (!targetPath!) {
        console.error(`Error: ${config.notFoundMessage}`);
        process.exit(1);
      }
    }
  }

  if (!existsSync(targetPath)) {
    console.error(`Error: File not found: ${targetPath}`);
    process.exit(1);
  }

  const binaryPath = join(import.meta.dirname, config.binaryName);
  const useWindow = opts.window || opts.wait;

  if (useWindow) {
    const channel = `review-${randomBytes(4).toString('hex')}`;
    const feedbackPath = join(dirname(targetPath), config.feedbackFilename);

    const cmd = `node ${shellQuote(binaryPath)} ${shellQuote(targetPath)}; tmux wait-for -S ${shellQuote(channel)}; exit`;
    const windowId = execSync(
      `tmux new-window -n ${shellQuote(config.windowName)} -P -F "#{window_id}"`,
      { encoding: 'utf-8' },
    ).trim();
    execSync(`tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`);

    if (opts.wait) {
      execSync(`tmux wait-for ${shellQuote(channel)}`);

      if (existsSync(feedbackPath)) {
        process.stdout.write(readFileSync(feedbackPath, 'utf-8'));
        unlinkSync(feedbackPath);
      }
    } else {
      console.log(`Review opened in tmux window ${windowId}`);
    }
  } else {
    execSync(`node ${shellQuote(binaryPath)} ${shellQuote(targetPath)}`, {
      stdio: 'inherit',
    });
  }
}
