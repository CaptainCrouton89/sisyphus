import type { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shellQuote } from '../../shared/shell.js';
import { exec } from '../../shared/exec.js';

const BALEIA_INIT = `vim.defer_fn(function()
  local ok, baleia = pcall(require, "baleia")
  if ok then
    baleia.setup({ async = false }).once(vim.api.nvim_get_current_buf())
  end
end, 50)
`;

export function registerPresent(program: Command): void {
  program
    .command('present')
    .description('Render markdown with termrender and display in a nvim split pane with ANSI colors')
    .argument('<file>', 'Path to markdown file')
    .option('--width <cols>', 'Terminal width for rendering', '120')
    .option('--no-wait', 'Open pane without blocking')
    .action(async (file: string, opts: { width: string; wait: boolean }) => {
      const filePath = resolve(file);
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      if (!process.env.TMUX) {
        // No tmux — render and print ANSI to stdout
        try {
          const rendered = execFileSync('termrender', ['--width', opts.width, filePath], {
            encoding: 'utf-8',
          });
          process.stdout.write(rendered);
        } catch (err) {
          console.error('Error: termrender failed. Is it installed? (pip install termrender)');
          console.error((err as Error).message);
          process.exit(1);
        }
        return;
      }

      // Get pane width and render at split size (half minus tmux separator + nvim gutter)
      const paneWidth = parseInt(exec('tmux display-message -p "#{pane_width}"'), 10);
      const splitWidth = Math.floor(paneWidth / 2) - 10;
      const renderWidth = opts.width !== '120' ? opts.width : String(splitWidth);

      let rendered: string;
      try {
        rendered = execFileSync('termrender', ['--width', renderWidth, filePath], {
          encoding: 'utf-8',
        });
      } catch (err) {
        console.error('Error: termrender failed. Is it installed? (pip install termrender)');
        console.error((err as Error).message);
        process.exit(1);
      }

      // Write ANSI-rendered output and baleia init script to temp files
      const tempId = randomBytes(6).toString('hex');
      const tempPath = join(tmpdir(), `sisyphus-present-${tempId}.ansi`);
      const initPath = join(tmpdir(), `sisyphus-present-${tempId}-init.lua`);
      writeFileSync(tempPath, rendered, 'utf-8');
      writeFileSync(initPath, BALEIA_INIT, 'utf-8');

      // Open nvim with baleia init script in a split pane to the right
      const channel = `present-${randomBytes(4).toString('hex')}`;
      const nvimCmd = `nvim -S ${initPath} ${shellQuote(tempPath)}; tmux wait-for -S ${shellQuote(channel)}`;
      exec(`tmux split-window -h -l 50% ${shellQuote(nvimCmd)}`);

      if (opts.wait === false) {
        return;
      }

      // Block until user closes nvim
      exec(`tmux wait-for ${shellQuote(channel)}`, undefined, 0);

      // Return edited content to stdout
      const edited = readFileSync(tempPath, 'utf-8');
      process.stdout.write(edited);

      // Clean up
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
        if (existsSync(initPath)) unlinkSync(initPath);
      } catch {
        // Best-effort
      }
    });
}
