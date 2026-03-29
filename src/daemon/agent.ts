import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import type { Agent, AgentReport } from '../shared/types.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { getNextColor, normalizeTmuxColor } from './colors.js';
import { getWindowId } from './orchestrator.js';
import { promptsDir, reportsDir, reportFilePath, sessionDir } from '../shared/paths.js';
import { registerPane, unregisterPane, unregisterAgentPane } from './pane-registry.js';
import { summarizeReport } from './summarize.js';
import { resolveAgentConfig, detectProvider } from './frontmatter.js';
import type { Provider } from './frontmatter.js';
import { loadConfig } from '../shared/config.js';
import { execEnv } from '../shared/env.js';
import { shellQuote } from '../shared/shell.js';
import { resolveCliBin, resolveNpmBinDir, resolveBannerCmd, buildEnvExports, buildNotifyCmd, writeRunScript } from './spawn-helpers.js';

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
    .replace(/\{\{INSTRUCTION\}\}/g, instruction)
    .replace(/\{\{WORKTREE_CONTEXT\}\}/g, '');
}

function createAgentPlugin(
  cwd: string,
  sessionId: string,
  agentId: string,
  agentType: string,
  agentConfig: ReturnType<typeof resolveAgentConfig>,
): string {
  const base = `${promptsDir(cwd, sessionId)}/${agentId}-plugin`;
  mkdirSync(`${base}/.claude-plugin`, { recursive: true });
  mkdirSync(`${base}/agents`, { recursive: true });
  mkdirSync(`${base}/hooks`, { recursive: true });

  writeFileSync(
    `${base}/.claude-plugin/plugin.json`,
    JSON.stringify({ name: `sisyphus-agent-${agentId}`, version: '1.0.0' }),
    'utf-8',
  );

  // Substitute session env vars in agent type templates
  const sesDir = sessionDir(cwd, sessionId);
  const substituteEnvVars = (text: string) => text
    .replace(/\$SISYPHUS_SESSION_DIR/g, sesDir)
    .replace(/\$SISYPHUS_SESSION_ID/g, sessionId);

  if (agentConfig?.filePath && agentType && agentType !== 'worker') {
    const shortName = agentType.replace(/^sisyphus:/, '');
    writeFileSync(`${base}/agents/${shortName}.md`, substituteEnvVars(readFileSync(agentConfig.filePath, 'utf-8')), 'utf-8');

    // Copy sub-agent definitions if a subdirectory exists
    const subAgentDir = join(dirname(agentConfig.filePath), shortName);
    if (existsSync(subAgentDir)) {
      for (const f of readdirSync(subAgentDir)) {
        if (f.endsWith('.md') && f !== 'CLAUDE.md') {
          writeFileSync(`${base}/agents/${f}`, substituteEnvVars(readFileSync(join(subAgentDir, f), 'utf-8')), 'utf-8');
        }
      }
    }
  }

  const srcHooks = resolve(import.meta.dirname, '../templates/agent-plugin/hooks');
  for (const f of ['require-submit.sh', 'intercept-send-message.sh']) {
    copyFileSync(`${srcHooks}/${f}`, `${base}/hooks/${f}`);
  }

  // Build hooks config with conditional UserPromptSubmit per agent type
  // Use ${CLAUDE_PLUGIN_ROOT} for paths — Claude Code resolves this to the plugin directory
  const hooksConfig: Record<string, unknown[]> = {
    PreToolUse: [
      { matcher: 'SendMessage', hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/intercept-send-message.sh' }] },
    ],
  };

  // Interactive agents (e.g. problem, requirements, design, plan) are designed for user back-and-forth
  // and should not be blocked from stopping by the submit requirement.
  if (!agentConfig?.frontmatter.interactive) {
    hooksConfig.Stop = [
      { hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/hooks/require-submit.sh' }] },
    ];
  }

  const normalizedType = agentType?.replace(/^sisyphus:/, '') ?? '';
  const userPromptHooks: Record<string, string> = {
    'plan': 'plan-user-prompt.sh',
    'review': 'review-user-prompt.sh',
    'review-plan': 'review-plan-user-prompt.sh',
    'debug': 'debug-user-prompt.sh',
    'operator': 'operator-user-prompt.sh',
    'test-spec': 'test-spec-user-prompt.sh',
    'explore': 'explore-user-prompt.sh',
  };
  const hookScript = userPromptHooks[normalizedType];
  if (hookScript) {
    hooksConfig.UserPromptSubmit = [
      { hooks: [{ type: 'command', command: `bash \${CLAUDE_PLUGIN_ROOT}/hooks/${hookScript}` }] },
    ];
    copyFileSync(`${srcHooks}/${hookScript}`, `${base}/hooks/${hookScript}`);
  }

  writeFileSync(`${base}/hooks/hooks.json`, JSON.stringify({ hooks: hooksConfig }, null, 2), 'utf-8');

  return base;
}

interface SetupAgentPaneOpts {
  sessionId: string;
  sessionName?: string;
  cycleNum: number;
  cwd: string;
  agentId: string;
  agentType: string;
  name: string;
  instruction: string;
  windowId: string;
  color: string;
  provider: Provider;
  agentConfig: ReturnType<typeof resolveAgentConfig>;
  paneCwd: string;
  claudeSessionId?: string;
}

function setupAgentPane(opts: SetupAgentPaneOpts): { paneId: string; fullCmd: string } {
  const { sessionId, cycleNum, cwd, agentId, agentType, name, instruction, windowId, color, provider, agentConfig, paneCwd, claudeSessionId } = opts;

  const paneId = tmux.createPane(windowId, paneCwd);
  registerPane(paneId, sessionId, 'agent', agentId);
  const shortType = agentType && agentType !== 'worker'
    ? agentType.replace(/^sisyphus:/, '')
    : '';
  const paneLabel = shortType ? `${name}-${shortType}` : name;
  const sessionLabel = opts.sessionName ?? sessionId.slice(0, 8);
  const agentTitle = `ssph:${sessionLabel} ${paneLabel} c${cycleNum}`;
  tmux.setPaneTitle(paneId, agentTitle);
  tmux.setPaneStyle(paneId, color);

  const suffix = renderAgentSuffix(sessionId, instruction);
  const suffixFilePath = `${promptsDir(cwd, sessionId)}/${agentId}-system.md`;
  writeFileSync(suffixFilePath, suffix, 'utf-8');

  const bannerCmd = resolveBannerCmd();
  const npmBinDir = resolveNpmBinDir();
  const sesDir = sessionDir(cwd, sessionId);

  const envExports = buildEnvExports([
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='${agentId}'`,
    `export SISYPHUS_CWD='${cwd}'`,
    `export SISYPHUS_SESSION_DIR='${sesDir}'`,
    `export PATH="${npmBinDir}:$PATH"`,
  ]);

  const notifyCmd = buildNotifyCmd(paneId);

  let mainCmd: string;

  if (provider === 'openai') {
    const codexPromptPath = `${promptsDir(cwd, sessionId)}/${agentId}-codex-prompt.md`;
    const parts: string[] = [];
    if (agentConfig?.body) parts.push(agentConfig.body);
    parts.push(suffix);
    parts.push(`## Task\n\n${instruction}`);
    writeFileSync(codexPromptPath, parts.join('\n\n'), 'utf-8');
    const model = agentConfig?.frontmatter.model ?? 'codex-mini';
    mainCmd = `codex -m ${shellQuote(model)} --dangerously-bypass-approvals-and-sandbox "$(cat '${codexPromptPath}')"`;
  } else {
    const agentFlag = agentType && agentType !== 'worker' ? ` --agent ${shellQuote(agentType)}` : '';
    const config = loadConfig(cwd);
    const effort = agentConfig?.frontmatter.effort ?? config.agentEffort ?? 'medium';
    const pluginPath = createAgentPlugin(cwd, sessionId, agentId, agentType, agentConfig);
    const sessionIdFlag = claudeSessionId ? ` --session-id "${claudeSessionId}"` : '';
    mainCmd = `claude --dangerously-skip-permissions --effort ${effort} --plugin-dir "${pluginPath}"${agentFlag}${sessionIdFlag} --name ${shellQuote(agentTitle)} --append-system-prompt "$(cat '${suffixFilePath}')" ${shellQuote(instruction)}`;
  }

  const scriptPath = writeRunScript(promptsDir(cwd, sessionId), `${agentId}-run`, [
    '#!/usr/bin/env bash',
    ...(bannerCmd ? [bannerCmd] : []),
    envExports,
    mainCmd,
    notifyCmd,
  ]);
  const fullCmd = `bash '${scriptPath}'`;

  return { paneId, fullCmd };
}

export interface SpawnAgentOpts {
  sessionId: string;
  sessionName?: string;
  cycleNum: number;
  cwd: string;
  agentType: string;
  name: string;
  instruction: string;
  windowId: string;
  repo?: string;
}

export async function spawnAgent(opts: SpawnAgentOpts): Promise<Agent> {
  const { sessionId, cwd, agentType, name, instruction, windowId } = opts;
  const count = (agentCounters.get(sessionId) ?? 0) + 1;
  agentCounters.set(sessionId, count);
  const agentId = `agent-${String(count).padStart(3, '0')}`;
  const bundledPluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');

  // Resolve agent config for frontmatter (color, model, provider)
  const agentConfig = resolveAgentConfig(agentType, bundledPluginPath, cwd);
  const provider = detectProvider(agentConfig?.frontmatter.model);
  const color = (agentConfig?.frontmatter.color ? normalizeTmuxColor(agentConfig.frontmatter.color) : null) ?? getNextColor(sessionId);

  // Verify CLI is available before spawning
  const cliToCheck = provider === 'openai' ? 'codex' : 'claude';
  try {
    execSync(`which ${cliToCheck}`, { stdio: 'pipe', env: execEnv() });
  } catch {
    throw new Error(`${cliToCheck} CLI not found on PATH. Run \`sisyphus doctor\` to diagnose.`);
  }

  const repo = opts.repo !== undefined ? opts.repo : '.';
  const repoRoot = repo === '.' ? cwd : join(cwd, repo);
  const paneCwd = repoRoot;

  const claudeSessionId = provider !== 'openai' ? randomUUID() : undefined;

  const { paneId, fullCmd } = setupAgentPane({
    sessionId, sessionName: opts.sessionName, cycleNum: opts.cycleNum, cwd, agentId, agentType, name, instruction,
    windowId, color, provider, agentConfig, paneCwd, claudeSessionId,
  });

  const agent: Agent = {
    id: agentId,
    name,
    agentType,
    provider,
    claudeSessionId,
    color,
    instruction,
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    reports: [],
    paneId,
    repo,
  };

  await state.addAgent(cwd, sessionId, agent);

  tmux.sendKeys(paneId, fullCmd);

  return agent;
}

export async function restartAgent(
  sessionId: string,
  cwd: string,
  agentId: string,
  windowId: string,
): Promise<void> {
  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  if (agent.status === 'running') {
    // Check if the pane is actually alive — if not, the agent is a zombie
    const paneAlive = agent.paneId && tmux.paneExists(agent.paneId);
    if (paneAlive) {
      throw new Error(`Agent ${agentId} is already running`);
    }
    // Pane is dead — mark as lost before restarting
    await state.updateAgent(cwd, sessionId, agentId, {
      status: 'lost',
      killedReason: 'pane disappeared (detected on restart)',
      completedAt: new Date().toISOString(),
    });
  }

  const { instruction, agentType, name, color } = agent;
  const bundledPluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');

  // Resolve agent config for frontmatter (model, provider)
  const agentConfig = resolveAgentConfig(agentType, bundledPluginPath, cwd);
  const provider = detectProvider(agentConfig?.frontmatter.model);

  let paneCwd = cwd;

  if (agent.repo !== '.') {
    paneCwd = join(cwd, agent.repo);
  }

  // Kill old pane if it still exists
  if (agent.paneId) {
    try { tmux.killPane(agent.paneId); } catch { /* already dead */ }
    unregisterAgentPane(sessionId, agentId);
  }

  const claudeSessionId = provider !== 'openai' ? randomUUID() : undefined;

  const { paneId, fullCmd } = setupAgentPane({
    sessionId, sessionName: session.name, cycleNum: session.orchestratorCycles.length, cwd, agentId, agentType, name, instruction,
    windowId, color, provider, agentConfig, paneCwd, claudeSessionId,
  });

  // Update agent state in-place
  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'running',
    paneId,
    provider,
    claudeSessionId,
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    killedReason: undefined,
  });

  tmux.sendKeys(paneId, fullCmd);
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

  // Fire async Haiku summarization (non-blocking)
  summarizeReport(content).then(async (aiSummary) => {
    if (aiSummary) {
      await state.updateReportSummary(cwd, sessionId, agentId, filePath, aiSummary);
    }
  }).catch(() => {});
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

  // Fire async Haiku summarization (non-blocking)
  summarizeReport(report).then(async (aiSummary) => {
    if (aiSummary) {
      await state.updateReportSummary(cwd, sessionId, agentId, filePath, aiSummary);
    }
  }).catch(() => {});

  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  // Kill the pane — Claude doesn't exit on its own after running a bash command.
  // But if this is the last agent, defer the kill to onAllAgentsDone() so the tmux
  // window doesn't collapse (killing the last pane destroys the window and detaches the user).
  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  const allDone = allAgentsDone(session);
  if (agent?.paneId) {
    unregisterAgentPane(sessionId, agentId);
    if (!allDone) {
      try { tmux.killPane(agent.paneId); } catch { /* already dead */ }
    }
  }

  return allDone;
}

export async function handleAgentKilled(
  cwd: string,
  sessionId: string,
  agentId: string,
  reason: string,
): Promise<boolean> {
  unregisterAgentPane(sessionId, agentId);
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

