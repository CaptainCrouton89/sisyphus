import { writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tuiScratchDir, initialPromptPath, roadmapPath, strategyPath } from '../../shared/paths.js';
import type { Session, Agent, OrchestratorCycle } from '../../shared/types.js';
import type { TreeNode } from '../types/tree.js';
import type { DetailContext } from '../panels/detail.js';
import type { AppState } from '../state.js';
import type { ReportBlock } from '../lib/reports.js';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface NvimFileResult {
  files: { path: string; readonly: boolean }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp.' + process.pid;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

function ensureTuiDir(cwd: string, sessionId: string): string {
  const dir = tuiScratchDir(cwd, sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

function elapsedSince(start: string, end?: string): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  return formatDurationMs(endMs - startMs);
}

// ---------------------------------------------------------------------------
// Compose functions
// ---------------------------------------------------------------------------

function sectionBreak(): string[] {
  return ['', '', '---', '', ''];
}

function composeCycleDetail(session: Session, cycle: OrchestratorCycle): string {
  const isRunning = !cycle.completedAt;
  const dur = isRunning ? 'running' : formatDurationMs(cycle.activeMs);
  const cycleAgents = session.agents.filter((a) => cycle.agentsSpawned.includes(a.id));
  const lines: string[] = [];

  lines.push(`# Cycle ${cycle.cycle}`);
  lines.push('');
  lines.push(`**Status:** ${isRunning ? 'running' : 'completed'}  |  **Duration:** ${dur}`);
  lines.push(`**Started:** ${formatTimestamp(cycle.timestamp)}`);
  if (cycle.completedAt) {
    lines.push(`**Completed:** ${formatTimestamp(cycle.completedAt)}`);
  }
  if (cycle.mode) {
    lines.push(`**Mode:** ${cycle.mode}`);
  }
  if (cycle.claudeSessionId) {
    lines.push(`**Claude Session:** ${cycle.claudeSessionId}`);
  }

  // Agents
  lines.push(...sectionBreak());
  lines.push('## Agents');
  lines.push('');
  if (cycleAgents.length === 0) {
    lines.push('_No agents spawned yet._');
  } else {
    for (const agent of cycleAgents) {
      const agentDur = formatDurationMs(agent.activeMs);
      lines.push(`### ${agent.id} — ${agent.name || agent.agentType || agent.id}`);
      lines.push(`- **Status:** ${agent.status}  |  **Duration:** ${agentDur}`);
      lines.push(`- **Type:** ${agent.agentType || '—'}`);
      if (agent.killedReason) {
        lines.push(`- **Killed reason:** ${agent.killedReason}`);
      }
      lines.push('');
      lines.push('**Instruction:**');
      lines.push('');
      lines.push(agent.instruction);
      const latestReport =
        agent.reports.length > 0 ? agent.reports[agent.reports.length - 1]! : null;
      if (latestReport) {
        lines.push('');
        lines.push(`**Latest report** (${latestReport.type}, ${formatTimestamp(latestReport.timestamp)}):**`);
        lines.push('');
        lines.push(latestReport.summary);
      }
      lines.push('');
    }
  }

  // Next prompt
  if (cycle.nextPrompt) {
    lines.push(...sectionBreak());
    lines.push('## Next Prompt');
    lines.push('');
    lines.push(cycle.nextPrompt.trim());
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

function composeAgentDetail(agent: Agent, reportBlocks: ReportBlock[]): string {
  const dur = formatDurationMs(agent.activeMs);
  const lines: string[] = [];

  lines.push(`# ${agent.id} — ${agent.name || agent.agentType || agent.id}`);
  lines.push('');
  lines.push(
    `**Status:** ${agent.status}  |  **Duration:** ${dur}  |  **Type:** ${agent.agentType || '—'}`,
  );
  lines.push(`**Spawned:** ${formatTimestamp(agent.spawnedAt)}`);
  if (agent.completedAt) {
    lines.push(`**Completed:** ${formatTimestamp(agent.completedAt)}`);
  }
  if (agent.killedReason) {
    lines.push(`**Killed reason:** ${agent.killedReason}`);
  }
  if (agent.claudeSessionId) {
    lines.push(`**Claude Session:** ${agent.claudeSessionId}`);
  }

  lines.push(...sectionBreak());
  lines.push('## Instruction');
  lines.push('');
  lines.push(agent.instruction.trim());

  if (reportBlocks.length > 0) {
    lines.push(...sectionBreak());
    lines.push(`## Reports (${reportBlocks.length})`);
    for (const block of reportBlocks) {
      lines.push('');
      const badge = block.type === 'final' ? 'FINAL' : 'UPDATE';
      lines.push(`### ${badge} — ${formatTimestamp(block.timestamp)}`);
      lines.push('');
      lines.push(block.content.trim());
    }
  } else if (agent.reports.length > 0) {
    lines.push(...sectionBreak());
    lines.push(`## Reports (${agent.reports.length})`);
    for (const report of agent.reports) {
      const badge = report.type === 'final' ? 'FINAL' : 'UPDATE';
      lines.push('');
      lines.push(`### ${badge} — ${formatTimestamp(report.timestamp)}`);
      lines.push('');
      lines.push(report.summary);
    }
  }

  return lines.join('\n') + '\n';
}

function composeMessages(session: Session): string {
  const lines: string[] = [];

  lines.push('# Messages');
  lines.push('');
  lines.push(`**Session:** ${session.name ?? session.task.slice(0, 60)}`);
  lines.push(`**Total messages:** ${session.messages.length}`);

  if (session.messages.length === 0) {
    lines.push('');
    lines.push('_No messages yet._');
    return lines.join('\n') + '\n';
  }

  const sorted = [...session.messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const msg of sorted) {
    lines.push('');
    lines.push('---');
    lines.push('');
    const src = msg.source;
    let sourceLabel: string;
    if (src.type === 'agent') {
      sourceLabel = src.agentId;
    } else if (src.type === 'user') {
      sourceLabel = 'You';
    } else {
      sourceLabel = src.detail ? `system (${src.detail})` : 'system';
    }
    lines.push(`**From:** ${sourceLabel}  |  **Time:** ${formatTimestamp(msg.timestamp)}`);
    if (msg.summary && msg.summary !== msg.content) {
      lines.push(`**Summary:** ${msg.summary}`);
    }
    lines.push('');
    lines.push(msg.content.trim());
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine which file(s) neovim should display based on the current cursor node.
 * Returns a NvimFileResult with file paths and editability, or null.
 *
 * For session nodes, opens the real files (initial-prompt.md, roadmap.md, strategy.md) in splits.
 * For other node types, composes a markdown file in the .tui/ scratch directory.
 */
export function resolveNvimFile(
  state: AppState,
  cursorNode: TreeNode | undefined,
  detailCtx: DetailContext,
  cwd: string,
): NvimFileResult | null {
  if (!cursorNode) return null;
  const sessionId = cursorNode.sessionId;
  if (!sessionId) return null;
  const session = detailCtx.session;

  switch (cursorNode.type) {
    case 'session': {
      if (!session) return null;
      const files: { path: string; readonly: boolean }[] = [];
      const gp = initialPromptPath(cwd, sessionId);
      if (existsSync(gp)) files.push({ path: gp, readonly: false });
      const rp = roadmapPath(cwd, sessionId);
      if (existsSync(rp)) files.push({ path: rp, readonly: false });
      const sp = strategyPath(cwd, sessionId);
      if (existsSync(sp)) files.push({ path: sp, readonly: false });
      if (files.length === 0) return null;
      return { files };
    }

    case 'cycle': {
      if (!session) return null;
      const cycle = session.orchestratorCycles.find(
        (c) => c.cycle === cursorNode.cycleNumber,
      );
      if (!cycle) return null;
      const dir = ensureTuiDir(cwd, sessionId);
      const filePath = join(dir, `cycle-${cursorNode.cycleNumber}.md`);
      atomicWrite(filePath, composeCycleDetail(session, cycle));
      return { files: [{ path: filePath, readonly: true }] };
    }

    case 'agent': {
      if (!session) return null;
      const agent = session.agents.find((a) => a.id === cursorNode.agentId);
      if (!agent) return null;
      const dir = ensureTuiDir(cwd, sessionId);
      const filePath = join(dir, `${agent.id}.md`);
      atomicWrite(filePath, composeAgentDetail(agent, state.cachedReportBlocks.get(agent.id) ?? []));
      return { files: [{ path: filePath, readonly: true }] };
    }

    case 'report': {
      const agent = session?.agents.find((a) => a.id === cursorNode.agentId);
      if (agent && agent.reports.length > 0) {
        const report = agent.reports[cursorNode.reportIndex];
        if (report?.filePath && existsSync(report.filePath)) {
          return { files: [{ path: report.filePath, readonly: true }] };
        }
      }
      return null;
    }

    case 'context-file': {
      if (cursorNode.filePath && existsSync(cursorNode.filePath)) {
        return { files: [{ path: cursorNode.filePath, readonly: false }] };
      }
      return null;
    }

    case 'messages':
    case 'message': {
      if (!session || session.messages.length === 0) return null;
      const dir = ensureTuiDir(cwd, sessionId);
      const filePath = join(dir, 'messages.md');
      atomicWrite(filePath, composeMessages(session));
      return { files: [{ path: filePath, readonly: true }] };
    }

    case 'context': {
      return null;
    }

    default:
      return null;
  }
}
