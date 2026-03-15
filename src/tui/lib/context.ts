import { readFileSync } from 'node:fs';
import { goalPath, roadmapPath } from '../../shared/paths.js';
import { resolveReports } from './reports.js';
import type { Session } from '../../shared/types.js';

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
