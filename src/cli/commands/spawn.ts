import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { readStdin } from '../stdin.js';
import { assertTmux } from '../tmux.js';
import { discoverAgentTypes } from '../../daemon/frontmatter.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk, isJsonMode } from '../output.js';

function listTypes(): void {
  const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();
  const pluginDir = resolve(import.meta.dirname, '..', 'templates', 'agent-plugin');
  const types = discoverAgentTypes(pluginDir, cwd);

  if (isJsonMode()) {
    emitJsonOk({ agentTypes: types });
    return;
  }

  if (types.length === 0) {
    console.log('No agent types found.');
    return;
  }

  const maxName = Math.max(...types.map(t => t.qualifiedName.length), 4);
  const maxSource = Math.max(...types.map(t => t.source.length), 6);

  console.log(`${'TYPE'.padEnd(maxName)}  ${'SOURCE'.padEnd(maxSource)}  DESCRIPTION`);
  for (const t of types) {
    const desc = t.description ?? '';
    console.log(`${t.qualifiedName.padEnd(maxName)}  ${t.source.padEnd(maxSource)}  ${desc}`);
  }
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn')
    .description('Spawn a new agent (orchestrator only)')
    .argument('[instruction]', 'Task instruction for the agent')
    .option('--agent-type <type>', 'Agent type (e.g. sisyphus:debug, sisyphus:explore)', 'worker')
    .option('--name <name>', 'Agent name')
    .option('--instruction <instruction>', 'Task instruction for the agent (or pipe via stdin)')
    .option('--stdin', 'Force-read instruction from stdin (avoids shell escaping for long prompts)')
    .option('--repo <name>', 'Repo subdirectory to use for this agent')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .option('--list-types', 'List available agent types and exit')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent spawn --agent-type sisyphus:explore --name find-auth "Locate auth middleware in src/"
  $ cat big-prompt.md | sis agent spawn --stdin --agent-type devcore:programmer --name impl-1
  $ sis agent spawn --list-types --json

Output:
  Default       "Agent spawned: <agentId>" plus follow-up hints.
  --json        { ok, schema_version: 1, data: { agentId, sessionId, agentType, name } }
                For --list-types: { agentTypes: [{qualifiedName, source, description}, ...] }

Exit codes: 0 ok | 2 usage (missing --name / --session / instruction) | 3 not_found (unknown session) | 5 conflict.

Next on success:
  $ sis agent await <agentId>   # block on this agent's final report
  $ sis orch yield               # when done spawning all agents this cycle

Delegate outcomes, not implementations — say what needs to happen and why,
not the code to write.

Slash commands: prefix the instruction with /skill:name to load a methodology:
  $ sis agent spawn --agent-type sisyphus:debug --name dbg \\
      "/devcore:debugging session tokens expire early. Check src/middleware/auth.ts"

Inline understanding: for mid-flow "why does X behave this way?" / "what's the
contract between X and Y?" questions, spawn sisyphus:explore and consume its
report inline (await it). One explore per system, spawned in parallel, awaited
concurrently — raw search noise stays out of your context. Don't await
long-running implementors; you'll burn the turn waiting.`,
    )
    .action(async (positionalInstruction: string | undefined, opts: { agentType: string; name?: string; instruction?: string; stdin?: boolean; repo?: string; session?: string; listTypes?: boolean }) => {
      if (opts.listTypes) {
        listTypes();
        return;
      }

      if (!opts.name) {
        exitUsage('missing_name', 'required option --name <name> not specified', {
          expected: 'a string',
          next: 'pass --name <agent-name>',
        });
      }

      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const positional = positionalInstruction === '-' ? undefined : positionalInstruction;
      let instruction: string | null | undefined;
      if (opts.stdin) {
        instruction = await readStdin({ force: true });
        if (!instruction) {
          exitUsage('empty_stdin', '--stdin set but no input received on stdin', {
            next: 'pipe content into the command: `cat prompt.md | sis agent spawn --stdin ...`',
          });
        }
        if (opts.instruction || positional) {
          exitUsage('stdin_conflict', '--stdin conflicts with --instruction / [instruction]; pass one source', {
            received: { stdin: true, instruction: opts.instruction ?? positional },
          });
        }
      } else {
        instruction = opts.instruction ?? positional ?? await readStdin();
      }
      if (!instruction) {
        exitUsage('missing_instruction', '--instruction is required (or pipe via stdin / use --stdin)', {
          next: 'sis agent spawn --instruction "..." or sis agent spawn --stdin <prompt.md',
        });
      }
      if (instruction.trim().length < 20) {
        exitUsage('instruction_too_short', `instruction too short (${instruction.trim().length} chars). Did you mean to pipe via stdin?`, {
          received: instruction.trim(),
          expected: 'at least 20 characters of instruction',
          next: "Use '-' as the positional or omit it entirely, then pipe via stdin.",
        });
      }

      const sisyphusCwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      if (opts.repo && (opts.repo.includes('/') || opts.repo.includes('..') || opts.repo.includes('\\'))) {
        exitUsage('repo_path_invalid', '--repo must be a directory name, not a path', {
          received: opts.repo,
          expected: 'a single directory name without "/" or ".."',
        });
      }

      if (opts.repo && opts.repo !== '.') {
        const repoPath = join(sisyphusCwd, opts.repo);
        if (!existsSync(repoPath)) {
          exitError({
            code: 'repo_not_found',
            kind: 'not_found',
            message: `repo directory does not exist: ${repoPath}`,
            received: opts.repo,
            next: `mkdir ${opts.repo} or pick a different --repo`,
          });
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
      if (!response.ok) exitError(response.error);
      const agentId = response.data?.agentId as string;
      if (emitJsonOk({ agentId, sessionId, agentType: opts.agentType, name: opts.name })) return;
      console.log(`Agent spawned: ${agentId}`);
      console.log(`Tip: \`sis agent await ${agentId}\` blocks for the report and consumes it inline (won't appear in next cycle).`);
      console.log('Run `sis orch yield` when done spawning agents.');
    });
}
