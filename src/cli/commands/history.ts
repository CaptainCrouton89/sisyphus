import type { Command } from 'commander';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { historyBaseDir, historySessionDir, historyEventsPath, historySessionSummaryPath, statePath } from '../../shared/paths.js';
import { formatDuration, statusColor, bold, dim, colorize } from '../../shared/format.js';
import type { SessionSummary, SessionSummaryAgent } from '../../shared/history-types.js';
import type { HistoryEvent } from '../../shared/history-types.js';
import type { Session } from '../../shared/types.js';
import { exitUsage } from '../errors.js';
import { emitJsonOk, isJsonMode } from '../output.js';

function c(color: string, text: string): string {
  return colorize(text, color);
}

// Agent types that run interactive TUI sessions. Their activeMs includes
// user think-time while the pane is open — not actual compute. Treat
// separately from compute-only agent types in efficiency metrics.
const INTERACTIVE_AGENT_TYPES = new Set<string>([
  'sisyphus:requirements',
  'sisyphus:design',
  'sisyphus:spec',
]);

function isInteractiveAgent(agentType: string | null | undefined): boolean {
  return agentType != null && INTERACTIVE_AGENT_TYPES.has(agentType);
}

function splitAgentTime(agents: SessionSummaryAgent[]): { computeMs: number; interactiveMs: number; blockedMs: number } {
  let computeMs = 0;
  let interactiveMs = 0;
  let blockedMs = 0;
  for (const a of agents) {
    const blocked = a.userBlockedMs ?? 0;
    const remaining = Math.max(0, a.activeMs - blocked);
    blockedMs += blocked;
    if (isInteractiveAgent(a.agentType)) interactiveMs += remaining;
    else computeMs += remaining;
  }
  return { computeMs, interactiveMs, blockedMs };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadAllSummaries(): Array<{ id: string; summary: SessionSummary }> {
  const base = historyBaseDir();
  if (!existsSync(base)) return [];

  const results: Array<{ id: string; summary: SessionSummary }> = [];
  for (const name of readdirSync(base)) {
    const summaryPath = historySessionSummaryPath(name);
    if (existsSync(summaryPath)) {
      try {
        const raw = readFileSync(summaryPath, 'utf-8');
        results.push({ id: name, summary: JSON.parse(raw) as SessionSummary });
        continue;
      } catch { /* fall through to live rebuild */ }
    }
    // No session.json — synthesize from live state if session is still in-flight
    const live = buildLiveSummary(name);
    if (live) results.push({ id: name, summary: live });
  }
  // Newest first
  results.sort((a, b) => new Date(b.summary.startedAt).getTime() - new Date(a.summary.startedAt).getTime());
  return results;
}

/**
 * Synthesize a SessionSummary on demand for an in-flight session (no `session.json` yet).
 * Reads the session's `cwd` from the first `session-start` event, then reads live
 * `state.json` and maps it to the same shape `writeSessionSummary` produces.
 * Fields that are only finalized at completion are marked null/empty.
 * Returns null if events or live state can't be read.
 */
function buildLiveSummary(sessionId: string): SessionSummary | null {
  const eventsPath = historyEventsPath(sessionId);
  if (!existsSync(eventsPath)) return null;

  // Extract cwd from the session-start event (only place it's recorded in the history dir)
  let cwd: string | null = null;
  try {
    const lines = readFileSync(eventsPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as HistoryEvent;
        if (ev.event === 'session-start' && typeof ev.data.cwd === 'string') {
          cwd = ev.data.cwd;
          break;
        }
      } catch { continue; }
    }
  } catch { return null; }
  if (!cwd) return null;

  const sPath = statePath(cwd, sessionId);
  if (!existsSync(sPath)) return null;

  let session: Session;
  try {
    session = JSON.parse(readFileSync(sPath, 'utf-8')) as Session;
  } catch { return null; }

  // Live wall clock: created → now. activeMs is already flushed periodically by the daemon;
  // both may lag the true live value by one poll interval (~seconds), acceptable for a read-only view.
  const liveWallClockMs = Date.now() - new Date(session.createdAt).getTime();

  return {
    sessionId: session.id,
    name: session.name ?? null,
    task: session.task,
    cwd: session.cwd,
    model: session.model ?? null,
    status: session.status,
    startedAt: session.createdAt,
    completedAt: session.completedAt ?? null,
    activeMs: session.activeMs,
    wallClockMs: session.wallClockMs ?? liveWallClockMs,
    userBlockedMs: session.userBlockedMs ?? 0,
    agentCount: session.agents.length,
    crashCount: session.agents.filter(a => a.status === 'crashed').length,
    lostCount: session.agents.filter(a => a.status === 'lost').length,
    killedAgentCount: session.agents.filter(a => a.status === 'killed').length,
    rollbackCount: session.rollbackCount ?? 0,
    efficiency: liveWallClockMs > 0
      ? Math.max(0, session.activeMs - (session.userBlockedMs ?? 0))
        / Math.max(1, liveWallClockMs - (session.userBlockedMs ?? 0))
      : null,
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
      userBlockedMs: a.userBlockedMs ?? 0,
      spawnedAt: a.spawnedAt,
      completedAt: a.completedAt,
      restartCount: a.restartCount ?? 0,
    })),
    cycles: session.orchestratorCycles.map(c => ({
      cycle: c.cycle,
      mode: c.mode ?? null,
      agentsSpawned: c.agentsSpawned.length,
      activeMs: c.activeMs,
      userBlockedMs: c.userBlockedMs ?? 0,
      startedAt: c.timestamp,
      completedAt: c.completedAt ?? null,
    })),
    messages: session.messages.map(m => ({
      id: m.id,
      source: typeof m.source === 'string' ? m.source : m.source.type,
      content: m.content,
      timestamp: m.timestamp,
    })),
    finalMoodSignals: null,
    achievements: [],
    xpGained: 0,
    sentiment: null,
  };
}

