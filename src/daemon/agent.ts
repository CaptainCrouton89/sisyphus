import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Agent, AgentReport } from '../shared/types.js';
import * as state from './state.js';
import * as tmux from './tmux.js';
import { getNextColor, normalizeTmuxColor } from './colors.js';
import { getWindowId } from './orchestrator.js';
import { promptsDir, reportsDir, reportFilePath } from '../shared/paths.js';
import { createWorktreeShell, bootstrapWorktree, loadWorktreeConfig, countWorktreeAgents } from './worktree.js';
import { registerPane, unregisterPane, unregisterAgentPane } from './pane-registry.js';
import { resolveAgentConfig, detectProvider } from './frontmatter.js';

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
  const pluginPath = resolve(import.meta.dirname, '../templates/agent-plugin');

  // Resolve agent config for frontmatter (color, model, provider)
  const agentConfig = resolveAgentConfig(agentType, pluginPath, cwd);
  const provider = detectProvider(agentConfig?.frontmatter.model);
  const color = (agentConfig?.frontmatter.color ? normalizeTmuxColor(agentConfig.frontmatter.color) : null) ?? getNextColor(sessionId);

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

  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  const bannerCmd = existsSync(bannerPath) ? `cat '${bannerPath}' &&` : '';

  // Resolve CLI binary path so `sisyphus` works even when installed as a local dependency
  const cliBin = resolve(import.meta.dirname, 'cli.js');
  const npmBinDir = resolve(import.meta.dirname, '../../.bin');

  const envExports = [
    `export SISYPHUS_SESSION_ID='${sessionId}'`,
    `export SISYPHUS_AGENT_ID='${agentId}'`,
    ...(worktreeContext ? [`export SISYPHUS_PORT_OFFSET='${worktreeContext.offset}'`] : []),
    `export PATH="${npmBinDir}:$PATH"`,
  ].join(' && ');

  const notifyCmd = `node "${cliBin}" notify pane-exited --pane-id ${paneId}`;

  let mainCmd: string;

  if (provider === 'openai') {
    // Build combined prompt for codex
    const codexPromptPath = `${promptsDir(cwd, sessionId)}/${agentId}-codex-prompt.md`;
    const parts: string[] = [];

    // 1. Agent type body (stripped of frontmatter)
    if (agentConfig?.body) {
      parts.push(agentConfig.body);
    }

    // 2. Rendered agent-suffix template
    parts.push(suffix);

    // 3. The instruction itself
    parts.push(`## Task\n\n${instruction}`);

    writeFileSync(codexPromptPath, parts.join('\n\n'), 'utf-8');

    const model = agentConfig?.frontmatter.model ?? 'codex-mini';
    mainCmd = `codex -m ${shellQuote(model)} --dangerously-bypass-approvals-and-sandbox "$(cat '${codexPromptPath}')"`;
  } else {
    // Anthropic (current behavior)
    const agentFlag = agentType && agentType !== 'worker' ? ` --agent ${shellQuote(agentType)}` : '';
    mainCmd = `claude --dangerously-skip-permissions --plugin-dir "${pluginPath}"${agentFlag} --append-system-prompt "$(cat '${suffixFilePath}')" ${shellQuote(instruction)}`;
  }

  const fullCmd = `${bannerCmd} ${envExports} && ${mainCmd}; ${notifyCmd}`;

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
    unregisterPane(agent.paneId);
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

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
