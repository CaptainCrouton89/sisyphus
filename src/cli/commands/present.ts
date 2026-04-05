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

function runTermrender(filePath: string, args: string[]): string {
  try {
    return execFileSync('termrender', [...args, filePath], { encoding: 'utf-8' });
  } catch (err) {
    console.error('Error: termrender failed. Is it installed? (pip install termrender)');
    console.error((err as Error).message);
    process.exit(1);
  }
}

export function registerPresent(program: Command): void {
  program
    .command('present')
    .description('Render markdown with termrender and display in a tmux split pane')
    .argument('<file>', 'Path to markdown file')
    .option('--width <cols>', 'Terminal width for rendering')
    .option('--interactive', 'Open pane in editable nvim and block until closed')
    .action(async (file: string, opts: { width?: string; interactive: boolean }) => {
      const filePath = resolve(file);
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const widthArgs = opts.width ? ['-w', opts.width] : [];

      if (!process.env.TMUX) {
        // No tmux — render and print ANSI to stdout
        process.stdout.write(runTermrender(filePath, widthArgs));
        return;
      }

      if (!opts.interactive) {
        // Non-interactive (default): delegate entirely to termrender --tmux
        try {
          execFileSync('termrender', ['--tmux', ...widthArgs, filePath], {
            stdio: 'inherit',
          });
        } catch (err) {
          console.error('Error: termrender --tmux failed.');
          console.error((err as Error).message);
          process.exit(1);
        }
        return;
      }

      // Interactive: render to temp file, open editable nvim with baleia, block
      const rendered = runTermrender(filePath, widthArgs);

      const tempId = randomBytes(6).toString('hex');
      const tempPath = join(tmpdir(), `sisyphus-present-${tempId}.ansi`);
      const initPath = join(tmpdir(), `sisyphus-present-${tempId}-init.lua`);
      writeFileSync(tempPath, rendered, 'utf-8');
      writeFileSync(initPath, BALEIA_INIT, 'utf-8');

      const channel = `present-${randomBytes(4).toString('hex')}`;
      const nvimCmd = `nvim -S ${initPath} ${shellQuote(tempPath)}; tmux wait-for -S ${shellQuote(channel)}`;
      exec(`tmux split-window -h -l 50% ${shellQuote(nvimCmd)}`);

      exec(`tmux wait-for ${shellQuote(channel)}`, undefined, 0);

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