function loadEvents(sessionId: string): HistoryEvent[] {
  const eventsPath = historyEventsPath(sessionId);
  if (!existsSync(eventsPath)) return [];
  const lines = readFileSync(eventsPath, 'utf-8').split('\n').filter(l => l.trim());
  const events: HistoryEvent[] = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line) as HistoryEvent); } catch { continue; }
  }
  return events;
}

function findSession(idOrName: string): { id: string; summary: SessionSummary } | null {
  // Try exact ID match first
  const summaryPath = historySessionSummaryPath(idOrName);
  if (existsSync(summaryPath)) {
    try {
      return { id: idOrName, summary: JSON.parse(readFileSync(summaryPath, 'utf-8')) as SessionSummary };
    } catch { /* fall through */ }
  }
  // Exact-ID path with no session.json — try live rebuild before falling back to search
  if (existsSync(historySessionDir(idOrName))) {
    const live = buildLiveSummary(idOrName);
    if (live) return { id: idOrName, summary: live };
  }
  // Search by name or partial ID (loadAllSummaries handles live rebuild for in-flight sessions)
  const all = loadAllSummaries();
  return all.find(s =>
    s.id.startsWith(idOrName) ||
    s.summary.name === idOrName ||
    s.summary.name?.includes(idOrName),
  ) ?? null;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

function parseSince(since: string): number {
  const match = since.match(/^(\d+)\s*(d|h|m|w)$/);
  if (!match) {
    exitUsage('invalid-since', `invalid --since format "${since}"`, {
      received: since,
      expected: 'duration like 7d, 24h, 30m, or 2w',
    });
  }
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const ms = { d: 86400000, h: 3600000, m: 60000, w: 604800000 }[unit]!;
  return Date.now() - n * ms;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtStatus(status: string): string {
  return c(statusColor(status), status);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtProject(cwd: string): string {
  const parts = cwd.split('/');
  return parts.slice(-2).join('/');
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function listSessions(opts: {
  cwd?: string; status?: string; since?: string; search?: string;
  limit: number;
}): void {
  let sessions = loadAllSummaries();

  if (opts.cwd) {
    const abs = resolve(opts.cwd);
    sessions = sessions.filter(s => s.summary.cwd === abs);
  }
  if (opts.status) {
    sessions = sessions.filter(s => s.summary.status === opts.status);
  }
  if (opts.since) {
    const cutoff = parseSince(opts.since);
    sessions = sessions.filter(s => new Date(s.summary.startedAt).getTime() >= cutoff);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    sessions = sessions.filter(s =>
      s.summary.task.toLowerCase().includes(q) ||
      (s.summary.name ?? '').toLowerCase().includes(q) ||
      s.summary.messages.some(m => m.content.toLowerCase().includes(q)),
    );
  }

  sessions = sessions.slice(0, opts.limit);

  if (emitJsonOk({ sessions: sessions.map(s => s.summary) })) return;

  if (sessions.length === 0) {
    console.log(c('gray', 'No sessions found.'));
    return;
  }

  for (const { summary: s } of sessions) {
    const name = s.name ? c('white', s.name) : c('gray', s.sessionId.slice(0, 8));
    const status = fmtStatus(s.status);
    const date = c('gray', fmtDate(s.startedAt));
    const dur = formatDuration(s.activeMs);
    const proj = c('gray', fmtProject(s.cwd));
    const agents = s.agentCount > 0 ? `${s.agentCount} agents` : '';
    const cycles = s.cycleCount > 0 ? `${s.cycleCount} cycles` : '';
    const meta = [agents, cycles, dur].filter(Boolean).join(', ');

    console.log(`${date}  ${status}  ${name}  ${dim(meta)}  ${proj}`);

    const taskPreview = s.task.length > 100 ? s.task.slice(0, 100) + '...' : s.task;
    console.log(`  ${dim(taskPreview)}`);
    console.log('');
  }

  const total = loadAllSummaries().length;
  if (total > sessions.length) {
    console.log(c('gray', `  Showing ${sessions.length} of ${total} sessions. Use --limit or filters to see more.`));
  }
}

function showSession(idOrName: string, opts: { events: boolean }): void {
  const found = findSession(idOrName);
  if (!found) {
    exitUsage('not-found', `session "${idOrName}" not found`, {
      received: idOrName,
      next: 'sis history  # list available sessions',
    });
  }

  const { id, summary: s } = found;

  if (!opts.events) {
    if (emitJsonOk({ session: s })) return;
  }

  if (opts.events) {
    const events = loadEvents(id);
    if (emitJsonOk({ events })) return;
    if (events.length === 0) {
      console.log(c('gray', 'No events recorded.'));
      return;
    }
    for (const e of events) {
      const time = c('gray', fmtDate(e.ts));
      const event = c('cyan', e.event.padEnd(18));
      const data = formatEventData(e);
      console.log(`${time}  ${event}  ${data}`);
    }
    return;
  }

  // Detail view
  const inProgress = s.completedAt == null;
  const inProgressTag = inProgress ? `  ${c('yellow', '(in progress)')}` : '';
  console.log(`${bold(s.name ?? s.sessionId.slice(0, 8))}  ${fmtStatus(s.status)}${inProgressTag}`);
  console.log(`${dim('ID:')} ${s.sessionId}`);
  console.log(`${dim('Project:')} ${s.cwd}`);
  console.log(`${dim('Model:')} ${s.model ?? 'default'}`);
  console.log(`${dim('Started:')} ${fmtDate(s.startedAt)}`);
  console.log(`${dim('Ended:')} ${s.completedAt ? fmtDate(s.completedAt) : c('gray', '— still running')}`);
  const { computeMs, interactiveMs } = splitAgentTime(s.agents);
  const wallStr = s.wallClockMs ? formatDuration(s.wallClockMs) : '—';
  console.log(`${dim('Active:')} ${formatDuration(s.activeMs)}  ${dim('Wall:')} ${wallStr}`);
  if (interactiveMs > 0) {
    console.log(`${dim('Compute:')} ${formatDuration(computeMs)}  ${dim('Interactive:')} ${formatDuration(interactiveMs)} ${dim('(TUI wait time, not compute)')}`);
  }
  if (s.userBlockedMs > 0) {
    console.log(`${dim('Waiting on user:')} ${formatDuration(s.userBlockedMs)} ${dim('(blocked on sis ask, not compute)')}`);
  }
  console.log('');

  // Task
  console.log(bold('Task'));
  console.log(s.task);
  console.log('');

  // Context
  if (s.context) {
    console.log(bold('Context'));
    console.log(s.context.length > 500 ? s.context.slice(0, 500) + '...' : s.context);
    console.log('');
  }

  // Agents
  if (s.agents.length > 0) {
    console.log(`${bold('Agents')} (${s.agents.length})`);
    for (const a of s.agents) {
      const name = a.nickname ? `${a.name} "${a.nickname}"` : a.name;
      const type = a.agentType ? c('gray', ` [${a.agentType}]`) : '';
      const interactive = isInteractiveAgent(a.agentType) ? c('yellow', ' (interactive)') : '';
      const blocked = a.userBlockedMs ?? 0;
      const waiting = blocked > 0 ? `  ${dim(`· ${formatDuration(blocked)} waiting`)}` : '';
      console.log(`  ${fmtStatus(a.status)}  ${name}${type}${interactive}  ${dim(formatDuration(a.activeMs))}${waiting}`);
    }
    console.log('');
  }

  // Cycles
  if (s.cycles.length > 0) {
    console.log(`${bold('Cycles')} (${s.cycles.length})`);
    for (const cy of s.cycles) {
      const mode = cy.mode ? c('magenta', cy.mode) : '';
      const blocked = cy.userBlockedMs ?? 0;
      const waiting = blocked > 0 ? `  ${dim(`· ${formatDuration(blocked)} waiting`)}` : '';
      console.log(`  ${dim(`#${cy.cycle}`)}  ${mode}  ${cy.agentsSpawned} agents  ${dim(formatDuration(cy.activeMs))}${waiting}`);
    }
    console.log('');
  }

  // Messages
  if (s.messages.length > 0) {
    console.log(`${bold('Messages')} (${s.messages.length})`);
    for (const m of s.messages) {
      const src = c('gray', m.source);
      const preview = m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content;
      console.log(`  ${src}  ${preview}`);
    }
    console.log('');
  }

  // Completion report
  if (s.completionReport) {
    console.log(bold('Completion Report'));
    console.log(s.completionReport);
    console.log('');
  }

  // Achievements
  if (s.achievements.length > 0) {
    console.log(bold('Achievements Unlocked'));
    console.log(`  ${s.achievements.join(', ')}`);
    console.log('');
  }

  // Final mood signals
  if (s.finalMoodSignals) {
    const sig = s.finalMoodSignals;
    const parts = [
      sig.recentCrashes > 0 ? c('red', `${sig.recentCrashes} crashes`) : null,
      `${sig.activeAgentCount ?? 0} active agents`,
      `cycle ${sig.cycleCount ?? 0}`,
      `hour ${sig.hourOfDay}`,
      sig.idleDurationMs > 60000 ? `idle ${formatDuration(sig.idleDurationMs)}` : null,
    ].filter(Boolean);
    console.log(dim(`Final signals: ${parts.join(' · ')}`));
  }
}

function formatEventData(e: HistoryEvent): string {
  const d = e.data;
  switch (e.event) {
    case 'session-start':
      return `${c('white', (d.task as string).slice(0, 80))}  ${c('gray', fmtProject(d.cwd as string))}`;
    case 'session-named':
      return c('white', d.name as string);
    case 'agent-spawned':
      return `${c('white', d.agentId as string)}  ${d.agentType ?? ''}  ${dim(`${(d.instruction as string)?.slice(0, 60) ?? ''}...`)}`;
    case 'agent-nicknamed':
      return `${d.agentId}  "${c('white', d.nickname as string)}"`;
    case 'agent-completed':
      return `${d.agentId}  ${dim(formatDuration(d.activeMs as number))}  ${dim((d.reportSummary as string)?.slice(0, 60) ?? '')}`;
    case 'agent-exited':
      return `${d.agentId}  ${fmtStatus(d.status as string)}  ${d.reason ?? ''}`;
    case 'cycle-boundary':
      return `#${d.cycle}  ${d.mode ? c('magenta', d.mode as string) : ''}  ${d.agentsSpawned} agents`;
    case 'signals-snapshot': {
      const sig = d.signals as Record<string, unknown> | undefined;
      return `${d.from} → ${c('white', d.to as string)}  ${sig ? `crashes=${sig.recentCrashes} agents=${sig.activeAgentCount ?? 0}` : ''}`;
    }
    case 'message':
      return `${c('gray', d.source as string)}  ${(d.content as string).slice(0, 80)}`;
    case 'review-started': {
      const fileParts = typeof d.filePath === 'string' ? d.filePath.split('/').slice(-2).join('/') : '';
      return `${c('cyan', d.type as string)}  ${c('gray', fileParts)}`;
    }
    case 'agent-killed':
      return `${d.agentId}  ${fmtStatus(d.status as string)}  ${dim(formatDuration(d.activeMs as number))}  ${d.reason ?? ''}`;
    case 'agent-restarted':
      return `${d.agentId}  restart #${d.restartCount}  ${dim(`was ${d.previousStatus}`)}`;
    case 'rollback':
      return `cycle ${d.fromCycle} → ${d.toCycle}  ${d.killedAgentCount} agents killed`;
    case 'session-resumed':
      return `was ${fmtStatus(d.previousStatus as string)}  ${d.lostAgentCount} agents lost`;
    case 'session-continued':
      return `${d.cycleCount} cycles  ${dim(formatDuration(d.activeMs as number))}`;
    case 'session-end':
      return `${fmtStatus(d.status as string)}  ${formatDuration(d.activeMs as number)}  ${d.agentCount} agents  ${d.cycleCount} cycles`;
    default:
      return JSON.stringify(d);
  }
}

function showStats(opts: { cwd?: string; since?: string }): void {
  // Exclude in-flight sessions — their activeMs/wallClockMs are live snapshots that
  // would skew aggregate averages, efficiency, and percentiles.
  let sessions = loadAllSummaries().filter(s => s.summary.completedAt != null);

  if (opts.cwd) {
    const abs = resolve(opts.cwd);
    sessions = sessions.filter(s => s.summary.cwd === abs);
  }
  if (opts.since) {
    const cutoff = parseSince(opts.since);
    sessions = sessions.filter(s => new Date(s.summary.startedAt).getTime() >= cutoff);
  }

  if (sessions.length === 0) {
    console.log(c('gray', 'No sessions found.'));
    return;
  }

  const completed = sessions.filter(s => s.summary.status === 'completed');
  const killed = sessions.filter(s => s.summary.status === 'killed');
  const totalActiveMs = sessions.reduce((sum, s) => sum + s.summary.activeMs, 0);
  const totalAgents = sessions.reduce((sum, s) => sum + s.summary.agentCount, 0);
  const totalCycles = sessions.reduce((sum, s) => sum + s.summary.cycleCount, 0);
  const totalMessages = sessions.reduce((sum, s) => sum + s.summary.messages.length, 0);

  // Per-project breakdown
  const byProject = new Map<string, { count: number; activeMs: number; agents: number }>();
  for (const { summary: s } of sessions) {
    const proj = s.cwd;
    const entry = byProject.get(proj) ?? { count: 0, activeMs: 0, agents: 0 };
    entry.count++;
    entry.activeMs += s.activeMs;
    entry.agents += s.agentCount;
    byProject.set(proj, entry);
  }

  // Avg session duration
  const avgMs = totalActiveMs / sessions.length;

  // Efficiency
  const efficiencyValues: number[] = [];
  for (const { summary: s } of sessions) {
    const eff = s.efficiency ?? (s.wallClockMs
      ? Math.max(0, s.activeMs - (s.userBlockedMs ?? 0))
        / Math.max(1, s.wallClockMs - (s.userBlockedMs ?? 0))
      : null);
    if (eff != null) efficiencyValues.push(eff);
  }
  const avgEfficiency = efficiencyValues.length > 0
    ? efficiencyValues.reduce((a, b) => a + b, 0) / efficiencyValues.length
    : null;

  // Duration distributions (p50/p90)
  const sortedActiveMs = sessions.map(s => s.summary.activeMs).sort((a, b) => a - b);
  const n = sortedActiveMs.length;
  const p50Ms = n >= 3 ? sortedActiveMs[Math.ceil(50 / 100 * n) - 1]! : null;
  const p90Ms = n >= 3 ? sortedActiveMs[Math.ceil(90 / 100 * n) - 1]! : null;

  // Per-agent-type performance
  const agentTypeMap = new Map<string, { count: number; totalMs: number; crashed: number; completed: number }>();
  for (const { summary: s } of sessions) {
    for (const a of s.agents) {
      const type = a.agentType ?? 'untyped';
      const entry = agentTypeMap.get(type) ?? { count: 0, totalMs: 0, crashed: 0, completed: 0 };
      entry.count++;
      entry.totalMs += a.activeMs;
      if (a.status === 'crashed') entry.crashed++;
      if (a.status === 'completed') entry.completed++;
      agentTypeMap.set(type, entry);
    }
  }

  // Temporal patterns
  const hourBlocks = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const { summary: s } of sessions) {
    const d = new Date(s.startedAt);
    const hour = d.getHours();
    const blockStart = hour - (hour % 2);
    const blockLabel = `${String(blockStart).padStart(2, '0')}:00–${String(blockStart + 2).padStart(2, '0')}:00`;
    hourBlocks.set(blockLabel, (hourBlocks.get(blockLabel) ?? 0) + 1);
    const day = dayNames[d.getDay()]!;
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  if (emitJsonOk({
    total: sessions.length,
    completed: completed.length,
    killed: killed.length,
    totalActiveMs,
    avgActiveMs: Math.round(avgMs),
    avgEfficiency,
    p50Ms,
    p90Ms,
    totalAgents,
    totalCycles,
    totalMessages,
    byProject: Object.fromEntries([...byProject.entries()].map(([k, v]) => [k, v])),
    agentTypes: Object.fromEntries([...agentTypeMap.entries()].map(([k, v]) => [k, {
      ...v,
      avgMs: Math.round(v.totalMs / v.count),
      crashRate: v.count > 0 ? v.crashed / v.count : 0,
      completionRate: v.count > 0 ? v.completed / v.count : 0,
    }])),
    temporalPatterns: sessions.length >= 5 ? {
      hourBlocks: Object.fromEntries(hourBlocks),
      dayOfWeek: Object.fromEntries(dayCounts),
    } : null,
  })) return;

  console.log(bold('Session History Stats'));
  console.log('');
  console.log(`  ${bold('Sessions:')}  ${sessions.length} total  ${c('cyan', `${completed.length} completed`)}  ${c('red', `${killed.length} killed`)}`);
  const timeLine = `  ${bold('Time:')}      ${formatDuration(totalActiveMs)} total  ${formatDuration(avgMs)} avg` +
    (p50Ms != null && p90Ms != null ? `  ${dim(`p50=${formatDuration(p50Ms)} p90=${formatDuration(p90Ms)}`)}` : '');
  console.log(timeLine);
  if (avgEfficiency != null) {
    const effColor = avgEfficiency >= 0.7 ? 'green' : avgEfficiency >= 0.4 ? 'yellow' : 'red';
    console.log(`  ${bold('Efficiency:')} ${c(effColor, (avgEfficiency * 100).toFixed(1) + '%')}  ${dim(`(${efficiencyValues.length} sessions with data)`)}`);
  }
  console.log(`  ${bold('Agents:')}    ${totalAgents} spawned (${(totalAgents / sessions.length).toFixed(1)} avg/session)`);
  console.log(`  ${bold('Cycles:')}    ${totalCycles} total (${(totalCycles / sessions.length).toFixed(1)} avg/session)`);
  console.log(`  ${bold('Messages:')}  ${totalMessages} total`);
  console.log('');

  console.log(bold('By Project'));
  const sorted = [...byProject.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [proj, data] of sorted) {
    console.log(`  ${c('gray', fmtProject(proj))}  ${data.count} sessions  ${formatDuration(data.activeMs)}  ${data.agents} agents`);
  }

  // Per-agent-type performance table
  if (agentTypeMap.size > 0) {
    console.log('');
    console.log(bold('By Agent Type'));
    const typeHeader = `  ${'Type'.padEnd(20)} ${'Count'.padStart(6)} ${'Avg Time'.padStart(10)} ${'Crash %'.padStart(8)} ${'Done %'.padStart(8)}`;
    console.log(dim(typeHeader));
    const sortedTypes = [...agentTypeMap.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [type, data] of sortedTypes) {
      const avgTime = formatDuration(data.totalMs / data.count);
      const crashRate = data.count > 0 ? ((data.crashed / data.count) * 100).toFixed(0) + '%' : '0%';
      const completionRate = data.count > 0 ? ((data.completed / data.count) * 100).toFixed(0) + '%' : '0%';
      const crashColor = data.crashed > 0 ? 'red' : 'green';
      console.log(`  ${type.padEnd(20)} ${String(data.count).padStart(6)} ${avgTime.padStart(10)} ${c(crashColor, crashRate.padStart(8))} ${c('cyan', completionRate.padStart(8))}`);
    }
  }

  // Temporal patterns
  if (sessions.length >= 5) {
    console.log('');
    console.log(bold('Temporal Patterns'));
    const topBlocks = [...hourBlocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log(`  ${dim('Busiest times:')}  ${topBlocks.map(([label, count]) => `${label} (${count})`).join('  ')}`);
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayParts = dayOrder.map(d => `${d} ${dayCounts.get(d) ?? 0}`);
    console.log(`  ${dim('By day:')}         ${dayParts.join('  ')}`);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Browse session history and metrics')
    .argument('[session]', 'Session ID or name to inspect')
    .option('--cwd <path>', 'Filter by project directory')
    .option('--status <status>', 'Filter by status (completed, killed)')
    .option('--since <duration>', 'Filter by recency (e.g. 7d, 24h, 2w)')
    .option('--search <query>', 'Search task text and messages')
    .option('--events', 'Show raw event timeline')
    .option('--stats', 'Show aggregate statistics')
    .addHelpText('after', `
Examples:
  $ sis history
  $ sis history sess-7f2a
  $ sis history sess-7f2a --events
  $ sis history --stats
  $ sis history --since 7d --status completed
  $ sis history --json

Output:
  Default       Prose session list or detail view
  --json        { ok, schema_version: 1, data: { sessions } } (list)
                { ok, schema_version: 1, data: { session } }  (detail)
                { ok, schema_version: 1, data: { events } }   (--events)
                { ok, schema_version: 1, data: { ...stats } } (--stats)

Exit codes: 0 ok | 2 usage error | see \`sis --help\` for full table.`)
    .option('-n, --limit <n>', 'Max sessions to show', '20')
    .action(async (session: string | undefined, opts: {
      cwd?: string; status?: string; since?: string; search?: string;
      events?: boolean; stats?: boolean; limit: string;
    }) => {
      const limit = parseInt(opts.limit, 10) || 20;

      if (opts.stats) {
        showStats({ cwd: opts.cwd, since: opts.since });
        return;
      }

      if (session) {
        showSession(session, { events: opts.events ?? false });
        return;
      }

      listSessions({
        cwd: opts.cwd,
        status: opts.status,
        since: opts.since,
        search: opts.search,
        limit,
      });
    });
}
