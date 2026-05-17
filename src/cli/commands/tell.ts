import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { MessageSource } from '../../shared/types.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

interface TellOptions {
  session?: string;
  // Commander exposes `--no-submit` as `opts.submit`, defaulting to true.
  submit?: boolean;
  stdin?: boolean;
}

/**
 * Normalize a raw target string to a canonical agent ID.
 * - /^agent-\d+$/i → lowercased as-is
 * - /^\d+$/ → `agent-${raw}`
 * - else → exitUsage('bad_target', ...)
 */
export function normalizeAgentId(raw: string): string {
  if (/^agent-\d+$/i.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return `agent-${raw}`;
  exitUsage('bad_target', `target must be 'agent-NNN' or a bare number like '3' (got '${raw}')`, {
    received: raw,
    expected: ['agent-1', 'agent-3', '3'],
  });
}

function readStdinSync(): string {
  return readFileSync(0, 'utf-8');
}

function runTell(
  target: { kind: 'orchestrator' } | { kind: 'agent'; agentId: string },
  text: string,
  opts: TellOptions & { sessionId: string },
): Promise<void> {
  return (async () => {
    const source: MessageSource | undefined = process.env.SISYPHUS_AGENT_ID
      ? { type: 'agent' as const, agentId: process.env.SISYPHUS_AGENT_ID }
      : undefined;

    const submit = opts.submit !== false;
    const request: Request = {
      type: 'tell',
      sessionId: opts.sessionId,
      target,
      text,
      submit,
      ...(source ? { source } : {}),
    };
    const response = await sendRequest(request);
    if (!response.ok) exitError(response.error);

    const targetLabel = target.kind === 'orchestrator' ? 'orchestrator' : target.agentId;
    if (emitJsonOk({ target: targetLabel, submit })) return;
    console.log(`Sent to ${targetLabel}${submit ? '' : ' (not submitted)'}`);
  })();
}

async function resolveTextFromOpts(textArg: string | undefined, opts: TellOptions): Promise<string> {
  if (opts.stdin) {
    const text = readStdinSync();
    if (text === '') {
      exitUsage('empty_stdin', '--stdin set but stdin was empty', {
        next: 'pipe content: `echo "..." | sis orch tell --stdin`',
      });
    }
    if (textArg != null && textArg !== '') {
      exitUsage('stdin_conflict', '--stdin conflicts with [text] argument; pass one source', {
        received: { stdin: true, text: textArg },
      });
    }
    return text;
  }
  if (textArg == null || textArg === '') {
    exitUsage('missing_text', 'provide [text] argument or use --stdin', {
      next: 'sis orch tell "your text" — or sis orch tell --stdin <prompt.md',
    });
  }
  return textArg;
}

export function registerOrchTell(parent: Command): void {
  parent
    .command('tell [text]')
    .description('Type a prompt directly into the orchestrator pane. Submits immediately unlike `message`.')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--no-submit', 'Paste text but do not press Enter (caller can review/submit manually)')
    .option('--stdin', 'Read prompt body from stdin instead of the [text] argument (avoids shell escaping)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis orch tell "reset the focus to the auth module"
  $ cat prompt.md | sis orch tell --stdin --no-submit

When NOT to use:
  Use \`sis orch message\` to queue a message that the orchestrator sees on its
  next cycle (vs \`tell\` which types it now). Use \`sis ask submit\` to actively
  block waiting for a structured reply.

Output:
  Default       "Sent to orchestrator" on stdout.
  --json        { ok, schema_version: 1, data: { target, submit } }

Exit codes: 0 ok | 2 usage (missing text) | 3 not_found (unknown session) | 5 conflict (not running).`,
    )
    .action(async (textArg: string | undefined, opts: TellOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }
      const text = await resolveTextFromOpts(textArg, opts);
      await runTell({ kind: 'orchestrator' }, text, { ...opts, sessionId });
    });
}

export function registerAgentTell(parent: Command): void {
  parent
    .command('tell <id> [text]')
    .description('Type a prompt directly into an agent pane (agent-NNN). Submits immediately unlike `message`.')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--no-submit', 'Paste text but do not press Enter (caller can review/submit manually)')
    .option('--stdin', 'Read prompt body from stdin instead of the [text] argument (avoids shell escaping)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent io tell agent-3 "switch to investigation mode"
  $ sis agent io tell 3 "switch to investigation mode"
  $ cat prompt.md | sis agent io tell agent-3 --stdin --no-submit

When NOT to use:
  Use \`sis ask submit\` to actively block waiting for a structured reply.

Output:
  Default       "Sent to <agent>" on stdout.
  --json        { ok, schema_version: 1, data: { target, submit } }

Exit codes: 0 ok | 2 usage (bad target / missing text) | 3 not_found (unknown session/agent) | 5 conflict (agent not running).`,
    )
    .action(async (idRaw: string, textArg: string | undefined, opts: TellOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }
      const agentId = normalizeAgentId(idRaw);
      const text = await resolveTextFromOpts(textArg, opts);
      await runTell({ kind: 'agent', agentId }, text, { ...opts, sessionId });
    });
}
