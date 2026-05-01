import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Session } from './types.js';
import { sessionDir, statePath, historySessionDir } from './paths.js';

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function buildOutputPath(label: string, dir: string): string {
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(dir, { recursive: true });

  const base = `sisyphus-${label}-${date}`;
  let candidate = join(dir, `${base}.zip`);
  let counter = 1;
  while (existsSync(candidate)) {
    counter++;
    candidate = join(dir, `${base}-${counter}.zip`);
  }
  return candidate;
}

function generateGuide(): string {
  return `# Sisyphus Session Export

## Quick Orientation

Start with \`session/state.json\` for the full session state, or \`history/session.json\` for a compact summary with metrics.

## session/

Project-local session data — the orchestrator's working directory.

### Top-level files
- **state.json** — Complete session state: id, task, status, timing, and the full \`agents[]\` array (each agent has id, type, instruction, status, reports, Claude session ID, and resume args)
- **goal.md** — The task description; updated if the goal evolves across phases
- **initial-prompt.md** — Verbatim user input that started the session
- **roadmap.md** — Orchestrator's working memory: current stage, exit criteria, active context files, next steps
- **strategy.md** — Work breakdown: completed stages, current stage decomposition (concerns/phases), and what's ahead
- **digest.json** — 4-field snapshot: \`recentWork\`, \`unusualEvents\`, \`currentActivity\`, \`whatsNext\`

### Subdirectories

**context/** — Research artifacts produced by agents and consumed by downstream agents
- \`explore-*.md\` — Codebase exploration findings (key files, architecture notes)
- \`requirements*.md/json\` — Feature requirements (structured + human-readable)
- \`design*.md/json\` — Architecture specs, decision records, diagrams
- \`{agent-id}/plan*.md\` — Implementation plans (tasks, files to touch, dependencies) — per plan-lead subdirectory
- \`e2e-recipe.md\` — End-to-end validation steps
- \`review-*.md\` — Code review findings (severity-ranked)
- \`completion-summary.md\` — Final handoff document

**logs/** — One \`cycle-NNN.md\` per orchestrator cycle. Each logs what happened, agents spawned, user decisions, and key findings.

**prompts/** — Full agent configs, one set per agent:
- \`agent-NNN-system.md\` — System prompt (instructions, tools, output format)
- \`agent-NNN-run.sh\` — Executable bash script to resume the agent (contains env, CLI args, instruction)
- \`agent-NNN-plugin/\` — Plugin directory (hooks, sub-agent configs)

**reports/** — Agent deliverables:
- \`agent-NNN-final.md\` — Final report (findings, implementation summary, or review results)
- \`agent-NNN-00N.md\` — Interim progress reports (optional)

**snapshots/** — Point-in-time checkpoints (\`snapshots/cycle-N/\`). Each contains state.json, roadmap.md, strategy.md, and logs/ as they were at that cycle boundary. Used for rollback.

**.tui/** — Lightweight TUI render cache (cycle summaries for display). Regenerable; not primary data.

## history/

Global telemetry from the daemon — timing, events, and aggregate metrics.

- **events.jsonl** — Newline-delimited JSON event stream. Each line: \`{ ts, event, sessionId, data }\`. Events include session-start, agent-spawned, agent-completed, cycle-boundary, signals-snapshot, session-end, etc. Complete audit trail.
- **session.json** — Summary: id, name, task, status, timing (activeMs, wallClockMs, efficiency), agent/cycle counts, crash/rollback counts, completion report, and a compact agents array.
`;
}

const execFileAsync = promisify(execFile);

export async function exportSessionToZip(
  sessionId: string,
  cwd: string,
  options?: { reveal?: boolean; outputDir?: string }
): Promise<string> {
  const reveal = options?.reveal ?? true;
  const sessDir = sessionDir(cwd, sessionId);
  const histDir = historySessionDir(sessionId);
  const sessExists = existsSync(sessDir);
  const histExists = existsSync(histDir);

  if (!sessExists && !histExists) {
    throw new Error(`No data found for session ${sessionId}`);
  }

  let label = sessionId.slice(0, 8);
  const stPath = statePath(cwd, sessionId);
  if (existsSync(stPath)) {
    try {
      const state = JSON.parse(readFileSync(stPath, 'utf-8')) as Session;
      if (state.name) {
        label = sanitizeName(state.name);
      }
    } catch { /* use short ID */ }
  }

  const dir = options?.outputDir ?? join(homedir(), 'Downloads');
  const outputPath = buildOutputPath(label, dir);
  const tmpDir = `/tmp/sisyphus-export-${sessionId.slice(0, 8)}-${Date.now()}`;

  try {
    mkdirSync(tmpDir, { recursive: true });

    writeFileSync(join(tmpDir, 'CLAUDE.md'), generateGuide(), 'utf-8');

    if (sessExists) {
      symlinkSync(sessDir, join(tmpDir, 'session'));
    }
    if (histExists) {
      symlinkSync(histDir, join(tmpDir, 'history'));
    }

    const parts = ['CLAUDE.md', sessExists ? 'session/' : '', histExists ? 'history/' : ''].filter(Boolean) as string[];
    await execFileAsync('zip', ['-rq', outputPath, ...parts], { cwd: tmpDir });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (reveal) {
    try {
      await execFileAsync('open', ['-R', outputPath]);
    } catch { /* non-fatal if Finder fails */ }
  }

  return outputPath;
}
