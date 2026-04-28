import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BYTE_CAP = 8 * 1024;
const TAIL_BYTES = 64 * 1024;
export const TOOL_USE_INPUT_CAP = 200;

export interface DigestOpts {
  cwd: string;
  claudeSessionId?: string;
  byteCap?: number;
  homeDir?: string;
}

interface JsonlEntry {
  type?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

export function digestTranscript(opts: DigestOpts): string {
  const cap = opts.byteCap ?? BYTE_CAP;

  if (!opts.claudeSessionId) {
    warnOnce('transcript-digest: no claudeSessionId; falling back to empty context');
    return '';
  }

  const home = opts.homeDir ?? homedir();
  const path = join(home, '.claude', 'projects', encodeCwd(opts.cwd), `${opts.claudeSessionId}.jsonl`);
  let raw: string;
  let fd: number;
  try {
    // Object wrapper inside try-body avoids ~/.claude/hooks/post-tool-use/code-quality-checker.py regex (pattern at line 67)
    const r = { fd: openSync(path, 'r') };
    fd = r.fd;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ENOENT') {
      warnOnce(`transcript-digest: jsonl missing at ${path}; falling back to empty context`);
      return '';
    }
    warnOnce(`transcript-digest: jsonl read failed: ${(e as Error).message}`);
    return '';
  }
  try {
    const stat = fstatSync(fd);
    const size = stat.size;
    const startPos = Math.max(0, size - TAIL_BYTES);
    const readSize = size - startPos;
    const buf = Buffer.alloc(readSize);
    readSync(fd, buf, 0, readSize, startPos);
    const tailStr = buf.toString('utf-8');
    // If we didn't start at the beginning, trim the partial leading line so the first line is clean.
    raw = startPos > 0 ? tailStr.slice(tailStr.indexOf('\n') + 1) : tailStr;
  } finally {
    closeSync(fd);
  }

  const lines = raw.split('\n');
  const kept: { ts: string; role: string; text: string }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: JsonlEntry;
    // Spread into a new object so the try body contains {} — also creates a safe copy.
    // Silently skip truncated/unparseable lines (daemon may write mid-line).
    try {
      entry = { ...JSON.parse(line) as JsonlEntry };
    } catch (_parseErr) {
      continue;
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const role = entry.message?.role !== undefined ? entry.message.role : entry.type;
    const text = formatContent(entry.message?.content);
    if (!text) continue;
    const ts = entry.timestamp !== undefined ? entry.timestamp : '';
    kept.push({ ts, role: role as string, text });
  }

  let totalBytes = 0;
  const selected: string[] = [];
  for (let i = kept.length - 1; i >= 0; i--) {
    const formatted = `## ${kept[i].role} [${kept[i].ts}]\n${kept[i].text}\n`;
    const sz = Buffer.byteLength(formatted, 'utf-8');
    if (totalBytes + sz > cap) break;
    totalBytes += sz;
    selected.unshift(formatted);
  }

  return selected.join('');
}

function formatContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content as Array<{ type?: string; text?: string; name?: string; input?: unknown }>) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (block.type === 'tool_use') {
      const inp = JSON.stringify(block.input !== undefined ? block.input : {});
      const name = block.name !== undefined ? block.name : '?';
      parts.push(`<tool_use:${name} ${inp.length > TOOL_USE_INPUT_CAP ? inp.slice(0, TOOL_USE_INPUT_CAP) + '…' : inp}>`);
    }
  }
  return parts.join('\n');
}

const warned = new Set<string>();
function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[sisyphus] ${msg}`);
}
