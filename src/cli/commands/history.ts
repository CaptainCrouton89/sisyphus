import type { Command } from 'commander';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { historyBaseDir, historySessionDir, historyEventsPath, historySessionSummaryPath } from '../../shared/paths.js';
import { formatDuration, statusColor } from '../../shared/format.js';
import type { SessionSummary } from '../../shared/history-types.js';
import type { HistoryEvent } from '../../shared/history-types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const COLOR: Record<string, string> = {
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[37m', magenta: '\x1b[35m',
};

function c(color: string, text: string): string {
  return `${COLOR[color] ?? ''}${text}${RESET}`;
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
    if (!existsSync(summaryPath)) continue;
    try {
      const raw = readFileSync(summaryPath, 'utf-8');
      results.push({ id: name, summary: JSON.parse(raw) as SessionSummary });
    } catch { continue; }
  }
  // Newest first
  results.sort((a, b) => new Date(b.summary.startedAt).getTime() - new Date(a.summary.startedAt).getTime());
  return results;
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
  // Search by name or partial ID
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
    console.error(`Error: invalid --since format "${since}". Use e.g. 7d, 24h, 30m, 2w`);
    process.exit(1);
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
  limit: number; json: boolean;
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

  if (opts.json) {
    console.log(JSON.stringify(sessions.map(s => s.summary), null, 2));
    return;
  }

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

    console.log(`${date}  ${status}  ${name}  ${DIM}${meta}${RESET}  ${proj}`);

    const taskPreview = s.task.length > 100 ? s.task.slice(0, 100) + '...' : s.task;
    console.log(`  ${DIM}${taskPreview}${RESET}`);
    console.log('');
  }

  const total = loadAllSummaries().length;
  if (total > sessions.length) {
    console.log(c('gray', `  Showing ${sessions.length} of ${total} sessions. Use --limit or filters to see more.`));
  }
}

