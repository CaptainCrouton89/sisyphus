import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { contextDir, goalPath, cycleLogPath, roadmapPath, projectOrchestratorPromptPath, promptsDir, worktreeConfigPath } from '../shared/paths.js';
import type { Agent, Session } from '../shared/types.js';
import { loadConfig } from '../shared/config.js';
import { shellQuote } from '../shared/shell.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import { discoverAgentTypes } from './frontmatter.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { registerPane, unregisterPane, unregisterSessionPanes } from './pane-registry.js';


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
  const cycleNum = session.orchestratorCycles.length;

  const ctxDir = contextDir(session.cwd, session.id);
  const roadmapFile = roadmapPath(session.cwd, session.id);
  const logFile = cycleLogPath(session.cwd, session.id, cycleNum + 1);

  // Context section: first cycle shows background context text; subsequent cycles show context dir files
  let contextSection = '';
  if (cycleNum === 0) {
    if (session.context) {
      contextSection = `\n## Context\n\n${session.context}\n`;
    }
  } else {
    let ctxFiles: string[] = [];
    if (existsSync(ctxDir)) {
      ctxFiles = readdirSync(ctxDir).filter(f => f !== 'CLAUDE.md');
    }
    if (ctxFiles.length > 0) {
      const ctxLines = ctxFiles.map(f => `- ${join(ctxDir, f)}`).join('\n');
      contextSection = `\n## Context\n\n${ctxLines}\n`;
    }
  }

  // Messages section
  const messages = session.messages ?? [];
  const messagesSection = messages.length > 0
    ? '\n### Messages\n\n' + messages.map(m => {
        const sourceLabel = m.source.type === 'agent'
          ? `agent:${m.source.agentId}`
          : m.source.type === 'system' && m.source.detail
            ? `system:${m.source.detail}`
            : m.source.type;
        const fileRef = m.filePath ? ` → ${m.filePath}` : '';
        return `- [${sourceLabel} @ ${m.timestamp}] "${m.summary}"${fileRef}`;
      }).join('\n') + '\n'
    : '';

  // Previous cycles: all except last, compact format
  let previousCyclesSection = '';
  if (session.orchestratorCycles.length > 1) {
    const previousCycles = session.orchestratorCycles.slice(0, -1);
    const agentMap = new Map(session.agents.map((a: Agent) => [a.id, a]));
    const lines = previousCycles.map(c => {
      const agentDescs = c.agentsSpawned.map(id => {
        const agent = agentMap.get(id);
        return agent ? `${id} (${agent.name})` : id;
      }).join(', ');
      return `Cycle ${c.cycle}: ${agentDescs || '(none)'}`;
    });
    previousCyclesSection = `\n### Previous Cycles\n\n${lines.join('\n')}\n`;
  }

  // Most recent cycle: full report content
  let mostRecentCycleSection = '';
  const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
  if (lastCycle && lastCycle.agentsSpawned.length > 0) {
    const agentMap = new Map(session.agents.map((a: Agent) => [a.id, a]));
    const agentBlocks = lastCycle.agentsSpawned.map(id => {
      const agent = agentMap.get(id);
      if (!agent) return `<agent-${id} status="unknown">\n(no agent data)\n</agent-${id}>`;

      // Prefer 'final' report, fall back to last report
      const finalReport = agent.reports.find(r => r.type === 'final');
      const reportToUse = finalReport ?? agent.reports[agent.reports.length - 1];

      let reportContent = '(no reports)';
      if (reportToUse) {
        try {
          reportContent = readFileSync(reportToUse.filePath, 'utf-8');
        } catch {
          reportContent = `(could not read report: ${reportToUse.filePath})`;
        }
      }

      return `<agent-${id} name="${agent.name}" status="${agent.status}">\n${reportContent}\n</agent-${id}>`;
    }).join('\n');

    mostRecentCycleSection = `\n### Most Recent Cycle\n\n<last-cycle>\n${agentBlocks}\n</last-cycle>\n`;
  }

  // Roadmap section
  const roadmapRef = existsSync(roadmapFile) ? `@${roadmapFile}` : '(empty)';

  // Worktree status — only if any agents have worktree info or worktree config exists
  const worktreeAgents = session.agents.filter(a => a.worktreePath);
  let worktreeSection = '';
  if (worktreeAgents.length > 0 || existsSync(worktreeConfigPath(session.cwd))) {
    let wtLines = '';
    if (worktreeAgents.length > 0) {
      wtLines = '\n' + worktreeAgents.map((a: Agent) => {
        if (a.mergeStatus === 'conflict') {
          return `- ${a.id}: CONFLICT — ${a.mergeDetails ?? 'unknown'}\n  Branch: ${a.branchName}\n  Worktree: ${a.worktreePath}`;
        }
        if (a.mergeStatus === 'no-changes') {
          return `- ${a.id}: NO CHANGES — agent did not commit any work to branch ${a.branchName}`;
        }
        const status = a.mergeStatus ?? 'pending';
        return `- ${a.id}: ${status} (branch ${a.branchName})`;
      }).join('\n');
    }
    const worktreeHint = existsSync(worktreeConfigPath(session.cwd))
      ? 'Worktree config active (`.sisyphus/worktree.json`). Use `--worktree` flag with `sisyphus spawn` to isolate agents in their own worktrees. Recommended for feature work, especially with potential file overlap.'
      : 'No worktree configuration found. If this session involves parallel work where agents may edit overlapping files, use the `git-management` skill to set up `.sisyphus/worktree.json` and enable worktree isolation.';
    worktreeSection = `\n\n## Git Worktrees\n\n${worktreeHint}${wtLines}`;
  }

  // Goal section: read from goal.md, fall back to session.task
  const goalFile = goalPath(session.cwd, session.id);
  const goalContent = existsSync(goalFile) ? readFileSync(goalFile, 'utf-8').trim() : session.task;

  return `## Goal

${goalContent}
${contextSection}${messagesSection}
### Cycle Log

Write your cycle summary to: ${logFile}
${previousCyclesSection}${mostRecentCycleSection}
## Roadmap

${roadmapRef}
${worktreeSection}`;
}

