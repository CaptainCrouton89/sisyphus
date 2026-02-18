import { Command } from 'commander';
import { registerStart } from './commands/start.js';
import { registerSpawn } from './commands/spawn.js';
import { registerSubmit } from './commands/submit.js';
import { registerYield } from './commands/yield.js';
import { registerComplete } from './commands/complete.js';
import { registerStatus } from './commands/status.js';
import { registerList } from './commands/list.js';
import { registerReport } from './commands/report.js';
import { registerResume } from './commands/resume.js';
import { registerKill } from './commands/kill.js';
import { registerUninstall } from './commands/uninstall.js';

const program = new Command();

program
  .name('sisyphus')
  .description('tmux-integrated orchestration daemon for Claude Code')
  .version('0.1.0');

registerStart(program);
registerSpawn(program);
registerSubmit(program);
registerReport(program);
registerYield(program);
registerComplete(program);
registerStatus(program);
registerList(program);
registerResume(program);
registerKill(program);
registerUninstall(program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