function showSession(idOrName: string, opts: { json: boolean; events: boolean }): void {
  const found = findSession(idOrName);
  if (!found) {
    console.error(`Error: session "${idOrName}" not found`);
    process.exit(1);
  }

  const { id, summary: s } = found;

  if (opts.json && !opts.events) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (opts.events) {
    const events = loadEvents(id);
    if (opts.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }
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
  console.log(`${BOLD}${s.name ?? s.sessionId.slice(0, 8)}${RESET}  ${fmtStatus(s.status)}`);
  console.log(`${DIM}ID:${RESET} ${s.sessionId}`);
  console.log(`${DIM}Project:${RESET} ${s.cwd}`);
  console.log(`${DIM}Model:${RESET} ${s.model ?? 'default'}`);
  console.log(`${DIM}Started:${RESET} ${fmtDate(s.startedAt)}`);
  console.log(`${DIM}Ended:${RESET} ${fmtDate(s.completedAt)}`);
  console.log(`${DIM}Active:${RESET} ${formatDuration(s.activeMs)}  ${DIM}Wall:${RESET} ${s.wallClockMs ? formatDuration(s.wallClockMs) : '—'}`);
  console.log('');

  // Task
  console.log(`${BOLD}Task${RESET}`);
  console.log(s.task);
  console.log('');

  // Context
  if (s.context) {
    console.log(`${BOLD}Context${RESET}`);
    console.log(s.context.length > 500 ? s.context.slice(0, 500) + '...' : s.context);
    console.log('');
  }

  // Agents
  if (s.agents.length > 0) {
    console.log(`${BOLD}Agents${RESET} (${s.agents.length})`);
    for (const a of s.agents) {
      const name = a.nickname ? `${a.name} "${a.nickname}"` : a.name;
      const type = a.agentType ? c('gray', ` [${a.agentType}]`) : '';
      console.log(`  ${fmtStatus(a.status)}  ${name}${type}  ${DIM}${formatDuration(a.activeMs)}${RESET}`);
    }
    console.log('');
  }

  // Cycles
  if (s.cycles.length > 0) {
    console.log(`${BOLD}Cycles${RESET} (${s.cycles.length})`);
    for (const cy of s.cycles) {
      const mode = cy.mode ? c('magenta', cy.mode) : '';
      console.log(`  ${DIM}#${cy.cycle}${RESET}  ${mode}  ${cy.agentsSpawned} agents  ${DIM}${formatDuration(cy.activeMs)}${RESET}`);
    }
    console.log('');
  }

  // Messages
  if (s.messages.length > 0) {
    console.log(`${BOLD}Messages${RESET} (${s.messages.length})`);
    for (const m of s.messages) {
      const src = c('gray', m.source);
      const preview = m.content.length > 120 ? m.content.slice(0, 120) + '...' : m.content;
      console.log(`  ${src}  ${preview}`);
    }
    console.log('');
  }

  // Reviews (from event timeline)
  const events = loadEvents(id);
  const reviewEvents = events.filter(e => e.event === 'review-completed');
  if (reviewEvents.length > 0) {
    console.log(`${BOLD}Reviews${RESET}`);
    for (const e of reviewEvents) {
      const rd = e.data;
      const durMs = typeof rd.durationMs === 'number' ? rd.durationMs : null;
      const durStr = durMs != null ? formatDuration(durMs) : '—';
      const type = c('cyan', rd.type as string);
      console.log(`  ${type}  ${durStr}  ${rd.itemsReviewed}/${rd.itemsTotal} items reviewed  ${c('gray', fmtDate(e.ts))}`);
    }
    console.log('');
  }

  // Completion report
  if (s.completionReport) {
    console.log(`${BOLD}Completion Report${RESET}`);
    console.log(s.completionReport);
    console.log('');
  }

  // Achievements
  if (s.achievements.length > 0) {
    console.log(`${BOLD}Achievements Unlocked${RESET}`);
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
    console.log(`${DIM}Final signals: ${parts.join(' · ')}${RESET}`);
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
      return `${c('white', d.agentId as string)}  ${d.agentType ?? ''}  ${DIM}${(d.instruction as string)?.slice(0, 60) ?? ''}...${RESET}`;
    case 'agent-nicknamed':
      return `${d.agentId}  "${c('white', d.nickname as string)}"`;
    case 'agent-completed':
      return `${d.agentId}  ${DIM}${formatDuration(d.activeMs as number)}${RESET}  ${DIM}${(d.reportSummary as string)?.slice(0, 60) ?? ''}${RESET}`;
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
    case 'review-completed': {
      const durMs = typeof d.durationMs === 'number' ? d.durationMs : null;
      const durStr = durMs != null ? formatDuration(durMs) : '—';
      return `${c('cyan', d.type as string)}  ${durStr}  ${d.itemsReviewed}/${d.itemsTotal} reviewed`;
    }
    case 'agent-killed':
      return `${d.agentId}  ${fmtStatus(d.status as string)}  ${DIM}${formatDuration(d.activeMs as number)}${RESET}  ${d.reason ?? ''}`;
    case 'agent-restarted':
      return `${d.agentId}  restart #${d.restartCount}  ${DIM}was ${d.previousStatus}${RESET}`;
    case 'rollback':
      return `cycle ${d.fromCycle} → ${d.toCycle}  ${d.killedAgentCount} agents killed`;
    case 'session-resumed':
      return `was ${fmtStatus(d.previousStatus as string)}  ${d.lostAgentCount} agents lost`;
    case 'session-continued':
      return `${d.cycleCount} cycles  ${DIM}${formatDuration(d.activeMs as number)}${RESET}`;
    case 'session-end':
      return `${fmtStatus(d.status as string)}  ${formatDuration(d.activeMs as number)}  ${d.agentCount} agents  ${d.cycleCount} cycles`;
    default:
      return JSON.stringify(d);
  }
}

function showStats(opts: { cwd?: string; since?: string; json: boolean }): void {
  let sessions = loadAllSummaries();

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
    const eff = s.efficiency ?? (s.wallClockMs ? s.activeMs / s.wallClockMs : null);
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

  if (opts.json) {
    console.log(JSON.stringify({
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
    }, null, 2));
    return;
  }

  console.log(`${BOLD}Session History Stats${RESET}`);
  console.log('');
  console.log(`  ${BOLD}Sessions:${RESET}  ${sessions.length} total  ${c('cyan', `${completed.length} completed`)}  ${c('red', `${killed.length} killed`)}`);
  const timeLine = `  ${BOLD}Time:${RESET}      ${formatDuration(totalActiveMs)} total  ${formatDuration(avgMs)} avg` +
    (p50Ms != null && p90Ms != null ? `  ${DIM}p50=${formatDuration(p50Ms)} p90=${formatDuration(p90Ms)}${RESET}` : '');
  console.log(timeLine);
  if (avgEfficiency != null) {
    const effColor = avgEfficiency >= 0.7 ? 'green' : avgEfficiency >= 0.4 ? 'yellow' : 'red';
    console.log(`  ${BOLD}Efficiency:${RESET} ${c(effColor, (avgEfficiency * 100).toFixed(1) + '%')}  ${DIM}(${efficiencyValues.length} sessions with data)${RESET}`);
  }
  console.log(`  ${BOLD}Agents:${RESET}    ${totalAgents} spawned (${(totalAgents / sessions.length).toFixed(1)} avg/session)`);
  console.log(`  ${BOLD}Cycles:${RESET}    ${totalCycles} total (${(totalCycles / sessions.length).toFixed(1)} avg/session)`);
  console.log(`  ${BOLD}Messages:${RESET}  ${totalMessages} total`);
  console.log('');

  console.log(`${BOLD}By Project${RESET}`);
  const sorted = [...byProject.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [proj, data] of sorted) {
    console.log(`  ${c('gray', fmtProject(proj))}  ${data.count} sessions  ${formatDuration(data.activeMs)}  ${data.agents} agents`);
  }

  // Per-agent-type performance table
  if (agentTypeMap.size > 0) {
    console.log('');
    console.log(`${BOLD}By Agent Type${RESET}`);
    const typeHeader = `  ${'Type'.padEnd(20)} ${'Count'.padStart(6)} ${'Avg Time'.padStart(10)} ${'Crash %'.padStart(8)} ${'Done %'.padStart(8)}`;
    console.log(`${DIM}${typeHeader}${RESET}`);
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
    console.log(`${BOLD}Temporal Patterns${RESET}`);
    const topBlocks = [...hourBlocks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log(`  ${DIM}Busiest times:${RESET}  ${topBlocks.map(([label, count]) => `${label} (${count})`).join('  ')}`);
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayParts = dayOrder.map(d => `${d} ${dayCounts.get(d) ?? 0}`);
    console.log(`  ${DIM}By day:${RESET}         ${dayParts.join('  ')}`);
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
    .option('--json', 'Output as JSON')
    .option('-n, --limit <n>', 'Max sessions to show', '20')
    .action(async (session: string | undefined, opts: {
      cwd?: string; status?: string; since?: string; search?: string;
      events?: boolean; stats?: boolean; json?: boolean; limit: string;
    }) => {
      const limit = parseInt(opts.limit, 10) || 20;
      const json = opts.json ?? false;

      if (opts.stats) {
        showStats({ cwd: opts.cwd, since: opts.since, json });
        return;
      }

      if (session) {
        showSession(session, { json, events: opts.events ?? false });
        return;
      }

      listSessions({
        cwd: opts.cwd,
        status: opts.status,
        since: opts.since,
        search: opts.search,
        limit,
        json,
      });
    });
}
