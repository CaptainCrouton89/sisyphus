import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contextDir, logsPath, planPath, projectOrchestratorPromptPath, sessionDir } from '../shared/paths.js';
import type { Agent, Session } from '../shared/types.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import * as state from './state.js';
import * as tmux from './tmux.js';

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

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

function formatStateForOrchestrator(session: Session): string {
  const shortId = session.id.slice(0, 8);
  const cycleNum = session.orchestratorCycles.length;

  const taskLines = session.tasks.length > 0
    ? session.tasks.map(t => `- ${t.id}: [${t.status}] ${t.description}`).join('\n')
    : '  (none)';

  const ctxDir = contextDir(session.cwd, session.id);
  let contextLines: string;
  if (existsSync(ctxDir)) {
    const files = readdirSync(ctxDir);
    contextLines = files.length > 0 ? files.map(f => `- ${f}`).join('\n') : '  (none)';
  } else {
    contextLines = '  (none)';
  }

  const planFile = planPath(session.cwd, session.id);
  const planContent = existsSync(planFile) ? readFileSync(planFile, 'utf-8').trim() : '(empty)';

  const logsFile = logsPath(session.cwd, session.id);
  const logsContent = existsSync(logsFile) ? readFileSync(logsFile, 'utf-8').trim() : '(empty)';

  const agentLines = session.agents.length > 0
    ? session.agents.map((a: Agent) => {
        const header = `- ${a.id} (${a.name}): ${a.status} — ${a.reports.length} report(s)`;
        if (a.reports.length === 0) return header;
        let updateNum = 0;
        const reportLines = a.reports.map(r => {
          const label = r.type === 'final' ? '[final]' : `[update ${String(++updateNum).padStart(3, '0')}]`;
          return `  ${label} "${r.summary}" → ${r.filePath}`;
        });
        return [header, ...reportLines].join('\n');
      }).join('\n')
    : '  (none)';

  const cycleLines = session.orchestratorCycles.length > 0
    ? session.orchestratorCycles.map(c => {
        const spawnedList = c.agentsSpawned.length > 0 ? c.agentsSpawned.join(', ') : '(none)';
        return `Cycle ${c.cycle}: Spawned ${spawnedList}`;
      }).join('\n')
    : '  (none)';

  return [
    '<state>',
    `session: ${shortId} (cycle ${cycleNum})`,
    `task: ${session.task}`,
    `status: ${session.status}`,
    '',
    '## Plan',
    planContent,
    '',
    '## Logs',
    logsContent,
    '',
    '## Tasks',
    taskLines,
    '',
    '## Context Files',
    contextLines,
    '',
    '## Agents',
    agentLines,
    '',
    '## Previous Cycles',
    cycleLines,
    '</state>',
  ].join('\n');
}

export async function spawnOrchestrator(sessionId: string, cwd: string, windowId: string, message?: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const basePrompt = loadOrchestratorPrompt(cwd);
  const formattedState = formatStateForOrchestrator(session);

  // System prompt: template only (no state)
  const cycleNum = session.orchestratorCycles.length + 1;
  const promptFilePath = `${sessionDir(cwd, sessionId)}/orchestrator-prompt-${cycleNum}.md`;
  writeFileSync(promptFilePath, basePrompt, 'utf-8');

  sessionWindowMap.set(sessionId, windowId);

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
  ].join(' && ');

  // User message: state block + contextual prompt
  let userPrompt: string;
  if (message) {
    userPrompt = `${formattedState}\n\nThe user resumed this session with new instructions: ${message}`;
  } else {
    // Check last completed cycle for a stored nextPrompt
    const lastCycle = [...session.orchestratorCycles].reverse().find(c => c.completedAt);
    const storedPrompt = lastCycle?.nextPrompt;
    if (storedPrompt) {
      userPrompt = `${formattedState}\n\n${storedPrompt}`;
    } else {
      userPrompt = `${formattedState}\n\nReview the current session and delegate the next cycle of work.`;
    }
  }

  const userPromptFilePath = `${sessionDir(cwd, sessionId)}/orchestrator-user-${cycleNum}.md`;
  writeFileSync(userPromptFilePath, userPrompt, 'utf-8');
  const pluginPath = resolve(import.meta.dirname, '../templates/orchestrator-plugin');
  const settingsPath = resolve(import.meta.dirname, '../templates/orchestrator-settings.json');
  const claudeCmd = `claude --dangerously-skip-permissions --settings "${settingsPath}" --plugin-dir "${pluginPath}" --append-system-prompt "$(cat '${promptFilePath}')" "$(cat '${userPromptFilePath}')"`;

  const paneId = tmux.createPane(windowId, cwd);

  sessionOrchestratorPane.set(sessionId, paneId);
  tmux.setPaneTitle(paneId, `orchestrator (${sessionId.slice(0, 8)})`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR);

  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  const bannerCmd = existsSync(bannerPath) ? `cat '${bannerPath}' &&` : '';
  tmux.sendKeys(paneId, `${bannerCmd} ${envExports} && ${claudeCmd}`);

  await state.addOrchestratorCycle(cwd, sessionId, {
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

export async function handleOrchestratorYield(sessionId: string, cwd: string, nextPrompt?: string): Promise<void> {
  const paneId = resolveOrchestratorPane(sessionId, cwd);
  if (paneId) {
    tmux.killPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  const windowId = sessionWindowMap.get(sessionId);
  if (windowId) tmux.selectLayout(windowId);

  await state.completeOrchestratorCycle(cwd, sessionId, nextPrompt);

  const session = state.getSession(cwd, sessionId);
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length === 0) {
    console.error(`[sisyphus] WARNING: Orchestrator yielded but no agents are running for session ${sessionId}`);
  }
}

export async function handleOrchestratorComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  const paneId = resolveOrchestratorPane(sessionId, cwd);

  await state.completeOrchestratorCycle(cwd, sessionId);
  await state.completeSession(cwd, sessionId, report);

  if (paneId) {
    tmux.killPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  const windowId = sessionWindowMap.get(sessionId);
  if (windowId) tmux.selectLayout(windowId);

  sessionWindowMap.delete(sessionId);

  console.log(`[sisyphus] Session ${sessionId} completed: ${report}`);
}
