import { writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { sessionsManifestPath, sessionsManifestTsvPath, isSisyphusSession } from '../shared/paths.js';
import { getTrackedSessionEntries } from './pane-monitor.js';
import { getSisyphusPhases, type SessionPhase } from './status-dots.js';
import * as tmux from './tmux.js';

interface ManifestEntry {
  type: 'S' | 'H' | 'O';
  tmuxName: string;
  tmuxSessionId: string;
  cwd: string;
  phase: SessionPhase | null;
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = join(dirname(filePath), `.manifest-${randomUUID()}.tmp`);
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath);
}

function buildEntries(): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const phases = getSisyphusPhases();

  // One canonical name→$N map for this poll so downstream consumers (shell
  // scripts using the TSV) can target sessions by $N instead of name —
  // tmux 3.6a's -t <name> silently substring-matches under sparse env.
  const allSessions = tmux.listAllSessions();
  const nameToId = new Map(allSessions.map(s => [s.name, s.sessionId]));

  // Sisyphus-managed sessions from tracked entries
  const trackedTmuxNames = new Set<string>();
  for (const entry of getTrackedSessionEntries()) {
    const tmuxSessId = nameToId.get(entry.tmuxSessionName);
    if (!tmuxSessId) continue; // session died between poll steps
    const phaseInfo = phases.get(entry.id);
    trackedTmuxNames.add(entry.tmuxSessionName);
    entries.push({
      type: 'S',
      tmuxName: entry.tmuxSessionName,
      tmuxSessionId: tmuxSessId,
      cwd: entry.cwd,
      phase: phaseInfo?.phase ?? null,
    });
  }

  // Home sessions: non-ssyph_ sessions that have @sisyphus_cwd set.
  // Orchestrator-resume sessions (O): ssyph_* sessions NOT tracked by the daemon
  // but stamped with @sisyphus_cwd and @sisyphus_session_id — spawned by the TUI
  // via openClaudeResumeSession for post-mortem review of completed sessions.
  for (const { name, sessionId: tmuxSessId } of allSessions) {
    const cwd = tmux.getSessionOption(tmuxSessId, '@sisyphus_cwd')?.trim();
    if (!cwd) continue;
    if (isSisyphusSession(name)) {
      if (trackedTmuxNames.has(name)) continue;
      const sessionId = tmux.getSessionOption(tmuxSessId, '@sisyphus_session_id')?.trim();
      if (!sessionId) continue;
      entries.push({
        type: 'O',
        tmuxName: name,
        tmuxSessionId: tmuxSessId,
        cwd,
        phase: null,
      });
      continue;
    }
    entries.push({
      type: 'H',
      tmuxName: name,
      tmuxSessionId: tmuxSessId,
      cwd,
      phase: null,
    });
  }

  return entries;
}

function toTsv(entries: ManifestEntry[]): string {
  const ts = Math.floor(Date.now() / 1000);
  // Columns: type | name | cwd | phase | tmuxSessionId.
  // Appended at end so existing 4-column consumers keep working.
  const lines = [`#ts:${ts}`];
  for (const e of entries) {
    lines.push(`${e.type}\t${e.tmuxName}\t${e.cwd}\t${e.phase ?? '-'}\t${e.tmuxSessionId}`);
  }
  return lines.join('\n') + '\n';
}

function toJson(entries: ManifestEntry[]): string {
  return JSON.stringify({
    updatedAt: Date.now(),
    sessions: entries,
  }, null, 2);
}

export function writeManifest(): void {
  const entries = buildEntries();
  atomicWrite(sessionsManifestTsvPath(), toTsv(entries));
  atomicWrite(sessionsManifestPath(), toJson(entries));
}

export function writeEmptyManifest(): void {
  const ts = Math.floor(Date.now() / 1000);
  atomicWrite(sessionsManifestTsvPath(), `#ts:${ts}\n`);
  atomicWrite(sessionsManifestPath(), JSON.stringify({ updatedAt: Date.now(), sessions: [] }, null, 2));
}
