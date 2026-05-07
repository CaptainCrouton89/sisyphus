import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, OrchestratorCycle } from '../../shared/types.js';

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

export function registerRead(program: Command): void {
  program
    .command('read <target>')
    .description("Print the Claude conversation transcript for a target ('orchestrator' or 'agent-NNN').")
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID)')
    .option('--cycle <n>', 'Orchestrator cycle number (default: most recent live, else last completed)')
    .option('--tail <n>', 'Show last N turns', undefined)
    .option('--head <n>', 'Show first N turns', undefined)
    .option('--raw', 'Print raw JSONL (no formatting, no filtering)')
    .option('--summary', 'One-line-per-turn summary instead of full content')
    .option('--tool-detail', 'Include full tool inputs/outputs (default: truncated to 400/600 chars)')
    .action(async (targetRaw: string, opts: ReadOptions) => {
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID');
        process.exit(1);
      }

      const response = await sendRequest({ type: 'status', sessionId, cwd: process.cwd() } as Request);
      if (!response.ok) {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
      const session = (response.data as { session?: Session })?.session;
      if (!session) {
        console.error('Error: status response did not include session');
        process.exit(1);
      }

      let claudeSessionId: string | undefined;
      let label: string;
      if (ORCH_ALIASES.has(targetRaw)) {
        let cycle: OrchestratorCycle | undefined;
        if (opts.cycle) {
          const n = parseInt(opts.cycle, 10);
          if (!Number.isFinite(n)) {
            console.error(`Error: --cycle must be a number, got: ${opts.cycle}`);
            process.exit(1);
          }
          cycle = session.orchestratorCycles.find(c => c.cycle === n);
          if (!cycle) {
            console.error(`Error: orchestrator cycle ${n} not found in session`);
            process.exit(1);
          }
        } else {
          cycle = [...session.orchestratorCycles].reverse().find(c => !c.completedAt) ?? session.orchestratorCycles.at(-1);
        }
        if (!cycle) {
          console.error('Error: no orchestrator cycles found');
          process.exit(1);
        }
        claudeSessionId = cycle.claudeSessionId;
        label = `orchestrator cycle ${cycle.cycle}${cycle.completedAt ? ' (completed)' : ' (live)'}`;
      } else if (/^agent-\d+$/i.test(targetRaw)) {
        const ag = session.agents.find(a => a.id === targetRaw);
        if (!ag) {
          console.error(`Error: agent ${targetRaw} not found in session ${sessionId}`);
          process.exit(1);
        }
        claudeSessionId = ag.claudeSessionId;
        label = `agent ${ag.id} — ${ag.name} (${ag.status})`;
      } else {
        console.error(`Error: target must be 'orchestrator' (or 'o'/'orch') or 'agent-NNN', got: ${targetRaw}`);
        process.exit(1);
      }

      if (!claudeSessionId) {
        console.error(`Error: no claudeSessionId stored for ${label} — transcript may not exist yet`);
        process.exit(1);
      }

      const path = transcriptPath(session.cwd, claudeSessionId);
      if (!existsSync(path)) {
        console.error(`Error: transcript not found at ${path}`);
        process.exit(1);
      }

      const raw = readFileSync(path, 'utf-8');

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
    });
}
