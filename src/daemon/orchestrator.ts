import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { contextDir, logsPath, planPath, projectOrchestratorPromptPath, promptsDir, worktreeConfigPath } from '../shared/paths.js';
import type { Agent, Session } from '../shared/types.js';
import { loadConfig } from '../shared/config.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { registerPane, unregisterPane, unregisterSessionPanes } from './pane-registry.js';

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

export function setOrchestratorPaneId(sessionId: string, paneId: string): void {
  sessionOrchestratorPane.set(sessionId, paneId);
}

function loadOrchestratorPrompt(cwd: string, mode: string): string {
  const projectPath = projectOrchestratorPromptPath(cwd);
  if (existsSync(projectPath)) {
    return readFileSync(projectPath, 'utf-8');
  }

  const basePath = resolve(import.meta.dirname, '../templates/orchestrator-base.md');
  const base = readFileSync(basePath, 'utf-8');

  if (mode === 'implementation') {
    const implPath = resolve(import.meta.dirname, '../templates/orchestrator-impl.md');
    return base + '\n\n' + readFileSync(implPath, 'utf-8');
  }

  // Default: planning mode
  const planningPath = resolve(import.meta.dirname, '../templates/orchestrator-planning.md');
  return base + '\n\n' + readFileSync(planningPath, 'utf-8');
}

function formatStateForOrchestrator(session: Session): string {
  const shortId = session.id.slice(0, 8);
  const cycleNum = session.orchestratorCycles.length;

  const ctxDir = contextDir(session.cwd, session.id);
  let contextLines: string;
  if (existsSync(ctxDir)) {
    const files = readdirSync(ctxDir);
    contextLines = files.length > 0 ? files.map(f => `- ${f}`).join('\n') : '  (none)';
  } else {
    contextLines = '  (none)';
  }

  const planFile = planPath(session.cwd, session.id);
  const planRef = existsSync(planFile) ? `@${planFile}` : '(empty)';

  const logsFile = logsPath(session.cwd, session.id);
  const logsRef = existsSync(logsFile) ? `@${logsFile}` : '(empty)';

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

  // Worktree status — only if any agents have worktree info
  const worktreeAgents = session.agents.filter(a => a.worktreePath);
  let worktreeSection = '';
  if (worktreeAgents.length > 0) {
    const wtLines = worktreeAgents.map((a: Agent) => {
      if (a.mergeStatus === 'conflict') {
        return `- ${a.id}: CONFLICT — ${a.mergeDetails ?? 'unknown'}\n  Branch: ${a.branchName}\n  Worktree: ${a.worktreePath}`;
      }
      if (a.mergeStatus === 'no-changes') {
        return `- ${a.id}: NO CHANGES — agent did not commit any work to branch ${a.branchName}`;
      }
      const status = a.mergeStatus ?? 'pending';
      return `- ${a.id}: ${status} (branch ${a.branchName})`;
    }).join('\n');
    worktreeSection = `\n\n## Worktrees\n${wtLines}`;
  }

  // Worktree hint
  const worktreeHint = existsSync(worktreeConfigPath(session.cwd))
    ? 'Worktree config active (`.sisyphus/worktree.json`). Use `--worktree` flag with `sisyphus spawn` to isolate agents in their own worktrees. Recommended for feature work, especially with potential file overlap.'
    : 'No worktree configuration found. If this session involves parallel work where agents may edit overlapping files, use the `git-management` skill to set up `.sisyphus/worktree.json` and enable worktree isolation.';

  const contextSection = session.context
    ? `\n## Background Context\n${session.context}\n`
    : '';

  const messages = session.messages ?? [];
  const messageLines = messages.length > 0
    ? messages.map(m => {
        const sourceLabel = m.source.type === 'agent'
          ? `agent:${m.source.agentId}`
          : m.source.type === 'system' && m.source.detail
            ? `system:${m.source.detail}`
            : m.source.type;
        const fileRef = m.filePath ? ` → ${m.filePath}` : '';
        return `- [${sourceLabel} @ ${m.timestamp}] "${m.summary}"${fileRef}`;
      }).join('\n')
    : '  (none)';

  return `<state>
session: ${shortId} (cycle ${cycleNum})
task: ${session.task}
status: ${session.status}
${contextSection}
## Plan
${planRef}

## Logs
${logsRef}

## Agents
${agentLines}${worktreeSection}

## Previous Cycles
${cycleLines}

## Context Files
${contextLines}

## Messages
${messageLines}

## Git Worktrees
${worktreeHint}
</state>`;
}

