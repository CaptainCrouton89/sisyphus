import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Agent, AgentReport } from '../shared/types.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { getNextColor, normalizeTmuxColor } from './colors.js';
import { getWindowId } from './orchestrator.js';
import { promptsDir, reportsDir, reportFilePath } from '../shared/paths.js';
import { createWorktreeShell, bootstrapWorktree, loadWorktreeConfig, countWorktreeAgents } from './worktree.js';
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

interface WorktreeContext {
  offset: number;
  total: number;
  branchName: string;
}

function renderAgentSuffix(sessionId: string, instruction: string, worktreeContext?: WorktreeContext): string {
  const templatePath = resolve(import.meta.dirname, '../templates/agent-suffix.md');
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    template = `# Sisyphus Agent\nSession: {{SESSION_ID}}\nTask: {{INSTRUCTION}}`;
  }

  let worktreeBlock = '';
  if (worktreeContext) {
    worktreeBlock = [
      '## Worktree Context',
      `You are working in an isolated git worktree on branch \`${worktreeContext.branchName}\`.`,
      `If you start any services that require ports, add ${worktreeContext.offset} to the default port.`,
    ].join('\n');
  }

  return template
    .replace(/\{\{SESSION_ID\}\}/g, sessionId)
    .replace(/\{\{INSTRUCTION\}\}/g, instruction)
    .replace(/\{\{WORKTREE_CONTEXT\}\}/g, worktreeBlock);
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

  if (agentConfig?.filePath && agentType && agentType !== 'worker') {
    const shortName = agentType.replace(/^sisyphus:/, '');
    copyFileSync(agentConfig.filePath, `${base}/agents/${shortName}.md`);
  }

  const srcHooks = resolve(import.meta.dirname, '../templates/agent-plugin/hooks');
  for (const f of ['hooks.json', 'require-submit.sh', 'intercept-send-message.sh']) {
    copyFileSync(`${srcHooks}/${f}`, `${base}/hooks/${f}`);
  }

  return base;
}

interface SetupAgentPaneOpts {
  sessionId: string;
  cwd: string;
  agentId: string;
  agentType: string;
  name: string;
  instruction: string;
  windowId: string;
  color: string;
  provider: Provider;
  agentConfig: ReturnType<typeof resolveAgentConfig>;
  worktreeContext?: WorktreeContext;
  paneCwd: string;
}

function setupAgentPane(opts: SetupAgentPaneOpts): { paneId: string; fullCmd: string } {
  const { sessionId, cwd, agentId, agentType, name, instruction, windowId, color, provider, agentConfig, worktreeContext, paneCwd } = opts;

  const paneId = tmux.createPane(windowId, paneCwd);
  registerPane(paneId, sessionId, 'agent', agentId);
  const shortType = agentType && agentType !== 'worker'
    ? agentType.replace(/^sisyphus:/, '')
    : '';
  const paneLabel = shortType ? `${name}-${shortType}` : name;
  tmux.setPaneTitle(paneId, `${paneLabel} (${agentId})`);
  tmux.setPaneStyle(paneId, color);

  const suffix = renderAgentSuffix(sessionId, instruction, worktreeContext);
  const suffixFilePath = `${promptsDir(cwd, sessionId)}/${agentId}-system.md`;
  writeFileSync(suffixFilePath, suffix, 'utf-8');

  const bannerCmd = resolveBannerCmd();
  const npmBinDir = resolveNpmBinDir();

  const envExports = buildEnvExports([
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='${agentId}'`,
    `export SISYPHUS_CWD='${cwd}'`,
    ...(worktreeContext ? [`export SISYPHUS_PORT_OFFSET='${worktreeContext.offset}'`] : []),
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
    mainCmd = `claude --dangerously-skip-permissions --effort ${effort} --plugin-dir "${pluginPath}"${agentFlag} --name ${shellQuote(`sisyphus:${name}`)} --append-system-prompt "$(cat '${suffixFilePath}')" ${shellQuote(instruction)}`;
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
  cwd: string;
  agentType: string;
  name: string;
  instruction: string;
  windowId: string;
  worktree?: boolean;
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

  let paneCwd = cwd;
  let worktreePath: string | undefined;
  let branchName: string | undefined;
  let worktreeContext: WorktreeContext | undefined;

  if (opts.worktree) {
    // Fast: git branch + worktree add + symlinks only (no bootstrap/init)
    const wt = createWorktreeShell(cwd, sessionId, agentId);
    worktreePath = wt.worktreePath;
    branchName = wt.branchName;
    paneCwd = worktreePath;

    const session = state.getSession(cwd, sessionId);
    const portOffset = countWorktreeAgents(session.agents) + 1;
    worktreeContext = { offset: portOffset, total: portOffset, branchName };
  }

  const { paneId, fullCmd } = setupAgentPane({
    sessionId, cwd, agentId, agentType, name, instruction,
    windowId, color, provider, agentConfig, worktreeContext, paneCwd,
  });

  const agent: Agent = {
    id: agentId,
    name,
    agentType,
    provider,
    color,
    instruction,
    status: 'running',
    spawnedAt: new Date().toISOString(),
    completedAt: null,
    reports: [],
    paneId,
    ...(worktreePath ? { worktreePath, branchName, mergeStatus: 'pending' as const } : {}),
  };

  await state.addAgent(cwd, sessionId, agent);

  if (opts.worktree && worktreePath) {
    // Defer bootstrap so the daemon can respond to the CLI before running
    // the potentially slow init command (e.g. npm install).
    // The pane is already visible; Claude command is sent after bootstrap.
    const config = loadWorktreeConfig(cwd);
    if (config) {
      const wtPath = worktreePath;
      setImmediate(() => {
        try {
          bootstrapWorktree(cwd, wtPath, config);
        } catch (err) {
          console.error(`[sisyphus] worktree bootstrap failed for ${agentId}: ${err instanceof Error ? err.message : err}`);
        }
        tmux.sendKeys(paneId, fullCmd);
      });
    } else {
      tmux.sendKeys(paneId, fullCmd);
    }
  } else {
    tmux.sendKeys(paneId, fullCmd);
  }

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
  let worktreeContext: WorktreeContext | undefined;

  if (agent.worktreePath) {
    paneCwd = agent.worktreePath;
    const portOffset = countWorktreeAgents(session.agents);
    worktreeContext = {
      offset: portOffset,
      total: portOffset,
      branchName: agent.branchName!,
    };
  }

  // Kill old pane if it still exists
  if (agent.paneId) {
    try { tmux.killPane(agent.paneId); } catch { /* already dead */ }
    unregisterAgentPane(sessionId, agentId);
  }

  const { paneId, fullCmd } = setupAgentPane({
    sessionId, cwd, agentId, agentType, name, instruction,
    windowId, color, provider, agentConfig, worktreeContext, paneCwd,
  });

  // Update agent state in-place
  await state.updateAgent(cwd, sessionId, agentId, {
    status: 'running',
    paneId,
    provider,
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
  const session = state.getSession(cwd, sessionId);
  const agent = session.agents.find(a => a.id === agentId);
  if (agent?.paneId) {
    unregisterAgentPane(sessionId, agentId);
    try { tmux.killPane(agent.paneId); } catch { /* already dead */ }
  }

  return allAgentsDone(state.getSession(cwd, sessionId));
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

