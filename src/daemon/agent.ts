import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Agent } from '../shared/types.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { getNextColor } from './colors.js';

let agentCounter = 0;

export function resetAgentCounter(value: number = 0): void {
  agentCounter = value;
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

export function spawnAgent(opts: SpawnAgentOpts): Agent {
  const { sessionId, cwd, agentType, name, instruction, windowId } = opts;
  agentCounter++;
  const agentId = `agent-${String(agentCounter).padStart(3, '0')}`;
  const color = getNextColor(sessionId);

  const paneId = tmux.createPane(windowId);
  tmux.setPaneTitle(paneId, `${name} (${agentId})`);
  tmux.setPaneStyle(paneId, color);
  tmux.selectLayout(windowId, 'tiled');

  const suffix = renderAgentSuffix(sessionId, instruction);

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='${agentId}'`,
  ].join(' && ');

  const agentFlag = agentType ? ` --agent ${shellQuote(agentType)}` : '';
  const claudeCmd = `claude --dangerously-skip-permissions${agentFlag} --append-system-prompt ${shellQuote(suffix)} ${shellQuote(instruction)}`;
  tmux.sendKeys(paneId, `${envExports} && ${claudeCmd}`);

  const agent: Agent = {
    id: agentId,
    name,
    agentType,
    color,
    instruction,
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    report: null,
    paneId,
  };

  state.addAgent(cwd, sessionId, agent);
  return agent;
}

export function handleAgentSubmit(
  cwd: string,
  sessionId: string,
  agentId: string,
  report: string,
): boolean {
  state.updateAgent(cwd, sessionId, agentId, {
    status: 'completed',
    report,
    completedAt: new Date().toISOString(),
  });

  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (agent) {
    tmux.killPane(agent.paneId);
  }

  return allAgentsDone(session);
}

export function handleAgentKilled(
  cwd: string,
  sessionId: string,
  agentId: string,
  reason: string,
): boolean {
  state.updateAgent(cwd, sessionId, agentId, {
    status: 'killed',
    killedReason: reason,
    completedAt: new Date().toISOString(),
  });

  const session = state.getSession(cwd, sessionId);
  return allAgentsDone(session);
}

function allAgentsDone(session: import('../shared/types.js').Session): boolean {
  const running = session.agents.filter(a => a.status === 'running');
  return running.length === 0 && session.agents.length > 0;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