export async function spawnOrchestrator(sessionId: string, cwd: string, windowId: string, message?: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);

  // Read mode and nextPrompt from last completed cycle
  const lastCycle = [...session.orchestratorCycles].reverse().find(c => c.completedAt);
  const mode = lastCycle?.mode ?? 'planning';

  const basePrompt = loadOrchestratorPrompt(cwd, mode);
  const formattedState = formatStateForOrchestrator(session);

  // System prompt: template only (no state)
  const cycleNum = session.orchestratorCycles.length + 1;
  const promptFilePath = `${promptsDir(cwd, sessionId)}/orchestrator-system-${cycleNum}.md`;
  writeFileSync(promptFilePath, basePrompt, 'utf-8');

  sessionWindowMap.set(sessionId, windowId);

  // Resolve CLI binary path so `sisyphus` works even when installed as a local dependency
  const cliBin = resolve(import.meta.dirname, 'cli.js');
  const npmBinDir = resolve(import.meta.dirname, '../../.bin');

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
    `export PATH="${npmBinDir}:$PATH"`,
  ].join(' && ');

  // User message: state block + contextual prompt
  let userPrompt: string;
  if (message) {
    userPrompt = `${formattedState}\n\nThe user resumed this session with new instructions: ${message}`;
  } else {
    const storedPrompt = lastCycle?.nextPrompt;
    if (storedPrompt) {
      userPrompt = `${formattedState}\n\n${storedPrompt}`;
    } else {
      userPrompt = `${formattedState}\n\nReview the current session and delegate the next cycle of work.`;
    }
  }

  const userPromptFilePath = `${promptsDir(cwd, sessionId)}/orchestrator-user-${cycleNum}.md`;
  writeFileSync(userPromptFilePath, userPrompt, 'utf-8');
  const pluginPath = resolve(import.meta.dirname, '../templates/orchestrator-plugin');
  const settingsPath = resolve(import.meta.dirname, '../templates/orchestrator-settings.json');
  const config = loadConfig(cwd);
  const effort = config.orchestratorEffort ?? 'high';
  const claudeCmd = `claude --dangerously-skip-permissions --effort ${effort} --settings "${settingsPath}" --plugin-dir "${pluginPath}" --system-prompt "$(cat '${promptFilePath}')" "$(cat '${userPromptFilePath}')"`;

  const paneId = tmux.createPane(windowId, cwd, 'left');

  sessionOrchestratorPane.set(sessionId, paneId);
  registerPane(paneId, sessionId, 'orchestrator');
  tmux.setPaneTitle(paneId, `Sisyphus`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR);

  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  const bannerCmd = existsSync(bannerPath) ? `cat '${bannerPath}' &&` : '';
  const notifyCmd = `node "${cliBin}" notify pane-exited --pane-id ${paneId}`;
  tmux.sendKeys(paneId, `${bannerCmd} ${envExports} && ${claudeCmd}; ${notifyCmd}`);

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

export async function handleOrchestratorYield(sessionId: string, cwd: string, nextPrompt?: string, mode?: string): Promise<void> {
  const paneId = resolveOrchestratorPane(sessionId, cwd);
  if (paneId) {
    tmux.killPane(paneId);
    unregisterPane(paneId);
    sessionOrchestratorPane.delete(sessionId);
  }

  const windowId = sessionWindowMap.get(sessionId);
  if (windowId) tmux.selectLayout(windowId);

  await state.completeOrchestratorCycle(cwd, sessionId, nextPrompt, mode);

  const session = state.getSession(cwd, sessionId);
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length === 0) {
    console.log(`[sisyphus] Orchestrator yielded with no running agents for session ${sessionId}`);
  }
}

export async function handleOrchestratorComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  await state.completeOrchestratorCycle(cwd, sessionId);
  await state.completeSession(cwd, sessionId, report);

  console.log(`[sisyphus] Session ${sessionId} completed: ${report}`);
}

export function cleanupSessionMaps(sessionId: string): void {
  sessionOrchestratorPane.delete(sessionId);
  sessionWindowMap.delete(sessionId);
  unregisterSessionPanes(sessionId);
}
