import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, OrchestratorCycle } from '../../shared/types.js';
import { exitError, exitUsage } from '../errors.js';
import { isJsonMode } from '../output.js';
import { normalizeAgentId } from './tell.js';

interface ReadOptions {
  session?: string;
  cycle?: string;
  tail?: string;
  head?: string;
  raw?: boolean;
  summary?: boolean;
  toolDetail?: boolean;
}

const ORCH_ALIASES = new Set(['orchestrator', 'orch', 'o']);
const TURN_TYPES = new Set(['user', 'assistant']);

interface JsonlEntry {
  type?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

function projectDirFromCwd(cwd: string): string {
  // Claude Code project encoding: cwd with `/` → `-`. Leading `/` becomes leading `-`.
  return cwd.replace(/\//g, '-');
}

function transcriptPath(cwd: string, claudeSessionId: string): string {
  return join(homedir(), '.claude', 'projects', projectDirFromCwd(cwd), `${claudeSessionId}.jsonl`);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (${s.length - max} more chars)`;
}

function formatBlocks(content: unknown, toolDetail: boolean): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  const parts: string[] = [];
  for (const block of content as ContentBlock[]) {
    switch (block.type) {
      case 'text':
        parts.push(block.text ?? '');
        break;
      case 'thinking':
        parts.push(`[thinking]\n${block.thinking ?? ''}`);
        break;
      case 'tool_use': {
        const inputStr = JSON.stringify(block.input ?? {});
        parts.push(`[tool_use: ${block.name}] ${toolDetail ? inputStr : truncate(inputStr, 400)}`);
        break;
      }
      case 'tool_result': {
        const c = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
        parts.push(`[tool_result]\n${toolDetail ? c : truncate(c, 600)}`);
        break;
      }
      default:
        parts.push(`[${block.type ?? 'unknown'}] ${truncate(JSON.stringify(block), 200)}`);
    }
  }
  return parts.join('\n');
}

function summaryLine(entry: JsonlEntry): string {
  const role = (entry.type ?? '?').toUpperCase().padEnd(9);
  const ts = (entry.timestamp ?? '').slice(11, 19);
  const content = entry.message?.content;
  let preview = '';
  if (typeof content === 'string') {
    preview = content.replace(/\s+/g, ' ').slice(0, 120);
  } else if (Array.isArray(content)) {
    const blocks = content as ContentBlock[];
    const first = blocks[0];
    if (!first) preview = '(empty)';
    else if (first.type === 'text') preview = (first.text ?? '').replace(/\s+/g, ' ').slice(0, 120);
    else if (first.type === 'thinking') preview = `[thinking] ${(first.thinking ?? '').replace(/\s+/g, ' ').slice(0, 100)}`;
    else if (first.type === 'tool_use') preview = `[${first.name}] ${truncate(JSON.stringify(first.input ?? {}), 100)}`;
    else if (first.type === 'tool_result') {
      const c = typeof first.content === 'string' ? first.content : JSON.stringify(first.content ?? '');
      preview = `[tool_result] ${c.replace(/\s+/g, ' ').slice(0, 100)}`;
    } else preview = `[${first.type ?? '?'}]`;
    if (blocks.length > 1) preview += ` (+${blocks.length - 1} more block${blocks.length - 1 > 1 ? 's' : ''})`;
  }
  return `${role} ${ts}  ${preview}`;
}

async function emitTranscript(
  claudeSessionId: string,
  label: string,
  sessionCwd: string,
  opts: ReadOptions,
): Promise<void> {
  const path = transcriptPath(sessionCwd, claudeSessionId);
  if (!existsSync(path)) {
    exitError({
      code: 'transcript_not_found',
      kind: 'not_found',
      message: `transcript not found at ${path}`,
      received: path,
    });
  }

  const raw = readFileSync(path, 'utf-8');
  const json = isJsonMode();

  if (json && opts.raw) {
    exitUsage('flag_conflict', '--json and --raw are mutually exclusive', {
      expected: 'one of: --json, --raw',
    });
  }
  if (json && opts.summary) {
    exitUsage('flag_conflict', '--json and --summary are mutually exclusive', {
      expected: 'one of: --json, --summary',
    });
  }

  if (opts.raw) {
    process.stdout.write(raw);
    return;
  }

  const allEntries: JsonlEntry[] = raw
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line) as JsonlEntry; } catch { return null; } })
    .filter((e): e is JsonlEntry => e !== null);

  let entries = allEntries.filter(e => e.type && TURN_TYPES.has(e.type));

  const totalTurns = entries.length;
  const head = opts.head ? parseInt(opts.head, 10) : undefined;
  const tail = opts.tail ? parseInt(opts.tail, 10) : undefined;
  let sliceNote = '';
  if (head && Number.isFinite(head)) {
    entries = entries.slice(0, head);
    sliceNote = `first ${head} of ${totalTurns}`;
  }
  if (tail && Number.isFinite(tail)) {
    entries = entries.slice(-tail);
    sliceNote = sliceNote ? `${sliceNote}, then last ${tail}` : `last ${tail} of ${totalTurns}`;
  }

  if (json) {
    for (const e of entries) {
      process.stdout.write(JSON.stringify({
        role: e.type,
        timestamp: e.timestamp,
        content: e.message?.content,
      }) + '\n');
    }
    return;
  }

  console.log(`=== ${label} — ${entries.length} turn(s)${sliceNote ? ` (${sliceNote})` : ''} ===`);
  console.log(`transcript: ${path}\n`);

  if (opts.summary) {
    for (const e of entries) console.log(summaryLine(e));
    return;
  }

  for (const e of entries) {
    const role = (e.type ?? '?').toUpperCase();
    const ts = e.timestamp ?? '';
    const body = formatBlocks(e.message?.content, opts.toolDetail ?? false);
    console.log(`──── ${role} ${ts} ────`);
    console.log(body);
    console.log('');
  }
}

async function fetchSession(sessionId: string): Promise<Session> {
  const response = await sendRequest({ type: 'status', sessionId, cwd: process.cwd() } as Request);
  if (!response.ok) exitError(response.error);
  const session = (response.data as { session?: Session })?.session;
  if (!session) {
    exitError({
      code: 'no_session_in_status',
      kind: 'not_found',
      message: 'status response did not include session',
      received: sessionId,
    });
  }
  return session;
}

export function registerOrchRead(parent: Command): void {
  parent
    .command('read')
    .description("Print the Claude conversation transcript for the orchestrator.")
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--cycle <n>', 'Orchestrator cycle number (default: most recent live, else last completed)')
    .option('--tail <n>', 'Show last N turns', undefined)
    .option('--head <n>', 'Show first N turns', undefined)
    .option('--raw', 'Print raw JSONL (no formatting, no filtering) — orthogonal to --json')
    .option('--summary', 'One-line-per-turn summary instead of full content')
    .option('--tool-detail', 'Include full tool inputs/outputs (default: truncated to 400/600 chars)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis orch read --tail 5
  $ sis orch read --cycle 2 --json | jq -r '.content[0].text'

Output:
  Default       Decorated transcript on stdout, header line + role-tagged blocks.
  --json        JSONL on stdout, one object per turn: { role, timestamp, content }
                (no \`{ok, schema_version}\` envelope — this is a stream, agents
                consume turn-at-a-time).
  --raw         Raw transcript JSONL from disk, unfiltered.

Mutual exclusions:
  --raw + --json     reject (exit 2)
  --summary + --json reject (exit 2)

Exit codes: 0 ok | 2 usage | 3 not_found (session/cycle/transcript).`,
    )
    .action(async (opts: ReadOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const session = await fetchSession(sessionId);

      let cycle: OrchestratorCycle | undefined;
      if (opts.cycle) {
        const n = parseInt(opts.cycle, 10);
        if (!Number.isFinite(n)) {
          exitUsage('bad_cycle', '--cycle must be a number', { received: opts.cycle });
        }
        cycle = session.orchestratorCycles.find(c => c.cycle === n);
        if (!cycle) {
          exitError({
            code: 'cycle_not_found',
            kind: 'not_found',
            message: `orchestrator cycle ${n} not found in session`,
            received: n,
            expected: session.orchestratorCycles.map(c => c.cycle),
          });
        }
      } else {
        cycle = [...session.orchestratorCycles].reverse().find(c => !c.completedAt) ?? session.orchestratorCycles.at(-1);
      }
      if (!cycle) {
        exitError({
          code: 'no_cycles',
          kind: 'not_found',
          message: 'no orchestrator cycles found',
          received: sessionId,
        });
      }

      const claudeSessionId = cycle.claudeSessionId;
      const label = `orchestrator cycle ${cycle.cycle}${cycle.completedAt ? ' (completed)' : ' (live)'}`;

      if (!claudeSessionId) {
        exitError({
          code: 'no_claude_session',
          kind: 'not_found',
          message: `no claudeSessionId stored for ${label} — transcript may not exist yet`,
          received: sessionId,
        });
      }

      await emitTranscript(claudeSessionId, label, session.cwd, opts);
    });
}

export function registerAgentRead(parent: Command): void {
  parent
    .command('read <id>')
    .description("Print the Claude conversation transcript for an agent (agent-NNN).")
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--tail <n>', 'Show last N turns', undefined)
    .option('--head <n>', 'Show first N turns', undefined)
    .option('--raw', 'Print raw JSONL (no formatting, no filtering) — orthogonal to --json')
    .option('--summary', 'One-line-per-turn summary instead of full content')
    .option('--tool-detail', 'Include full tool inputs/outputs (default: truncated to 400/600 chars)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent io read agent-3 --summary
  $ sis agent io read 3 --json | jq -r '.content[0].text'

Output:
  Default       Decorated transcript on stdout, header line + role-tagged blocks.
  --json        JSONL on stdout, one object per turn: { role, timestamp, content }
  --raw         Raw transcript JSONL from disk, unfiltered.

Mutual exclusions:
  --raw + --json     reject (exit 2)
  --summary + --json reject (exit 2)

Exit codes: 0 ok | 2 usage | 3 not_found (session/agent/transcript).`,
    )
    .action(async (idRaw: string, opts: ReadOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const agentId = normalizeAgentId(idRaw);
      const session = await fetchSession(sessionId);

      const ag = session.agents.find(a => a.id === agentId);
      if (!ag) {
        exitError({
          code: 'unknown_agent',
          kind: 'not_found',
          message: `agent ${agentId} not found in session ${sessionId}`,
          received: agentId,
          candidates: session.agents.map(a => a.id),
          next: 'sis session inspect status to list agents',
        });
      }

      const claudeSessionId = ag.claudeSessionId;
      const label = `agent ${ag.id} — ${ag.name} (${ag.status})`;

      if (!claudeSessionId) {
        exitError({
          code: 'no_claude_session',
          kind: 'not_found',
          message: `no claudeSessionId stored for ${label} — transcript may not exist yet`,
          received: agentId,
        });
      }

      await emitTranscript(claudeSessionId, label, session.cwd, opts);
    });
}
