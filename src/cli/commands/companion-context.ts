import type { Command } from 'commander';
import { buildCompanionContext } from '../../tui/lib/context.js';

export function registerCompanionContext(program: Command): void {
  program
    .command('companion-context', { hidden: true })
    .description('Output session context JSON for companion hook')
    .option('--cwd <path>', 'Project directory', process.cwd())
    .action((opts: { cwd: string }) => {
      const context = buildCompanionContext(opts.cwd);
      process.stdout.write(JSON.stringify({ additionalContext: context }));
    });
}
