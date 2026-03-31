const nodeVersion = parseInt(process.versions.node.split('.')[0]!, 10);
if (nodeVersion < 22) {
  console.error(`Sisyphus requires Node.js v22+ (current: v${process.versions.node})`);
  process.exit(1);
}

import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerStart } from './commands/start.js';
import { registerSpawn } from './commands/spawn.js';
import { registerSubmit } from './commands/submit.js';
import { registerYield } from './commands/yield.js';
import { registerComplete } from './commands/complete.js';
import { registerContinue } from './commands/continue.js';
import { registerStatus } from './commands/status.js';
import { registerList } from './commands/list.js';
import { registerReport } from './commands/report.js';
import { registerResume } from './commands/resume.js';
import { registerKill } from './commands/kill.js';
import { registerUninstall } from './commands/uninstall.js';
import { registerNotify } from './commands/notify.js';
import { registerMessage } from './commands/message.js';
import { registerUpdateTask } from './commands/update-task.js';
import { registerDashboard } from './commands/dashboard.js';
import { registerRollback } from './commands/rollback.js';
import { registerRestartAgent } from './commands/restart-agent.js';
import { registerSetupKeybind } from './commands/setup-keybind.js';
import { registerDoctor } from './commands/doctor.js';
import { registerCompanionContext } from './commands/companion-context.js';
import { registerGettingStarted } from './commands/getting-started.js';
import { registerInit } from './commands/init.js';
import { registerSetup } from './commands/setup.js';
import { registerTmuxStatus } from './commands/tmux-status.js';
import { registerTmuxSessions } from './commands/tmux-sessions.js';
import { globalDir } from '../shared/paths.js';

const program = new Command();

program
  .name('sisyphus')
  .description('tmux-integrated orchestration daemon for Claude Code')
  .version(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
    ).version,
  );

program.configureHelp({
  sortSubcommands: false,
});

registerStart(program);
registerSpawn(program);
registerSubmit(program);
registerReport(program);
registerYield(program);
registerComplete(program);
registerContinue(program);
registerStatus(program);
registerList(program);
registerResume(program);
registerKill(program);
registerUninstall(program);
registerNotify(program);
registerMessage(program);
registerUpdateTask(program);
registerDashboard(program);
registerRollback(program);
registerRestartAgent(program);
registerSetupKeybind(program);
registerDoctor(program);
registerCompanionContext(program);
registerGettingStarted(program);
registerInit(program);
registerSetup(program);
registerTmuxStatus(program);
registerTmuxSessions(program);

program.addHelpText('after', `
Examples:
  $ sisyphus start "Implement auth system"     Start a new session
  $ sisyphus start "Build @requirements.md" -n auth    Start with a name and requirements reference
  $ sisyphus status                            Check current sessions
  $ sisyphus dashboard                         Open the TUI
  $ sisyphus doctor                            Verify installation

Run 'sisyphus getting-started' for a complete usage guide.
`);

// Show welcome on first run (before ~/.sisyphus exists)
const args = process.argv.slice(2);
const firstArg = args[0];
const skipWelcome = ['doctor', 'getting-started', 'help', '--help', '-h', 'init', 'setup', 'uninstall', '--version', '-V'];
if (!existsSync(globalDir()) && firstArg && !skipWelcome.includes(firstArg)) {
  mkdirSync(globalDir(), { recursive: true });
  console.log('');
  console.log("  Welcome to Sisyphus. Run 'sisyphus setup' to get started.");
  console.log('');
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
