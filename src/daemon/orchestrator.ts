import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import { projectOrchestratorPromptPath } from '../shared/paths.js';

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

function isPaneAlive(paneId: string): boolean {
  const panes = tmux.listPanes(paneId);
  return panes.some(p => p.paneId === paneId);
}

export function spawnOrchestrator(sessionId: string, cwd: string, windowId: string): void {
  const session = state.getSession(cwd, sessionId);
  const basePrompt = loadOrchestratorPrompt(cwd);
  const stateJson = JSON.stringify(session, null, 2);
  const fullPrompt = `${basePrompt}\n\n## Current State\n\n\`\`\`json\n${stateJson}\n\`\`\``;

  sessionWindowMap.set(sessionId, windowId);

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
  ].join(' && ');

  const claudeCmd = `claude --dangerously-skip-permissions ${shellQuote(fullPrompt)}`;

  // Reuse existing orchestrator pane if still alive
  const existingPane = resolveOrchestratorPane(sessionId, cwd);
  const paneId = (existingPane && isPaneAlive(existingPane))
    ? existingPane
    : tmux.createPane(windowId);

  sessionOrchestratorPane.set(sessionId, paneId);
  tmux.setPaneTitle(paneId, `orchestrator (${sessionId.slice(0, 8)})`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR);
  tmux.sendKeys(paneId, `${envExports} && ${claudeCmd}`);
  tmux.selectLayout(windowId, 'tiled');

  const cycleNum = session.orchestratorCycles.length + 1;
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
  // Kill the Claude process but keep the pane alive for reuse
  const paneId = resolveOrchestratorPane(sessionId, cwd);
  if (paneId) {
    tmux.sendSignal(paneId, 'KILL');
  }

  const session = state.getSession(cwd, sessionId);
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length === 0) {
    console.error(`[sisyphus] WARNING: Orchestrator yielded but no agents are running for session ${sessionId}`);
  }
}

export function handleOrchestratorComplete(sessionId: string, cwd: string, report: string): void {
  const paneId = resolveOrchestratorPane(sessionId, cwd);
  state.updateSessionStatus(cwd, sessionId, 'completed');

  if (paneId) {
    tmux.killPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  sessionWindowMap.delete(sessionId);

  console.log(`[sisyphus] Session ${sessionId} completed: ${report}`);
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
