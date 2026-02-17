import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import { projectOrchestratorPromptPath, sessionDir } from '../shared/paths.js';
import type { Session, Agent, OrchestratorCycle } from '../shared/types.js';

const sessionWindowMap = new Map<string, string>();
const sessionOrchestratorPane = new Map<string, string>();

export function getWindowId(sessionId: string): string | undefined {
  return sessionWindowMap.get(sessionId);
}

export function setWindowId(sessionId: string, windowId: string): void {
  sessionWindowMap.set(sessionId, windowId);
}

export function getOrchestratorPaneId(sessionId: string): string | undefined {
  return sessionOrchestratorPane.get(sessionId);
}

function loadOrchestratorPrompt(cwd: string): string {
  const projectPath = projectOrchestratorPromptPath(cwd);
  if (existsSync(projectPath)) {
    return readFileSync(projectPath, 'utf-8');
  }
  const bundledPath = resolve(import.meta.dirname, '../templates/orchestrator.md');
  return readFileSync(bundledPath, 'utf-8');
}

function truncate(s: string | null, maxLen: number): string {
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function formatStateForOrchestrator(session: Session): string {
  const shortId = session.id.slice(0, 8);
  const cycleNum = session.orchestratorCycles.length;

  const taskLines = session.tasks.length > 0
    ? session.tasks.map(t => `- ${t.id}: [${t.status}] ${t.description}`).join('\n')
    : '  (none)';

  const agentLines = session.agents.length > 0
    ? session.agents.map((a: Agent) => {
        const report = a.report ? ` — "${truncate(a.report, 120)}"` : '';
        return `- ${a.id} (${a.name}): ${a.status}${report}`;
      }).join('\n')
    : '  (none)';

  const cycleLines = session.orchestratorCycles.length > 0
    ? session.orchestratorCycles.map((c: OrchestratorCycle) => {
        const agentReports = c.agentsSpawned.map(agentId => {
          const agent = session.agents.find(a => a.id === agentId);
          const report = agent?.report ? `"${truncate(agent.report, 120)}"` : '(no report)';
          return `  - ${agentId}: ${report}`;
        }).join('\n');
        const spawnedList = c.agentsSpawned.length > 0 ? c.agentsSpawned.join(', ') : '(none)';
        return `Cycle ${c.cycle}: Spawned ${spawnedList}\n${agentReports}`;
      }).join('\n\n')
    : '  (none)';

  return [
    '<state>',
    `session: ${shortId} (cycle ${cycleNum})`,
    `task: ${session.task}`,
    `status: ${session.status}`,
    '',
    '## Tasks',
    taskLines,
    '',
    '## Agents',
    agentLines,
    '',
    '## Previous Cycles',
    cycleLines,
    '</state>',
  ].join('\n');
}

export function spawnOrchestrator(sessionId: string, cwd: string, windowId: string): void {
  const session = state.getSession(cwd, sessionId);
  const basePrompt = loadOrchestratorPrompt(cwd);
  const formattedState = formatStateForOrchestrator(session);
  const fullPrompt = `${basePrompt}\n\n${formattedState}`;

  const cycleNum = session.orchestratorCycles.length + 1;
  const promptFilePath = `${sessionDir(cwd, sessionId)}/orchestrator-prompt-${cycleNum}.md`;
  writeFileSync(promptFilePath, fullPrompt, 'utf-8');

  sessionWindowMap.set(sessionId, windowId);

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
  ].join(' && ');

  const claudeCmd = `claude --dangerously-skip-permissions --append-system-prompt "$(cat '${promptFilePath}')" "Review the current session state and execute the next cycle of work."`;

  const paneId = tmux.createPane(windowId);

  sessionOrchestratorPane.set(sessionId, paneId);
  tmux.setPaneTitle(paneId, `orchestrator (${sessionId.slice(0, 8)})`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR);
  tmux.sendKeys(paneId, `${envExports} && ${claudeCmd}`);
  tmux.selectLayout(windowId, 'tiled');

  state.addOrchestratorCycle(cwd, sessionId, {
    cycle: cycleNum,
    timestamp: new Date().toISOString(),
    agentsSpawned: [],
    paneId,
  });
}

function resolveOrchestratorPane(sessionId: string, cwd: string): string | undefined {
  const memPane = sessionOrchestratorPane.get(sessionId);
  if (memPane) return memPane;
  const session = state.getSession(cwd, sessionId);
  const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
  return lastCycle?.paneId ?? undefined;
}

export function handleOrchestratorYield(sessionId: string, cwd: string): void {
  const paneId = resolveOrchestratorPane(sessionId, cwd);
  if (paneId) {
    tmux.killPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  state.completeOrchestratorCycle(cwd, sessionId);

  const session = state.getSession(cwd, sessionId);
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length === 0) {
    console.error(`[sisyphus] WARNING: Orchestrator yielded but no agents are running for session ${sessionId}`);
  }
}

export function handleOrchestratorComplete(sessionId: string, cwd: string, report: string): void {
  const paneId = resolveOrchestratorPane(sessionId, cwd);

  state.completeOrchestratorCycle(cwd, sessionId);
  state.completeSession(cwd, sessionId, report);

  if (paneId) {
    tmux.killPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  sessionWindowMap.delete(sessionId);

  console.log(`[sisyphus] Session ${sessionId} completed: ${report}`);
}
