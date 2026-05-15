import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

export function registerClone(program: Command): void {
  program
    .command('clone')
    .description('Clone the current session into a new independent session with a different goal')
    .argument('<goal>', 'Goal for the cloned session')
    .option('-c, --context <text>', 'Additional context for the clone')
    .option('--strategy', 'Copy strategy.md from the source session')
    .option('-n, --name <name>', 'Name for the cloned session')
    .addHelpText(
      'after',
      `
Examples:
  $ sis session clone "Refactor billing module separately"
  $ sis session clone "..." -c "use stripe-v2 API" --strategy --name billing-rework

When NOT to use:
  Clone is orchestrator-only — sub-agents must \`sis orch message\` the orchestrator
  to request a clone. Cloning creates a separate session with its own roadmap;
  the caller is no longer responsible for the cloned goal.

Output:
  Default       "Session cloned successfully." plus scope-update reminders.
  --json        { ok, schema_version: 1, data: { sessionId, tmuxSessionName } }

Exit codes: 0 ok | 2 usage (missing env / wrong agent) | 3 not_found | 5 conflict.`,
    )
    .action(async (goal: string, opts: { context?: string; strategy?: boolean; name?: string }) => {
      assertTmux();

      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_env', 'SISYPHUS_SESSION_ID not set. Run this from an orchestrator or agent pane.', {
          next: 'clone is invoked from inside a session pane',
        });
      }

      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (agentId !== 'orchestrator') {
        exitUsage('orchestrator_only', 'clone can only be called by the orchestrator. Use `sis orch message` to ask the orchestrator to clone.', {
          received: agentId ?? null,
          expected: 'orchestrator',
        });
      }

      const request: Request = {
        type: 'clone',
        sessionId,
        goal,
        context: opts.context,
        name: opts.name,
        strategy: opts.strategy,
      };

      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const data = response.data as { sessionId: string; tmuxSessionName: string };
      if (emitJsonOk({ sessionId: data.sessionId, tmuxSessionName: data.tmuxSessionName, goal })) return;
      console.log('Session cloned successfully.');
      console.log(`  Clone: ${data.sessionId}`);
      console.log(`  Tmux:  ${data.tmuxSessionName}`);
      console.log('');
      console.log(`The cloned session now owns: "${goal}"`);
      console.log("This is the other session's responsibility. You do not need to monitor it.");
      console.log('');
      console.log('Update your scope:');
      console.log('- Remove cloned work from goal.md');
      console.log('- Update roadmap.md to reflect reduced scope');
      console.log('- Update strategy.md if approach changes');
    });
}
