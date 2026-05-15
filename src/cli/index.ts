const nodeVersion = parseInt(process.versions.node.split('.')[0]!, 10);
if (nodeVersion < 22) {
  console.error(`Sisyphus requires Node.js v22+ (current: v${process.versions.node})`);
  process.exit(1);
}

// Native Windows is unsupported: the orchestration layer depends on tmux,
// bash, and POSIX sockets. WSL2 runs the Linux build with no changes.
if (process.platform === 'win32') {
  console.error(`Sisyphus does not run on native Windows (PowerShell / cmd.exe).

It depends on tmux, bash, and POSIX sockets — please run it inside WSL2:

  1. Install WSL2:  https://learn.microsoft.com/windows/wsl/install
  2. Open your WSL distro (Ubuntu is a safe default).
  3. Install Node.js v22+ and Claude Code inside WSL.
  4. Re-run \`sis\` from the WSL shell, not PowerShell.

Tip: enable systemd in /etc/wsl.conf for the recommended daemon setup.`);
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
import { registerOrchTell, registerAgentTell } from './commands/tell.js';
import { registerOrchRead, registerAgentRead } from './commands/read.js';
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
import { registerSessionDangerous } from './commands/set-dangerous.js';
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
import { registerCheckKeybinds } from './commands/check-keybinds.js';
import { registerCheckStatusbar } from './commands/check-statusbar.js';
import { registerHomeInit } from './commands/home-init.js';
import { registerQuiesce } from './commands/quiesce.js';
import { registerDoctor } from './commands/doctor.js';
import { registerBug } from './commands/bug.js';
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
import { setGlobalFlags } from './global-flags.js';

const program = new Command();

program
  .name('sis')
  .description('tmux-integrated orchestration daemon for Claude Code')
  .version(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
    ).version,
  )
  // Universal flags. Apply at every level — `sis --json session status foo` and
  // `sis session status --json foo` are both valid. Commander v13 inherits root opts
  // into subcommands via `optsWithGlobals()`; the preAction hook below pushes
  // them into module state so deeply nested actions don't need to wire it.
  .option('--json', 'Emit JSON to stdout; suppress ANSI and prose diagnostics')
  .option('--no-color', 'Disable ANSI color (forced when --json is set or stdout is not a TTY)');

program.hook('preAction', (thisCmd, actionCmd) => {
  // Merge root + subcommand opts so `--json` works either side of the verb.
  const rootJson = Boolean(thisCmd.opts()['json']);
  const subJson = Boolean(actionCmd.optsWithGlobals().json);
  const json = rootJson || subJson;
  // Commander sets `color: false` when --no-color is passed; default true.
  const rootColor = thisCmd.opts()['color'] !== false;
  const subColor = actionCmd.optsWithGlobals().color !== false;
  const colorOptIn = rootColor && subColor;
  // --json forces color off (decoration corrupts JSON parsers).
  const color = json ? false : colorOptIn;
  setGlobalFlags({ json, color });
});

program.configureHelp({
  sortSubcommands: false,
});

// Root-only ('after', not 'afterAll'): the full exit-code enum + --json
// envelope is reference material that belongs on `sis -h`. Subcommands carry
// their own concise per-command exit-code line in their own addHelpText, so
// propagating this everywhere just duplicated ~18 lines onto every -h.
program.addHelpText('after', `
Exit codes:
  0   success
  1   permanent error (fallback)
  2   usage error (bad args/shape)
  3   not found
  4   ambiguous (multiple matches — see error.candidates)
  5   conflict (already-exists, wrong-state)
  60  transient (retry-safe: daemon down, timeout, lock contention)

Output:
  Default        Human-friendly text on stdout; diagnostics on stderr.
  --json         {ok, schema_version: 1, data?|error?} envelope on stdout.

Errors in --json:
  {"ok": false, "schema_version": 1,
   "error": {"code": "<stable-enum>", "kind": "<usage|not_found|ambiguous|conflict|transient|permanent>",
             "message": "...", "received"?: ..., "expected"?: ..., "next"?: "...", "candidates"?: [...]}}
`);

// session group
const session = program.command('session').description('Manage sessions');
registerStart(session);
registerStatus(session);
registerList(session);
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
registerSessionDangerous(session);
registerSessionContext(session);
registerQuiesce(session);
registerExport(session);
registerHistory(session);
registerScratch(session);
registerReview(session);

// agent group
const agent = program.command('agent').description('Manage agents');
registerSpawn(agent);
registerSubmit(agent);
registerReport(agent);
registerAwait(agent);
registerAgentKill(agent);
registerAgentRestart(agent);
registerAgentTell(agent);
registerAgentRead(agent);

// orch group
const orch = program.command('orch').description('Orchestrator commands');
registerYield(orch);
registerOrchTell(orch);
registerMessage(orch);
registerOrchRead(orch);

// ask group (self-parenting; `registerAsk` adds subcommands internally)
registerAsk(program);

// ui group
const ui = program.command('ui').description('Interactive surfaces (dashboard, guide)');
registerDashboard(ui);
registerGettingStarted(ui, program);

// segment group
const segment = program.command('segment').description('Status-line segments');
registerSegmentRegister(segment);
registerSegmentUnregister(segment);

// admin group
const admin = program.command('admin').description('Admin / setup commands');
registerSetup(admin);
registerSetupKeybind(admin);
registerCheckKeybinds(admin);
registerCheckStatusbar(admin);
registerHomeInit(admin);
registerDoctor(admin);
registerBug(admin);
registerInit(admin);
registerUninstall(admin);
registerConfigureUpload(admin);
registerUpload(admin);

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
  $ sis session start "Implement auth system"     Start a new session
  $ sis session start "Build @reqs.md" -n auth    Start with name + requirements
  $ sis session status                            Check current sessions
  $ sis ui dashboard                              Open the TUI
  $ sis admin doctor                              Verify installation

Run 'sis ui guide' for a complete usage guide.
`);

// Propagate --json / --no-color to every (sub)command. Commander v13 won't
// match unknown options against a parent — without per-command declarations,
// `sis session status --json` errors with "unknown option" even though `--json` is at
// root. Walking the tree once at startup keeps the universal-flag surface
// honest without forcing every register* function to add them by hand.
function propagateUniversalFlags(cmd: Command): void {
  for (const sub of cmd.commands) {
    // Skip help itself; Commander rejects re-adding flags it already owns.
    if (sub.name() === 'help') continue;
    if (!sub.options.find(o => o.long === '--json')) {
      sub.option('--json', 'Emit JSON to stdout; suppress ANSI and prose diagnostics');
    }
    if (!sub.options.find(o => o.long === '--no-color')) {
      sub.option('--no-color', 'Disable ANSI color (forced when --json is set or stdout is not a TTY)');
    }
    propagateUniversalFlags(sub);
  }
}
propagateUniversalFlags(program);

// Show welcome on first run (before ~/.sisyphus exists)
const args = process.argv.slice(2);
const firstArg = args[0];
const skipWelcome = ['session', 'agent', 'orch', 'ask', 'ui', 'segment', 'admin', 'help', '--help', '-h', '--version', '-V'];
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
