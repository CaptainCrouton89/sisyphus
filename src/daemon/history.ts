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
      crashCount: session.agents.filter(a => a.status === 'crashed').length,
      lostCount: session.agents.filter(a => a.status === 'lost').length,
      killedAgentCount: session.agents.filter(a => a.status === 'killed').length,
      rollbackCount: session.rollbackCount ?? 0,
      efficiency: session.wallClockMs ? session.activeMs / session.wallClockMs : null,
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
        restartCount: a.restartCount ?? 0,
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

/**
 * Load the most recent non-null sentiments from session history.
 * Scans at most `scanLimit` dirs (by mtime, newest first) to avoid reading everything.
 */
export function getRecentSentiments(count = 5, scanLimit = 30, overrideBaseDir?: string): Array<{ sentiment: string; task: string; completedAt: string }> {
  try {
    const base = overrideBaseDir ?? historyBaseDir();
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      return [];
    }

    // Sort dirs by mtime descending (newest first)
    const withMtime: Array<{ name: string; mtime: number }> = [];
    for (const name of entries) {
      try {
        const st = statSync(join(base, name));
        if (st.isDirectory()) withMtime.push({ name, mtime: st.mtimeMs });
      } catch { continue; }
    }
    withMtime.sort((a, b) => b.mtime - a.mtime);

    const results: Array<{ sentiment: string; task: string; completedAt: string }> = [];
    const limit = Math.min(withMtime.length, scanLimit);
    for (let i = 0; i < limit && results.length < count; i++) {
      try {
        const raw = readFileSync(join(base, withMtime[i].name, 'session.json'), 'utf-8');
        const summary = JSON.parse(raw) as SessionSummary;
        if (summary.sentiment) {
          results.push({
            sentiment: summary.sentiment,
            task: summary.task.slice(0, 100),
            completedAt: summary.completedAt,
          });
        }
      } catch { continue; }
    }
    return results;
  } catch {
    return [];
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
        // No session.json — try first line of events.jsonl for stable creation timestamp
        try {
          const eventsPath = join(dir, 'events.jsonl');
          const firstLine = readFileSync(eventsPath, 'utf-8').split('\n')[0];
          const firstEvent = JSON.parse(firstLine) as { ts?: string };
          sessions.push({ dir, startedAt: new Date(firstEvent.ts ?? 0).getTime() });
        } catch {
          // Fall back to dir mtime only if events.jsonl is unreadable
          try {
            const st = statSync(dir);
            sessions.push({ dir, startedAt: st.mtimeMs });
          } catch {
            continue;
          }
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
