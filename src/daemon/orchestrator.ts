import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { resolveCliBin, resolveNpmBinDir, resolveBannerCmd, buildEnvExports, buildNotifyCmd, writeRunScript } from './spawn-helpers.js';
import { contextDir, goalPath, strategyPath, digestPath, cycleLogPath, logsDir, roadmapPath, projectOrchestratorPromptPath, promptsDir, sessionDir, reportsDir } from '../shared/paths.js';
import { execSafe } from '../shared/exec.js';
import type { Agent, Session } from '../shared/types.js';
import { loadConfig } from '../shared/config.js';
import { shellQuote } from '../shared/shell.js';
import { ORCHESTRATOR_COLOR } from './colors.js';
import { discoverAgentTypes, parseAgentFrontmatter, extractAgentBody } from './frontmatter.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { registerPane, unregisterPane, unregisterSessionPanes } from './pane-registry.js';
import { flushCycleTimer } from './pane-monitor.js';
import { resolveRequiredPluginDirs } from './plugins.js';


interface RepoInfo {
  name: string;       // "." for session root, directory name for children
  path: string;       // absolute path
  branch: string;     // current git branch
  isDirty: boolean;   // has uncommitted changes
}

function detectRepos(cwd: string): RepoInfo[] {
  const config = loadConfig(cwd);
  const repos: RepoInfo[] = [];

  // Check if session root is a git repo
  if (existsSync(join(cwd, '.git'))) {
    try { repos.push(getRepoInfo(cwd, '.')); } catch { /* skip unreadable root repo */ }
  }

  // Scan immediate children for git repos
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const childPath = join(cwd, entry.name);
      if (existsSync(join(childPath, '.git'))) {
        try { repos.push(getRepoInfo(childPath, entry.name)); } catch { /* skip unreadable repo */ }
      }
    }
  } catch { /* ignore read errors */ }

  // Filter by config.repos if present
  if (config.repos && config.repos.length > 0) {
    const allowed = new Set(config.repos);
    return repos.filter(r => r.name === '.' || allowed.has(r.name));
  }

  return repos;
}

