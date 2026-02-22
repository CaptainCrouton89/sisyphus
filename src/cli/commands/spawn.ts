import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerSpawn(program: Command): void {
  program
    .command('spawn')
    .description('Spawn a new agent (orchestrator only)')
    .option('--agent-type <type>', 'Agent role label (default: worker)', 'worker')
    .requiredOption('--name <name>', 'Agent name')
    .option('--instruction <instruction>', 'Task instruction for the agent (or pipe via stdin)')
    .option('--worktree', 'Spawn agent in an isolated git worktree')
    .action(async (opts: { agentType: string; name: string; instruction?: string; worktree?: boolean }) => {
      assertTmux();
      const sessionId = process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: SISYPHUS_SESSION_ID environment variable not set');
        process.exit(1);
      }

      const instruction = opts.instruction ?? await readStdin();
      if (!instruction) {
        console.error('Error: --instruction is required (or pipe via stdin)');
        process.exit(1);
      }

      const request: Request = {
        type: 'spawn',
        sessionId,
        agentType: opts.agentType,
        name: opts.name,
        instruction,
        ...(opts.worktree ? { worktree: true } : {}),
      };
      const response = await sendRequest(request);
      if (response.ok) {
        const agentId = response.data?.agentId as string;
        console.log(`Agent spawned: ${agentId}`);
        console.log("Run `sisyphus yield` when done spawning agents.");
      } else {
        console.error(`Error: ${response.error}`);
        if (response.error?.includes("Unknown session")) console.error("Hint: run `sisyphus list` to see active sessions.");
        process.exit(1);
      }
    });
}
