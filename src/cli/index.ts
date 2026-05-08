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
import { registerStatus } from './commands/status.js';
import { registerDashboard } from './commands/dashboard.js';
import { registerList } from './commands/list.js';
import { registerTell } from './commands/tell.js';
import { registerRead } from './commands/read.js';
import { registerMessage } from './commands/message.js';
import { registerAsk } from './commands/ask.js';
import { registerKill } from './commands/kill.js';
import { registerDelete } from './commands/delete.js';
import { registerResume } from './commands/resume.js';
import { registerContinue } from './commands/continue.js';
import { registerComplete } from './commands/complete.js';
import { registerRollback } from './commands/rollback.js';
import { registerReconnect } from './commands/reconnect.js';
import { registerClone } from './commands/clone.js';
import { registerSessionTask } from './commands/update-task.js';
import { registerSessionEffort } from './commands/set-effort.js';
import { registerSessionContext } from './commands/print-context.js';
import { registerSpawn } from './commands/spawn.js';
import { registerSubmit } from './commands/submit.js';
import { registerReport } from './commands/report.js';
import { registerAwait } from './commands/await.js';
import { registerAgentKill } from './commands/kill-agent.js';
import { registerAgentRestart } from './commands/restart-agent.js';
import { registerYield } from './commands/yield.js';
import { registerSegmentRegister } from './commands/register-segment.js';
import { registerSegmentUnregister } from './commands/unregister-segment.js';
import { registerSetup } from './commands/setup.js';
import { registerSetupKeybind } from './commands/setup-keybind.js';
import { registerHomeInit } from './commands/home-init.js';
import { registerDoctor } from './commands/doctor.js';
import { registerInit } from './commands/init.js';
import { registerUninstall } from './commands/uninstall.js';
import { registerConfigureUpload } from './commands/configure-upload.js';
import { registerGettingStarted } from './commands/getting-started.js';
import { registerHistory } from './commands/history.js';
import { registerExport } from './commands/export.js';
import { registerUpload } from './commands/upload.js';
import { registerScratch } from './commands/scratch.js';
import { registerReview } from './commands/review.js';
import { registerCompanion } from './commands/companion.js';
import { registerDeploy } from './commands/deploy.js';
import { registerCloud } from './commands/cloud.js';
import { attachNotify } from './commands/notify.js';
import { attachTmuxSessions } from './commands/tmux-sessions.js';
import { globalDir } from '../shared/paths.js';

const program = new Command();

program
  .name('sis')
  .description('tmux-integrated orchestration daemon for Claude Code')
  .version(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
    ).version,
  );

program.configureHelp({
  sortSubcommands: false,
});

// Flat hot-path
registerStart(program);
registerStatus(program);
registerDashboard(program);
registerList(program);
registerTell(program);
registerRead(program);
registerMessage(program);
registerAsk(program);

// session group
const session = program.command('session').description('Manage sessions');
registerKill(session);
registerDelete(session);
registerResume(session);
registerContinue(session);
registerComplete(session);
registerRollback(session);
registerReconnect(session);
registerClone(session);
registerSessionTask(session);
registerSessionEffort(session);
registerSessionContext(session);

// agent group
const agent = program.command('agent').description('Manage agents');
registerSpawn(agent);
registerSubmit(agent);
registerReport(agent);
registerAwait(agent);
registerAgentKill(agent);
registerAgentRestart(agent);

// orch group
const orch = program.command('orch').description('Orchestrator commands');
registerYield(orch);

// segment group
const segment = program.command('segment').description('Status-line segments');
registerSegmentRegister(segment);
registerSegmentUnregister(segment);

// admin group
const admin = program.command('admin').description('Admin / setup commands');
registerSetup(admin);
registerSetupKeybind(admin);
registerHomeInit(admin);
registerDoctor(admin);
registerInit(admin);
registerUninstall(admin);
registerConfigureUpload(admin);
registerGettingStarted(admin);
registerHistory(admin);
registerExport(admin);
registerUpload(admin);
registerScratch(admin);
registerReview(admin);

// companion group (root action + memory + popup-test + context)
registerCompanion(program);

// deploy group (Terraform-wrapped cloud provisioning)
registerDeploy(program);

// cloud group (per-repo workflow on the deployed box)
registerCloud(program);

// diagnostic group (hidden)
const diagnostic = program.command('diagnostic', { hidden: true });
attachNotify(diagnostic);
attachTmuxSessions(diagnostic);

program.addHelpText('after', `
Examples:
  $ sis start "Implement auth system"     Start a new session
  $ sis start "Build @reqs.md" -n auth    Start with name + requirements
  $ sis status                            Check current sessions
  $ sis dashboard                         Open the TUI
  $ sis admin doctor                      Verify installation

Run 'sis admin getting-started' for a complete usage guide.
`);

// Show welcome on first run (before ~/.sisyphus exists)
const args = process.argv.slice(2);
const firstArg = args[0];
const skipWelcome = ['admin', 'help', '--help', '-h', '--version', '-V'];
if (!existsSync(globalDir()) && firstArg && !skipWelcome.includes(firstArg)) {
  mkdirSync(globalDir(), { recursive: true });
  console.log('');
  console.log("  Welcome to Sisyphus. Run 'sis admin setup' to get started.");
  console.log('');
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
