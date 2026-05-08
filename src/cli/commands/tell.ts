import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { MessageSource } from '../../shared/types.js';

interface TellOptions {
  session?: string;
  // Commander exposes `--no-submit` as `opts.submit`, defaulting to true.
  submit?: boolean;
  stdin?: boolean;
}

const ORCH_ALIASES = new Set(['orchestrator', 'orch', 'o']);

function parseTarget(raw: string): { kind: 'orchestrator' } | { kind: 'agent'; agentId: string } | null {
  if (ORCH_ALIASES.has(raw)) return { kind: 'orchestrator' };
  if (/^agent-\d+$/i.test(raw)) return { kind: 'agent', agentId: raw };
  return null;
}

function readStdin(): string {
  // Synchronous read of all stdin. Same pattern as other CLI commands that take piped input.
  return readFileSync(0, 'utf-8');
}

export function registerTell(program: Command): void {
  program
    .command('tell <target> [text]')
    .description('Type a prompt directly into a running pane (orchestrator or agent-NNN). Submits immediately unlike `message`.')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--no-submit', 'Paste text but do not press Enter (caller can review/submit manually)')
    .option('--stdin', 'Read prompt body from stdin instead of the [text] argument (avoids shell escaping)')
    .action(async (targetRaw: string, textArg: string | undefined, opts: TellOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID');
        process.exit(1);
      }

      const target = parseTarget(targetRaw);
      if (!target) {
        console.error(`Error: target must be 'orchestrator' (or 'o'/'orch') or 'agent-NNN', got: ${targetRaw}`);
        process.exit(1);
      }

      let text: string;
      if (opts.stdin) {
        text = readStdin();
        if (text === '') {
          console.error('Error: --stdin set but stdin was empty');
          process.exit(1);
        }
        if (textArg != null && textArg !== '') {
          console.error('Error: --stdin conflicts with [text] argument; pass one source');
          process.exit(1);
        }
      } else {
        if (textArg == null || textArg === '') {
          console.error('Error: provide [text] argument or use --stdin');
          process.exit(1);
        }
        text = textArg;
      }

      const source: MessageSource | undefined = process.env.SISYPHUS_AGENT_ID
        ? { type: 'agent' as const, agentId: process.env.SISYPHUS_AGENT_ID }
        : undefined;

      const submit = opts.submit !== false;
      const request: Request = {
        type: 'tell',
        sessionId,
        target,
        text,
        submit,
        ...(source ? { source } : {}),
      };
      const response = await sendRequest(request);
      if (response.ok) {
        console.log(`Sent to ${targetRaw}${submit ? '' : ' (not submitted)'}`);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
