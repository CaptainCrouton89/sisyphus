import { readFileSync, readdirSync } from 'node:fs';
import { goalPath, roadmapPath, sessionsDir, statePath } from '../../shared/paths.js';
import { resolveReports } from './reports.js';
import type { Session, AgentStatus } from '../../shared/types.js';

function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCompanionContext(cwd: string): string {
  let sessionDirs: string[];
  try {
    sessionDirs = readdirSync(sessionsDir(cwd));
  } catch {
    return '<sessions>No sessions found.</sessions>';
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const sessionBlocks: string[] = [];

  for (const sessionId of sessionDirs) {
    const stateRaw = readFileSafe(statePath(cwd, sessionId));
    if (!stateRaw) continue;

    let session: Session;
    try {
      session = JSON.parse(stateRaw) as Session;
    } catch {
      continue;
    }

    // Skip completed sessions older than 7 days
    if (session.status === 'completed' && session.completedAt) {
      if (now - new Date(session.completedAt).getTime() > sevenDaysMs) continue;
    }

    const lines: string[] = [];
    const nameAttr = session.name ? ` name="${escapeXml(session.name)}"` : '';
    lines.push(`  <session id="${escapeXml(session.id)}"${nameAttr} status="${escapeXml(session.status)}">`);
    lines.push(`    <task>${escapeXml(session.task)}</task>`);
    lines.push(`    <created>${escapeXml(session.createdAt)}</created>`);
    lines.push(`    <cycles>${session.orchestratorCycles.length}</cycles>`);

    if (session.status === 'completed') {
      if (session.completionReport) {
        const snippet = session.completionReport.slice(0, 300).replace(/\n+/g, ' ').trim();
        lines.push(`    <completion-report>${escapeXml(snippet)}${session.completionReport.length > 300 ? '…' : ''}</completion-report>`);
      }
    } else {
      // Agent summary by status
      if (session.agents.length > 0) {
        const counts = new Map<AgentStatus, number>();
        for (const agent of session.agents) {
          counts.set(agent.status, (counts.get(agent.status) ?? 0) + 1);
        }
        const summary = [...counts.entries()].map(([status, n]) => `${n} ${status}`).join(', ');
        lines.push(`    <agents>${escapeXml(summary)}</agents>`);
      }

      // Goal: first meaningful line
      const goalContent = readFileSafe(goalPath(cwd, session.id));
      if (goalContent) {
        const firstLine = goalContent.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#'));
        if (firstLine) lines.push(`    <goal>${escapeXml(firstLine)}</goal>`);
      }

      // Roadmap unchecked todos (up to 5)
      const roadmapContent = readFileSafe(roadmapPath(cwd, session.id));
      if (roadmapContent) {
        const todos = roadmapContent
          .split('\n')
          .filter(l => l.includes('- [ ]'))
          .slice(0, 5)
          .map(l => l.trim());
        if (todos.length > 0) {
          lines.push('    <todos>');
          for (const todo of todos) lines.push(`      ${escapeXml(todo)}`);
          lines.push('    </todos>');
        }
      }
    }

    lines.push('  </session>');
    sessionBlocks.push(lines.join('\n'));
  }

  if (sessionBlocks.length === 0) {
    return '<sessions>No sessions found.</sessions>';
  }

  return ['<sessions>', ...sessionBlocks, '</sessions>'].join('\n');
}

export function buildSessionContext(session: Session, cwd: string): string {
  const goal = readFileSafe(goalPath(cwd, session.id));
  const roadmap = readFileSafe(roadmapPath(cwd, session.id));

  const agentsXml = session.agents.map((agent) => {
    const reportBlocks = resolveReports(agent.reports);
    // resolveReports returns newest-first; reverse to chronological for context
    const reportsXml = [...reportBlocks].reverse().map((block) => {
      return `      <report type="${block.type}" time="${escapeXml(block.timestamp)}">${escapeXml(block.content)}</report>`;
    }).join('\n');

    return [
      `    <agent id="${escapeXml(agent.id)}" name="${escapeXml(agent.name)}" type="${escapeXml(agent.agentType)}" status="${escapeXml(agent.status)}">`,
      `      <instruction>${escapeXml(agent.instruction)}</instruction>`,
      ...(reportsXml ? [reportsXml] : []),
      `    </agent>`,
    ].join('\n');
  }).join('\n');

  const cyclesXml = session.orchestratorCycles.map((cycle) => {
    const agents = cycle.agentsSpawned.join(', ');
    const mode = cycle.mode ? ` mode="${escapeXml(cycle.mode)}"` : '';
    return `    <cycle number="${cycle.cycle}"${mode} agents="${escapeXml(agents)}" />`;
  }).join('\n');

  const lines: string[] = [
    '<context>',
    `<session id="${escapeXml(session.id)}" status="${escapeXml(session.status)}">`,
    `  <task>${escapeXml(session.task)}</task>`,
    `  <cwd>${escapeXml(session.cwd)}</cwd>`,
  ];

  if (goal) lines.push(`  <goal>${escapeXml(goal)}</goal>`);
  if (roadmap) lines.push(`  <roadmap>${escapeXml(roadmap)}</roadmap>`);

  if (session.agents.length > 0) {
    lines.push('  <agents>');
    lines.push(agentsXml);
    lines.push('  </agents>');
  }

  if (session.orchestratorCycles.length > 0) {
    lines.push('  <cycles>');
    lines.push(cyclesXml);
    lines.push('  </cycles>');
  }

  if (session.completionReport) {
    lines.push(`  <completion-report>${escapeXml(session.completionReport)}</completion-report>`);
  }

  lines.push('</session>');
  lines.push('</context>');

  return lines.join('\n');
}
