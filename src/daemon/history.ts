import { appendFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { historySessionDir, historyEventsPath, historySessionSummaryPath, historyBaseDir } from '../shared/paths.js';
import type { HistoryEventType, SessionSummary } from '../shared/history-types.js';
import type { MoodSignals } from '../shared/companion-types.js';
import type { Session } from '../shared/types.js';

// Track which session dirs have been created this process to skip redundant mkdirSync
const knownDirs = new Set<string>();

function ensureDir(sessionId: string): void {
  if (knownDirs.has(sessionId)) return;
  mkdirSync(historySessionDir(sessionId), { recursive: true });
  knownDirs.add(sessionId);
}

export function emitHistoryEvent(sessionId: string, event: HistoryEventType, data: Record<string, unknown>): void {
  try {
    ensureDir(sessionId);
    const line = JSON.stringify({ ts: new Date().toISOString(), event, sessionId, data }) + '\n';
    appendFileSync(historyEventsPath(sessionId), line, 'utf-8');
  } catch {
    // Fire-and-forget — history is best-effort
  }
}

export function writeSessionSummary(
  session: Session,
  extra?: { achievements?: string[]; xpGained?: number; finalSignals?: MoodSignals; sentiment?: string },
): void {
  try {
    ensureDir(session.id);

    const summary: SessionSummary = {
      sessionId: session.id,
      name: session.name ?? null,
      task: session.task,
      cwd: session.cwd,
      model: session.model ?? null,
      status: session.status,
      startedAt: session.createdAt,
      completedAt: session.completedAt ?? new Date().toISOString(),
      activeMs: session.activeMs,
      wallClockMs: session.wallClockMs ?? null,
      agentCount: session.agents.length,
      cycleCount: session.orchestratorCycles.length,
      context: session.context ?? null,
      completionReport: session.completionReport ?? null,
      agents: session.agents.map(a => ({
        id: a.id,
        name: a.name,
        nickname: a.nickname ?? null,
        agentType: a.agentType,
        status: a.status,
        activeMs: a.activeMs,
        spawnedAt: a.spawnedAt,
        completedAt: a.completedAt,
      })),
      cycles: session.orchestratorCycles.map(c => ({
        cycle: c.cycle,
        mode: c.mode ?? null,
        agentsSpawned: c.agentsSpawned.length,
        activeMs: c.activeMs,
        startedAt: c.timestamp,
        completedAt: c.completedAt ?? null,
      })),
      messages: session.messages.map(m => ({
        id: m.id,
        source: typeof m.source === 'string' ? m.source : m.source.type,
        content: m.content,
        timestamp: m.timestamp,
      })),
      finalMoodSignals: extra?.finalSignals ?? null,
      achievements: extra?.achievements ?? [],
      xpGained: extra?.xpGained ?? 0,
      sentiment: extra?.sentiment ?? null,
    };

    const filePath = historySessionSummaryPath(session.id);
    const tmp = join(dirname(filePath), `.session-${randomUUID()}.tmp`);
    writeFileSync(tmp, JSON.stringify(summary, null, 2), 'utf-8');
    renameSync(tmp, filePath);
  } catch (err) {
    console.error(`[history] Failed to write session summary for ${session.id}:`, err);
  }
}

const PRUNE_KEEP_COUNT = 200;
const PRUNE_KEEP_DAYS = 90;

export function pruneHistory(): void {
  try {
    const base = historyBaseDir();
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      return; // No history dir yet
    }

    // Collect session dirs with their timestamps
    const sessions: Array<{ dir: string; startedAt: number }> = [];
    for (const name of entries) {
      const dir = join(base, name);
      try {
        const summaryPath = join(dir, 'session.json');
        const raw = readFileSync(summaryPath, 'utf-8');
        const summary = JSON.parse(raw) as { startedAt?: string };
        sessions.push({ dir, startedAt: new Date(summary.startedAt ?? 0).getTime() });
      } catch {
        // No session.json — fall back to dir mtime
        try {
          const st = statSync(dir);
          sessions.push({ dir, startedAt: st.mtimeMs });
        } catch {
          continue;
        }
      }
    }

    if (sessions.length <= PRUNE_KEEP_COUNT) return;

    // Sort newest first
    sessions.sort((a, b) => b.startedAt - a.startedAt);

    const cutoff = Date.now() - PRUNE_KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (let i = PRUNE_KEEP_COUNT; i < sessions.length; i++) {
      if (sessions[i].startedAt < cutoff) {
        rmSync(sessions[i].dir, { recursive: true, force: true });
      }
    }
  } catch {
    // Pruning is best-effort
  }
}
