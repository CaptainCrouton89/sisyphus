import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Agent, AgentReport } from '../shared/types.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { getNextColor } from './colors.js';
import { getWindowId } from './orchestrator.js';
import { sessionDir, reportsDir, reportFilePath } from '../shared/paths.js';

const agentCounters = new Map<string, number>();

export function resetAgentCounter(sessionId: string, value: number = 0): void {
  agentCounters.set(sessionId, value);
}

export function resetAgentCounterFromState(sessionId: string, agents: { id: string }[]): void {
  let max = 0;
  for (const a of agents) {
    const match = a.id.match(/^agent-(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1]!, 10));
  }
  agentCounters.set(sessionId, max);
}

export function clearAgentCounter(sessionId: string): void {
  agentCounters.delete(sessionId);
}

function renderAgentSuffix(sessionId: string, instruction: string): string {
  const templatePath = resolve(import.meta.dirname, '../templates/agent-suffix.md');
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    template = `# Sisyphus Agent\nSession: {{SESSION_ID}}\nTask: {{INSTRUCTION}}`;
  }
  return template
    .replace(/\{\{SESSION_ID\}\}/g, sessionId)
    .replace(/\{\{INSTRUCTION\}\}/g, instruction);
}

export interface SpawnAgentOpts {
  sessionId: string;
  cwd: string;
  agentType: string;
  name: string;
  instruction: string;
  windowId: string;
}

export async function spawnAgent(opts: SpawnAgentOpts): Promise<Agent> {
  const { sessionId, cwd, agentType, name, instruction, windowId } = opts;
  const count = (agentCounters.get(sessionId) ?? 0) + 1;
  agentCounters.set(sessionId, count);
  const agentId = `agent-${String(count).padStart(3, '0')}`;
  const color = getNextColor(sessionId);

  const paneId = tmux.createPane(windowId, cwd);
  tmux.setPaneTitle(paneId, `${name} (${agentId})`);
  tmux.setPaneStyle(paneId, color);

  const suffix = renderAgentSuffix(sessionId, instruction);
  const suffixFilePath = `${sessionDir(cwd, sessionId)}/${agentId}-system.md`;
  writeFileSync(suffixFilePath, suffix, 'utf-8');

  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  const bannerCmd = existsSync(bannerPath) ? `cat '${bannerPath}' &&` : '';

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='${agentId}'`,
  ].join(' && ');

  const pluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');
  const agentFlag = agentType ? ` --agent ${shellQuote(agentType)}` : '';
  const claudeCmd = `claude --dangerously-skip-permissions --plugin-dir "${pluginPath}"${agentFlag} --append-system-prompt "$(cat '${suffixFilePath}')" ${shellQuote(instruction)}`;
  tmux.sendKeys(paneId, `${bannerCmd} ${envExports} && ${claudeCmd}`);

  const agent: Agent = {
    id: agentId,
    name,
    agentType,
    color,
    instruction,
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    reports: [],
    paneId,
  };

  await state.addAgent(cwd, sessionId, agent);
  return agent;
}

function nextReportNumber(cwd: string, sessionId: string, agentId: string): string {
  const dir = reportsDir(cwd, sessionId);
  try {
    const files = readdirSync(dir).filter(f => f.startsWith(`${agentId}-`) && !f.endsWith('-final.md'));
    return String(files.length + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

export async function handleAgentReport(
  cwd: string,
  sessionId: string,
  agentId: string,
  content: string,
): Promise<void> {
  const dir = reportsDir(cwd, sessionId);
  mkdirSync(dir, { recursive: true });

  const num = nextReportNumber(cwd, sessionId, agentId);
  const filePath = reportFilePath(cwd, sessionId, agentId, num);
  writeFileSync(filePath, content, 'utf-8');

  const entry: AgentReport = {
    type: 'update',
    filePath,
    summary: content.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
  await state.appendAgentReport(cwd, sessionId, agentId, entry);
}

export async function handleAgentSubmit(
  cwd: string,
  sessionId: string,
  agentId: string,
  report: string,
): Promise<boolean> {
  const dir = reportsDir(cwd, sessionId);
  mkdirSync(dir, { recursive: true });

  const filePath = reportFilePath(cwd, sessionId, agentId, 'final');
  writeFileSync(filePath, report, 'utf-8');

  const entry: AgentReport = {
    type: 'final',
    filePath,
    summary: report.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
  await state.appendAgentReport(cwd, sessionId, agentId, entry);

  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  const session = state.getSession(cwd, sessionId);
  const agentArr = session.agents;
  const agent = agentArr.slice().reverse().find(a => a.id === agentId);
  if (agent) {
    tmux.killPane(agent.paneId);
  }

  const windowId = getWindowId(sessionId);
  if (windowId) tmux.selectLayout(windowId);

  return allAgentsDone(session);
}

export async function handleAgentKilled(
  cwd: string,
  sessionId: string,
  agentId: string,
  reason: string,
): Promise<boolean> {
  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'killed',
    killedReason: reason,
    completedAt: new Date().toISOString(),
  });

  const session = state.getSession(cwd, sessionId);
  return allAgentsDone(session);
}

// Note: this checks ALL running agents in the session, not just orchestrator-spawned ones.
// Agents can also call `sisyphus spawn`, and those child agents are included here —
// the orchestrator won't respawn until every agent (including agent-spawned ones) finishes.
function allAgentsDone(session: import('../shared/types.js').Session): boolean {
  const running = session.agents.filter(a => a.status === 'running');
  return running.length === 0 && session.agents.length > 0;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