export async function spawnOrchestrator(sessionId: string, cwd: string, windowId: string, message?: string): Promise<void> {
  // Verify claude CLI is available before spawning
  try {
    execSync('which claude', { stdio: 'pipe', env: tmux.EXEC_ENV });
  } catch {
    throw new Error('Claude CLI not found on PATH. Run `sisyphus doctor` to diagnose.');
  }

  const session = state.getSession(cwd, sessionId);

  // Read mode and nextPrompt from last completed cycle
  const lastCycle = [...session.orchestratorCycles].reverse().find(c => c.completedAt);
  const mode = lastCycle?.mode ?? 'planning';

  const basePrompt = loadOrchestratorPrompt(cwd, mode);
  const formattedState = formatStateForOrchestrator(session);

  // Inject available agent types into system prompt
  const agentPluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');
  const agentTypes = discoverAgentTypes(agentPluginPath, session.cwd);

  // Built-in Claude Code agents available via --agent flag
  agentTypes.push(
    { qualifiedName: 'Explore', source: 'bundled', model: 'haiku', description: 'Fast codebase exploration — find files, search code, answer questions about architecture. Use for research and context gathering.' },
  );

  const agentTypeLines = agentTypes.length > 0
    ? agentTypes.map(t => {
        const modelTag = t.model ? ` (${t.model})` : '';
        const desc = t.description ? ` — ${t.description}` : '';
        return `- \`${t.qualifiedName}\`${modelTag}${desc}`;
      }).join('\n')
    : '  (none)';
  const systemPrompt = basePrompt.replace('{{AGENT_TYPES}}', agentTypeLines);

  // System prompt: template + agent types (no state)
  const cycleNum = session.orchestratorCycles.length + 1;
  const promptFilePath = `${promptsDir(cwd, sessionId)}/orchestrator-system-${cycleNum}.md`;
  writeFileSync(promptFilePath, systemPrompt, 'utf-8');

  sessionWindowMap.set(sessionId, windowId);

  // Resolve CLI binary path so `sisyphus` works even when installed as a local dependency
  const cliBin = resolve(import.meta.dirname, 'cli.js');
  const npmBinDir = resolve(import.meta.dirname, '../../.bin');

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
    `export SISYPHUS_CWD='${cwd}'`,
    `export PATH="${npmBinDir}:$PATH"`,
  ].join(' && ');

  // User message: session state + contextual prompt
  let userPrompt = formattedState;
  if (message) {
    userPrompt += `\n\n## Continuation Instructions\n\nThe user resumed this session with new instructions: ${message}`;
  } else {
    const storedPrompt = lastCycle?.nextPrompt;
    const continuationText = storedPrompt ? storedPrompt : 'Review the current session and delegate the next cycle of work.';
    userPrompt += `\n\n## Continuation Instructions\n\n${continuationText}`;
  }

  const userPromptFilePath = `${promptsDir(cwd, sessionId)}/orchestrator-user-${cycleNum}.md`;
  writeFileSync(userPromptFilePath, userPrompt, 'utf-8');

  // Drain rendered messages so they don't reappear in future cycles
  if (session.messages && session.messages.length > 0) {
    await state.drainMessages(cwd, sessionId, session.messages.length);
  }

  const pluginPath = resolve(import.meta.dirname, '../templates/orchestrator-plugin');
  const settingsPath = resolve(import.meta.dirname, '../templates/orchestrator-settings.json');
  const config = loadConfig(cwd);
  const effort = config.orchestratorEffort ?? 'high';
  const claudeCmd = `claude --dangerously-skip-permissions --disallowed-tools "Task,Agent" --effort ${effort} --settings "${settingsPath}" --plugin-dir "${pluginPath}" --name "sisyphus:orch-${sessionId.slice(0, 8)}-cycle-${cycleNum}" --system-prompt "$(cat '${promptFilePath}')" "$(cat '${userPromptFilePath}')"`;

  const paneId = tmux.createPane(windowId, cwd, 'left');

  sessionOrchestratorPane.set(sessionId, paneId);
  registerPane(paneId, sessionId, 'orchestrator');
  tmux.setPaneTitle(paneId, `Sisyphus`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR);

  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  const bannerCmd = existsSync(bannerPath) ? `cat '${bannerPath}'` : '';
  const notifyCmd = `node "${cliBin}" notify pane-exited --pane-id ${paneId}`;

  // Write full command to a shell script to avoid tmux send-keys buffer limits
  const scriptLines = [
    '#!/usr/bin/env bash',
    ...(bannerCmd ? [bannerCmd] : []),
    envExports,
    `${claudeCmd}`,
    notifyCmd,
  ];
  const scriptPath = `${promptsDir(cwd, sessionId)}/orchestrator-run-${cycleNum}.sh`;
  writeFileSync(scriptPath, scriptLines.join('\n'), { mode: 0o755 });
  tmux.sendKeys(paneId, `bash '${scriptPath}'`);

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
