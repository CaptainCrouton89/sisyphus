import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';

export function registerSpawn(program: Command): void {
  program
    .command('spawn')
    .description('Spawn a new agent (orchestrator only)')
    .argument('[instruction]', 'Task instruction for the agent')
    .option('--agent-type <type>', 'Agent role label (default: worker)', 'worker')
    .requiredOption('--name <name>', 'Agent name')
    .option('--instruction <instruction>', 'Task instruction for the agent (or pipe via stdin)')
    .option('--repo <name>', 'Repo subdirectory to use for this agent')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (positionalInstruction: string | undefined, opts: { agentType: string; name: string; instruction?: string; repo?: string; session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      const instruction = opts.instruction ?? positionalInstruction ?? await readStdin();
      if (!instruction) {
        console.error('Error: --instruction is required (or pipe via stdin)');
        process.exit(1);
      }

      const sisyphusCwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (opts.repo && (opts.repo.includes('/') || opts.repo.includes('..') || opts.repo.includes('\\'))) {
        console.error('Error: --repo must be a directory name, not a path');
        process.exit(1);
      }

      if (opts.repo && opts.repo !== '.') {
        const repoPath = join(sisyphusCwd, opts.repo);
        if (!existsSync(repoPath)) {
          console.error(`Error: repo directory does not exist: ${repoPath}`);
          process.exit(1);
        }
      }

      const request: Request = {
        type: 'spawn',
        sessionId,
        agentType: opts.agentType,
        name: opts.name,
        instruction,
        ...(opts.repo ? { repo: opts.repo } : {}),
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