function getRepoInfo(repoPath: string, name: string): RepoInfo {
  const branchRaw = execSafe(`git -C ${shellQuote(repoPath)} rev-parse --abbrev-ref HEAD`)?.trim();
  if (!branchRaw) throw new Error(`Failed to detect git branch for repo: ${repoPath}`);
  const status = execSafe(`git -C ${shellQuote(repoPath)} status --porcelain`);
  const isDirty = !!(status && status.trim().length > 0);
  return { name, path: repoPath, branch: branchRaw, isDirty };
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

interface DiscoveredMode {
  name: string;
  description?: string;
  filePath: string;
}

function discoverOrchestratorModes(): DiscoveredMode[] {
  const templatesDir = resolve(import.meta.dirname, '../templates');
  const files = readdirSync(templatesDir).filter(
    f => f.startsWith('orchestrator-') && f.endsWith('.md') && f !== 'orchestrator-base.md'
  );

  return files.map(file => {
    const content = readFileSync(join(templatesDir, file), 'utf-8');
    const fm = parseAgentFrontmatter(content);
    const name = fm.name ?? file.replace(/^orchestrator-/, '').replace(/\.md$/, '');
    return { name, description: fm.description, filePath: join(templatesDir, file) };
  });
}

function loadOrchestratorPrompt(cwd: string, sessionId: string, mode: string): string {
  const projectPath = projectOrchestratorPromptPath(cwd);
  if (existsSync(projectPath)) {
    return readFileSync(projectPath, 'utf-8');
  }

  const basePath = resolve(import.meta.dirname, '../templates/orchestrator-base.md');
  const base = readFileSync(basePath, 'utf-8');

  const modes = discoverOrchestratorModes();
  const selected = modes.find(m => m.name === mode) ?? modes.find(m => m.name === 'strategy');

  if (!selected) {
    throw new Error(`Unknown orchestrator mode '${mode}' and no fallback found. Available: ${modes.map(m => m.name).join(', ')}`);
  }

  const modeContent = readFileSync(selected.filePath, 'utf-8');
  const modeBody = extractAgentBody(modeContent);

  return base + '\n\n' + modeBody;
}

// --- Mode-specific user prompt content ---
// Each function receives the session and returns extra markdown to append.
// Add new modes here as the orchestrator grows.

type ModeContentBuilder = (session: Session) => string;

const modeContentBuilders: Record<string, ModeContentBuilder> = {
  completion: buildCompletionContent,
};

export function buildCompletionContent(session: Session): string {
  const lines: string[] = ['\n## Session History\n'];

  // Agent summary table
  if (session.agents.length > 0) {
    lines.push('### Agents\n');
    lines.push('| Agent | Name | Type | Status | Summary |');
    lines.push('|-------|------|------|--------|---------|');
    for (const agent of session.agents) {
      const finalReport = agent.reports.find(r => r.type === 'final');
      const summary = finalReport?.summary ?? agent.reports[agent.reports.length - 1]?.summary ?? '(no report)';
      lines.push(`| ${agent.id} | ${agent.name} | ${agent.agentType} | ${agent.status} | ${summary} |`);
    }
    lines.push('');
  }

  // Inline cycle logs
  const logsDirPath = logsDir(session.cwd, session.id);
  if (existsSync(logsDirPath)) {
    const logFiles = readdirSync(logsDirPath)
      .filter(f => f.startsWith('cycle-') && f.endsWith('.md'))
      .sort();
    if (logFiles.length > 0) {
      lines.push('### Cycle Logs\n');
      for (const file of logFiles) {
        const content = readFileSync(join(logsDirPath, file), 'utf-8').trim();
        if (content) {
          lines.push(content);
          lines.push('');
        }
      }
    }
  }

  // Reference to full reports for deeper digging
  const reportsDirPath = reportsDir(session.cwd, session.id);
  if (existsSync(reportsDirPath)) {
    const reportFiles = readdirSync(reportsDirPath).filter(f => f.endsWith('.md'));
    if (reportFiles.length > 0) {
      lines.push('### Detailed Reports\n');
      lines.push(`Full agent reports: @${relative(session.cwd, reportsDirPath)}\n`);
    }
  }

  return lines.join('\n');
}

function formatStateForOrchestrator(session: Session, mode: string): string {
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
      contextSection = `\n## Context\n\n@${relative(session.cwd, ctxDir)}\n`;
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
        const fileRef = m.filePath ? ` → ${relative(session.cwd, m.filePath)}` : '';
        return `- [${sourceLabel} @ ${m.timestamp}] "${m.summary}"${fileRef}`;
      }).join('\n') + '\n'
    : '';


  // Most recent cycle: agent reports as file references
  let mostRecentCycleSection = '';
  const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
  if (lastCycle && lastCycle.agentsSpawned.length > 0) {
    const agentMap = new Map(session.agents.map((a: Agent) => [a.id, a]));
    const agentLines = lastCycle.agentsSpawned.map(id => {
      const agent = agentMap.get(id);
      if (!agent) return `- **${id}**: unknown (no agent data)`;

      const finalReport = agent.reports.find(r => r.type === 'final');
      const reportToUse = finalReport ?? agent.reports[agent.reports.length - 1];
      const reportRef = reportToUse ? `@${relative(session.cwd, reportToUse.filePath)}` : '(no reports)';

      return `- **${id}** (${agent.name}) [${agent.status}]: ${reportRef}`;
    }).join('\n');

    mostRecentCycleSection = `\n### Most Recent Cycle\n\n${agentLines}\n`;
  }

  // Strategy section
  const strategyFile = strategyPath(session.cwd, session.id);
  const strategyRef = existsSync(strategyFile) ? `@${relative(session.cwd, strategyFile)}` : '(empty)';

  // Roadmap section
  const roadmapRef = existsSync(roadmapFile) ? `@${relative(session.cwd, roadmapFile)}` : '(empty)';

  // Digest section
  const digestFile = digestPath(session.cwd, session.id);
  const digestRef = existsSync(digestFile) ? `@${relative(session.cwd, digestFile)}` : '(not yet created)';

  // Repositories section — always present
  const repos = detectRepos(session.cwd);
  let repositoriesSection = '\n\n## Repositories\n';

  if (repos.length === 0) {
    repositoriesSection += '\nNo git repositories detected.\n';
  } else {
    for (const repo of repos) {
      const dirtyTag = repo.isDirty ? ' (dirty)' : '';
      repositoriesSection += `\n### ${repo.name === '.' ? 'Session Root (.)' : repo.name}\n`;
      repositoriesSection += `Branch: \`${repo.branch}\`${dirtyTag}\n`;

      // Agents targeting this repo
      const repoAgents = session.agents.filter((a: Agent) => a.repo === repo.name);
      if (repoAgents.length > 0) {
        repositoriesSection += '\nAgents:\n';
        for (const a of repoAgents) {
          repositoriesSection += `- ${a.id} (${a.name}) [${a.status}]\n`;
        }
      }
    }

    // Spawn syntax hint for multi-repo
    if (repos.length > 1) {
      repositoriesSection += '\nTarget agents at specific repos:\n```bash\nsisyphus spawn --name "impl" --repo <repo-name> "task"\n```\n';
    }
  }

  // Goal section: read from goal.md, fall back to session.task
  const goalFile = goalPath(session.cwd, session.id);
  const goalContent = existsSync(goalFile) ? readFileSync(goalFile, 'utf-8').trim() : session.task;

  // Mode-specific content
  const modeContent = modeContentBuilders[mode]?.(session) ?? '';

  return `## Goal

${goalContent}
${contextSection}${messagesSection}
### Cycle Log

Write your cycle summary to: ${relative(session.cwd, logFile)}
${mostRecentCycleSection}${modeContent}
## Strategy

${strategyRef}

## Roadmap

${roadmapRef}

## Digest

${digestRef}
`;
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
  const mode = lastCycle?.mode ?? 'strategy';

  const basePrompt = loadOrchestratorPrompt(cwd, sessionId, mode);
  const formattedState = formatStateForOrchestrator(session, mode);

  // Inject available agent types into system prompt
  const agentPluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');
  const agentTypes = discoverAgentTypes(agentPluginPath, session.cwd);


  const agentTypeLines = agentTypes.length > 0
    ? agentTypes.map(t => {
        const modelTag = t.model ? ` (${t.model})` : '';
        const desc = t.description ? ` — ${t.description}` : '';
        return `- \`${t.qualifiedName}\`${modelTag}${desc}`;
      }).join('\n')
    : '  (none)';

  const sesDir = sessionDir(cwd, sessionId);
  const substituteEnvVars = (text: string) => text
    .replace(/\$SISYPHUS_SESSION_DIR/g, sesDir)
    .replace(/\$SISYPHUS_SESSION_ID/g, sessionId);

  // Inject available orchestrator modes into system prompt
  const modes = discoverOrchestratorModes();
  const modeLines = modes.map(m => {
    const desc = m.description ? ` — ${m.description}` : '';
    return `- \`${m.name}\`${desc}`;
  }).join('\n');

  const systemPrompt = substituteEnvVars(
    basePrompt
      .replace('{{AGENT_TYPES}}', agentTypeLines)
      .replace('{{ORCHESTRATOR_MODES}}', modeLines)
  );

  // System prompt: template + agent types (no state)
  const cycleNum = session.orchestratorCycles.length + 1;
  const promptFilePath = `${promptsDir(cwd, sessionId)}/orchestrator-system-${cycleNum}.md`;
  writeFileSync(promptFilePath, systemPrompt, 'utf-8');

  sessionWindowMap.set(sessionId, windowId);

  const npmBinDir = resolveNpmBinDir();

  const envExports = buildEnvExports([
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='orchestrator'`,
    `export SISYPHUS_CWD='${cwd}'`,
    `export SISYPHUS_SESSION_DIR='${sesDir}'`,
    `export PATH="${npmBinDir}:$PATH"`,
  ]);

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
  writeFileSync(userPromptFilePath, substituteEnvVars(userPrompt), 'utf-8');

  // Drain rendered messages so they don't reappear in future cycles
  if (session.messages && session.messages.length > 0) {
    await state.drainMessages(cwd, sessionId, session.messages.length);
  }

  const pluginPath = resolve(import.meta.dirname, '../templates/orchestrator-plugin');
  const settingsPath = resolve(import.meta.dirname, '../templates/orchestrator-settings.json');
  const config = loadConfig(cwd);
  const effort = config.orchestratorEffort ?? 'high';
  const requiredPluginDirs = resolveRequiredPluginDirs(cwd);
  const extraPluginFlags = requiredPluginDirs.map(p => `--plugin-dir "${p}"`).join(' ');
  const claudeSessionId = randomUUID();
  const claudeCmd = `claude --dangerously-skip-permissions --disallowed-tools "Task,Agent" --effort ${effort} --session-id "${claudeSessionId}" --settings "${settingsPath}" --plugin-dir "${pluginPath}"${extraPluginFlags ? ` ${extraPluginFlags}` : ''} --name "ssph:orch ${session.name ?? sessionId.slice(0, 8)} c${cycleNum}" --system-prompt "$(cat '${promptFilePath}')" "$(cat '${userPromptFilePath}')"`;

  const paneId = tmux.createPane(windowId, cwd, 'left');

  sessionOrchestratorPane.set(sessionId, paneId);
  registerPane(paneId, sessionId, 'orchestrator');
  const sessionLabel = session.name ?? sessionId.slice(0, 8);
  tmux.setPaneTitle(paneId, `ssph:orch ${sessionLabel} c${cycleNum}`);
  tmux.setPaneStyle(paneId, ORCHESTRATOR_COLOR, { role: 'orch', session: sessionLabel, cycle: `c${cycleNum}`, mode });

  const notifyEnabled = config.notifications?.enabled !== false ? '1' : '0';
  const notifySound = config.notifications?.sound ?? '/System/Library/Sounds/Hero.aiff';
  const notifyEnvExports = buildEnvExports([
    `export SISYPHUS_NOTIFY_ENABLED='${notifyEnabled}'`,
    `export SISYPHUS_NOTIFY_SOUND='${notifySound}'`,
    `export SISYPHUS_SESSION_NAME='${sessionLabel}'`,
  ]);

  const bannerCmd = resolveBannerCmd();
  const notifyCmd = buildNotifyCmd(paneId);

  const scriptPath = writeRunScript(promptsDir(cwd, sessionId), `orchestrator-run-${cycleNum}`, [
    '#!/usr/bin/env bash',
    ...(bannerCmd ? [bannerCmd] : []),
    envExports,
    notifyEnvExports,
    claudeCmd,
    notifyCmd,
  ]);
  tmux.sendKeys(paneId, `bash '${scriptPath}'`);

  const resumeArgs = `--dangerously-skip-permissions --disallowed-tools "Task,Agent" --effort ${effort} --settings "${settingsPath}" --plugin-dir "${pluginPath}"${extraPluginFlags ? ` ${extraPluginFlags}` : ''}`;
  const resumeEnv = `${envExports} && ${notifyEnvExports}`;

  await state.addOrchestratorCycle(cwd, sessionId, {
    cycle: cycleNum,
    timestamp: new Date().toISOString(),
    activeMs: 0,
    agentsSpawned: [],
    paneId,
    claudeSessionId,
    mode,
    resumeEnv,
    resumeArgs,
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

  const session = state.getSession(cwd, sessionId);
  const cycleActiveMs = flushCycleTimer(sessionId, session.orchestratorCycles.length);
  await state.completeOrchestratorCycle(cwd, sessionId, nextPrompt, mode, cycleActiveMs);

  const freshSession = state.getSession(cwd, sessionId);
  const runningAgents = freshSession.agents.filter(a => a.status === 'running');
  if (runningAgents.length === 0) {
    console.log(`[sisyphus] Orchestrator yielded with no running agents for session ${sessionId}`);
  }
}

export async function handleOrchestratorComplete(sessionId: string, cwd: string, report: string): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const cycleActiveMs = flushCycleTimer(sessionId, session.orchestratorCycles.length);
  await state.completeOrchestratorCycle(cwd, sessionId, undefined, undefined, cycleActiveMs);
  await state.completeSession(cwd, sessionId, report);

  console.log(`[sisyphus] Session ${sessionId} completed: ${report}`);
}

export function cleanupSessionMaps(sessionId: string): void {
  sessionOrchestratorPane.delete(sessionId);
  sessionWindowMap.delete(sessionId);
  unregisterSessionPanes(sessionId);
}
