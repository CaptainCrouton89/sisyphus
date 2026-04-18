import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { sessionDir, statePath, historySessionDir } from '../../shared/paths.js';
import { shellQuote } from '../../shared/shell.js';

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function buildOutputPath(label: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(homedir(), 'Downloads');
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
- \`plan*.md\` — Implementation plans (tasks, files to touch, dependencies)
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

export function exportSessionToZip(sessionId: string, cwd: string, options?: { reveal?: boolean }): string {
  const reveal = options?.reveal ?? true;
  const sessDir = sessionDir(cwd, sessionId);
  const histDir = historySessionDir(sessionId);
  const sessExists = existsSync(sessDir);
  const histExists = existsSync(histDir);

  if (!sessExists && !histExists) {
    throw new Error(`No data found for session ${sessionId}`);
  }

  // Read session name for filename
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

  const outputPath = buildOutputPath(label);
  const tmpDir = `/tmp/sisyphus-export-${sessionId.slice(0, 8)}-${Date.now()}`;

  try {
    mkdirSync(tmpDir, { recursive: true });

    // Generate guide at root level
    writeFileSync(join(tmpDir, 'CLAUDE.md'), generateGuide(), 'utf-8');

    if (sessExists) {
      symlinkSync(sessDir, join(tmpDir, 'session'));
    }
    if (histExists) {
      symlinkSync(histDir, join(tmpDir, 'history'));
    }

    const parts = ['CLAUDE.md', sessExists ? 'session/' : '', histExists ? 'history/' : ''].filter(Boolean).join(' ');
    execSync(`zip -rq ${shellQuote(outputPath)} ${parts}`, {
      cwd: tmpDir,
      stdio: 'pipe',
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (reveal) {
    try {
      execSync(`open -R ${shellQuote(outputPath)}`, { stdio: 'pipe' });
    } catch { /* non-fatal if Finder fails */ }
  }

  return outputPath;
}

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Export session data as zip to ~/Downloads')
    .argument('[session-id]', 'Session ID (defaults to SISYPHUS_SESSION_ID or active session)')
    .option('--cwd <path>', 'Project directory override')
    .action(async (sessionIdArg?: string, opts?: { cwd?: string }) => {
      let sessionId = sessionIdArg ?? process.env.SISYPHUS_SESSION_ID;
      const cwd = opts?.cwd ?? process.env['SISYPHUS_CWD'] ?? process.cwd();

      // If no session ID provided, try to get the active session from daemon
      if (!sessionId) {
        const request: Request = { type: 'status', cwd };
        const response = await sendRequest(request);
        if (response.ok) {
          const session = response.data?.session as Session | undefined;
          if (session) {
            sessionId = session.id;
          }
        }
      }

      if (!sessionId) {
        console.error('Error: No session ID provided and no active session found.');
        console.error('Usage: sisyphus export [session-id]');
        process.exit(1);
      }

      try {
        const outputPath = exportSessionToZip(sessionId, cwd);
        console.log(`Exported to ${outputPath}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
