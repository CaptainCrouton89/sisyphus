import { writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { sessionsManifestPath, sessionsManifestTsvPath, isSisyphusSession } from '../shared/paths.js';
import { getTrackedSessionEntries } from './pane-monitor.js';
import { getSisyphusPhases, type SessionPhase } from './status-dots.js';
import * as tmux from './tmux.js';

interface ManifestEntry {
  type: 'S' | 'H';
  tmuxName: string;
  cwd: string;
  phase: SessionPhase | null;
  dashboardWindowId: string | null;
}

function atomicWrite(filePath: string, data: string): void {
  const tmpPath = join(dirname(filePath), `.manifest-${randomUUID()}.tmp`);
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath);
}

function buildEntries(): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const phases = getSisyphusPhases();

  // Sisyphus-managed sessions from tracked entries
  const trackedCwds = new Set<string>();
  for (const entry of getTrackedSessionEntries()) {
    const phaseInfo = phases.get(entry.id);
    trackedCwds.add(entry.cwd);
    entries.push({
      type: 'S',
      tmuxName: entry.tmuxSessionName,
      cwd: entry.cwd,
      phase: phaseInfo?.phase ?? null,
      dashboardWindowId: null,
    });
  }

  // Home sessions: non-ssyph_ sessions that have @sisyphus_cwd set
  // Query by session name (not $N ID) because $ in IDs gets shell-expanded by execSync
  const allSessions = tmux.listAllSessions();
  for (const { name } of allSessions) {
    if (isSisyphusSession(name)) continue;
    const cwd = tmux.getSessionOption(name, '@sisyphus_cwd')?.trim();
    if (!cwd) continue;
    const dashboardWindowId = tmux.getSessionOption(name, '@sisyphus_dashboard')?.trim() || null;
    entries.push({
      type: 'H',
      tmuxName: name,
      cwd,
      phase: null,
      dashboardWindowId,
    });
  }

  return entries;
}

function toTsv(entries: ManifestEntry[]): string {
  const ts = Math.floor(Date.now() / 1000);
  const lines = [`#ts:${ts}`];
  for (const e of entries) {
    lines.push(`${e.type}\t${e.tmuxName}\t${e.cwd}\t${e.phase ?? ''}\t${e.dashboardWindowId ?? ''}`);
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
