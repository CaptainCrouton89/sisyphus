import type { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shellQuote } from '../../shared/shell.js';
import { openTmuxWindow, waitForTmuxWindow } from '../../shared/tmux.js';

export function registerPresent(program: Command): void {
  program
    .command('present')
    .description('Render termrender markdown and open in nvim for user review — returns annotated feedback')
    .argument('<file>', 'Path to termrender markdown file')
    .option('--width <cols>', 'Terminal width for rendering', '120')
    .option('--no-wait', 'Open in tmux window without blocking')
    .action(async (file: string, opts: { width: string; wait: boolean }) => {
      const filePath = resolve(file);
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      // Render via termrender
      let rendered: string;
      try {
        rendered = execFileSync('termrender', ['--width', opts.width, filePath], {
          encoding: 'utf-8',
        });
      } catch (err) {
        console.error('Error: termrender failed. Is it installed? (pip install termrender)');
        console.error((err as Error).message);
        process.exit(1);
      }

      if (!process.env.TMUX) {
        // No tmux — just print to stdout, no temp file needed
        process.stdout.write(rendered);
        return;
      }

      // Write rendered output to temp file (only needed for tmux/nvim path)
      const tempId = randomBytes(6).toString('hex');
      const tempPath = join(tmpdir(), `sisyphus-present-${tempId}.md`);
      writeFileSync(tempPath, rendered, 'utf-8');

      let skipCleanup = false;
      try {
        const { channel } = openTmuxWindow('present', `nvim ${shellQuote(tempPath)}`);

        if (opts.wait === false) {
          // Don't clean up — neovim still has the file open
          skipCleanup = true;
          return;
        }

        // Block until user closes nvim (no timeout — user controls when they're done)
        waitForTmuxWindow(channel);

        // Read back the edited file
        const edited = readFileSync(tempPath, 'utf-8');

        // Strip ANSI from both versions, diff, and annotate
        const originalPlain = stripAnsi(rendered);
        const editedPlain = stripAnsi(edited);

        const annotated = annotateDiff(originalPlain, editedPlain);
        process.stdout.write(annotated);
      } finally {
        if (!skipCleanup) {
          try {
            if (existsSync(tempPath)) unlinkSync(tempPath);
          } catch {
            // Best-effort cleanup
          }
        }
      }
    });
}

/**
 * Strip ANSI escape sequences from a string.
 * Handles SGR, CSI, OSC (BEL and ST terminated), charset selection, and standalone ESC.
 */
function stripAnsi(str: string): string {
  return str
    // CSI sequences: ESC [ ... <final byte> (includes SGR)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // OSC sequences terminated by BEL: ESC ] ... BEL
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // OSC sequences terminated by ST: ESC ] ... ESC \
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
    // Charset selection: ESC ( or ESC ) followed by a character
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    // Standalone ESC followed by a single character (remaining)
    .replace(/\x1b[^[\]()]/g, '');
}

/**
 * LCS-based diff that wraps user-inserted/modified lines with comment tags.
 */
function annotateDiff(original: string, edited: string): string {
  const origLines = original.split('\n');
  const editLines = edited.split('\n');

  // Compute LCS table
  const m = origLines.length;
  const n = editLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === editLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find which edited lines are in the LCS
  const lcsSet = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (origLines[i - 1] === editLines[j - 1]) {
      lcsSet.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  // Build output: wrap non-LCS runs in comment tags
  const result: string[] = [];
  let inUserBlock = false;

  for (let k = 0; k < editLines.length; k++) {
    const isOriginal = lcsSet.has(k);

    if (!isOriginal && !inUserBlock) {
      result.push('<!-- user: -->');
      inUserBlock = true;
    } else if (isOriginal && inUserBlock) {
      result.push('<!-- /user -->');
      inUserBlock = false;
    }

    result.push(editLines[k]!);
  }

  if (inUserBlock) {
    result.push('<!-- /user -->');
  }

  return result.join('\n');
}
