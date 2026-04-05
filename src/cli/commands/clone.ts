import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';

export function registerClone(program: Command): void {
  program
    .command('clone')
    .description('Clone the current session into a new independent session with a different goal')
    .argument('<goal>', 'Goal for the cloned session')
    .option('-c, --context <text>', 'Additional context for the clone')
    .option('--strategy', 'Copy strategy.md from the source session')
    .option('-n, --name <name>', 'Name for the cloned session')
    .action(async (goal: string, opts: { context?: string; strategy?: boolean; name?: string }) => {
      assertTmux();

      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID not set. Run this from an orchestrator or agent pane.');
        process.exit(1);
      }

      const agentId = process.env.SISYPHUS_AGENT_ID;
      if (agentId !== 'orchestrator') {
        console.error('Error: clone can only be called by the orchestrator. Use sisyphus message to ask the orchestrator to clone.');
        process.exit(1);
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
      if (response.ok) {
        const data = response.data as { sessionId: string; tmuxSessionName: string };
        console.log('Session cloned successfully.');
        console.log(`  Clone: ${data.sessionId}`);
        console.log(`  Tmux:  ${data.tmuxSessionName}`);
        console.log('');
        console.log(`The cloned session now owns: "${goal}"`);
        console.log('This is the other session\'s responsibility. You do not need to monitor it.');
        console.log('');
        console.log('Update your scope:');
        console.log('- Remove cloned work from goal.md');
        console.log('- Update roadmap.md to reflect reduced scope');
        console.log('- Update strategy.md if approach changes');
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
