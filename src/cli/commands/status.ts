import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session, Agent, OrchestratorCycle } from '../../shared/types.js';
import { computeActiveTimeMs } from '../../shared/utils.js';
import { roadmapPath, cycleLogPath } from '../../shared/paths.js';
import { formatDuration, statusColor, bold, dim, red, colorize as fmtColorize } from '../../shared/format.js';

function colorize(text: string, status: string): string {
  return fmtColorize(text, statusColor(status));
}

function inferOrchestratorPhase(session: Session): string {
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return 'planning';
  const lastCycle = cycles[cycles.length - 1];

  if (!lastCycle.completedAt) {
    // Orchestrator pane is alive
    const elapsed = Date.now() - new Date(lastCycle.timestamp).getTime();
    if (elapsed < 5000 || lastCycle.agentsSpawned.length === 0) return 'planning';
    return 'spawning';
  } else {
    // Orchestrator yielded
    const runningAgents = session.agents.filter(
      a => lastCycle.agentsSpawned.includes(a.id) && a.status === 'running'
    );
    if (runningAgents.length > 0) {
      return `waiting on ${runningAgents.map(a => a.id).join(', ')}`;
    }
    return 'starting';
  }
}

function formatAgent(agent: Agent, verbose: boolean): string {
  const status = colorize(agent.status, agent.status);
  const name = bold(agent.name);
  const type = dim(`(${agent.agentType})`);
  const duration = formatDuration(agent.activeMs);
  let line = `    ${agent.id} ${name} ${type} — ${status} ${dim(`(${duration})`)}`;
  if (verbose && agent.instruction) {
    const truncated = agent.instruction.length > 200 ? agent.instruction.slice(0, 200) + '...' : agent.instruction;
    line += `\n      ${dim(`Instruction: ${truncated}`)}`;
  }
  if (agent.reports.length > 0) {
    for (const r of agent.reports) {
      const label = r.type === 'final' ? 'Final' : 'Update';
      line += `\n      ${label}: ${r.summary}`;
    }
  }
  if (agent.killedReason) {
    line += `\n      Reason: ${agent.killedReason}`;
  }
  return line;
}

function formatCycle(cycle: OrchestratorCycle, phase?: string): string {
  let duration: string;
  if (cycle.completedAt) {
    duration = ` ${dim(`(${formatDuration(cycle.activeMs)})`)}`;
  } else {
    const elapsed = formatDuration(cycle.activeMs);
    duration = ` ${dim(`(running, ${elapsed})`)}`;
  }
  const agents = cycle.agentsSpawned.length > 0
    ? ` — agents: ${cycle.agentsSpawned.join(', ')}`
    : '';
  const phaseStr = phase ? ` — orchestrator: ${phase}` : '';
  return `    Cycle ${cycle.cycle}${duration}${agents}${phaseStr}`;
}

function computeLastActivity(session: Session): Date | null {
  const timestamps: number[] = [];

  for (const cycle of session.orchestratorCycles) {
    timestamps.push(new Date(cycle.timestamp).getTime());
    if (cycle.completedAt) timestamps.push(new Date(cycle.completedAt).getTime());
  }

  for (const agent of session.agents) {
    timestamps.push(new Date(agent.spawnedAt).getTime());
    if (agent.completedAt) timestamps.push(new Date(agent.completedAt).getTime());
    for (const r of agent.reports) {
      timestamps.push(new Date(r.timestamp).getTime());
    }
  }

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function readRoadmap(cwd: string, sessionId: string): string | null {
  try {
    return readFileSync(roadmapPath(cwd, sessionId), 'utf8');
  } catch {
    return null;
  }
}

function readCycleLog(cwd: string, sessionId: string, cycle: number): string | null {
  try {
    const path = cycleLogPath(cwd, sessionId, cycle);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function capturePaneOutput(paneId: string, lines: number = 50): string | null {
  try {
    return execSync(
      `tmux capture-pane -t "${paneId}" -p -S -${lines}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trimEnd();
  } catch {
    return null;
  }
}

function printSession(session: Session, verbose: boolean): void {
  const status = colorize(session.status, session.status);
  const sessionDuration = formatDuration(session.createdAt, session.completedAt);
  console.log(`\n${bold(`Session: ${session.id}`)}`);
  console.log(`  Status: ${status}`);
  const effortLabel = session.effort != null ? session.effort : 'high (default)';
  console.log(`  Effort: ${effortLabel}`);
  console.log(`  Task: ${session.task}`);
  if (session.context) {
    const truncated = !verbose && session.context.length > 120 ? session.context.slice(0, 120) + '...' : session.context;
    console.log(`  Context: ${truncated}`);
  }
  console.log(`  CWD: ${session.cwd}`);
  console.log(`  Created: ${session.createdAt}`);
  const activeTime = formatDuration(computeActiveTimeMs(session));
  console.log(`  Duration: ${sessionDuration}${session.completedAt ? '' : ' (ongoing)'} (${activeTime} active)`);

  const lastActivity = computeLastActivity(session);
  if (lastActivity) {
    console.log(`  Last activity: ${formatDuration(Date.now() - lastActivity.getTime())} ago`);
  }

  console.log(`  Orchestrator cycles: ${session.orchestratorCycles.length}`);

  if (session.handoff) {
    const h = session.handoff;
    if (h.lastError) {
      console.log(`  Handoff: ${red('error')} — ${h.lastError}`);
    } else if (h.reclaimedAt) {
      const where = h.target ? `${h.target.provider}:${h.target.repo}` : 'cloud';
      console.log(`  Handoff: reclaimed from ${where} at ${h.reclaimedAt}`);
    } else if (h.sentAt && h.target) {
      console.log(`  Handoff: running on ${h.target.provider}:${h.target.repo} since ${h.sentAt}`);
    } else if (h.target) {
      console.log(`  Handoff: queued → ${h.target.provider}:${h.target.repo} (since ${h.queuedAt})`);
    } else {
      console.log(`  Handoff: quiesce queued (since ${h.queuedAt})`);
    }
  }

  // Active agents block
  const runningAgents = session.agents.filter(a => a.status === 'running');
  if (runningAgents.length > 0) {
    console.log(`\n${bold(`Active agents (${runningAgents.length}):`)}` );
    for (const agent of runningAgents) {
      const name = bold(agent.name);
      const type = dim(`(${agent.agentType})`);
      const duration = formatDuration(agent.activeMs);
      console.log(`  ${agent.id}  ${name}  ${type}  running ${duration}`);
      if (verbose && agent.instruction) {
        const truncated = agent.instruction.length > 200 ? agent.instruction.slice(0, 200) + '...' : agent.instruction;
        console.log(`    ${dim(`Instruction: ${truncated}`)}`);
      }
    }
  }

  // Roadmap
  const roadmap = readRoadmap(session.cwd, session.id);
  if (roadmap) {
    console.log(`\n${bold('Roadmap:')}`);
    console.log(roadmap);
  }

  if (session.orchestratorCycles.length > 0) {
    console.log(`\n  ${bold('Cycles:')}`);
    const cycles = session.orchestratorCycles;
    for (let i = 0; i < cycles.length; i++) {
      const isLast = i === cycles.length - 1;
      const phase = isLast && session.status === 'active' ? inferOrchestratorPhase(session) : undefined;
      console.log(formatCycle(cycles[i], phase));

      // Verbose: show cycle log
      if (verbose) {
        const log = readCycleLog(session.cwd, session.id, cycles[i].cycle);
        if (log) {
          const lines = log.split('\n');
          const preview = lines.slice(0, 20).join('\n');
          console.log(`      ${dim('--- cycle log ---')}`);
          for (const line of preview.split('\n')) {
            console.log(`      ${dim(line)}`);
          }
          if (lines.length > 20) {
            console.log(`      ${dim(`... (${lines.length - 20} more lines)`)}`);
          }
        }
      }
    }
  }

  if (session.agents.length > 0) {
    console.log(`\n  ${bold('Agents:')}`);
    for (const agent of session.agents) {
      console.log(formatAgent(agent, verbose));
    }
  }

  // Verbose: capture live pane output
  if (verbose) {
    // Orchestrator pane (from last running cycle)
    const lastCycle = session.orchestratorCycles[session.orchestratorCycles.length - 1];
    if (lastCycle && !lastCycle.completedAt && lastCycle.paneId) {
      const output = capturePaneOutput(lastCycle.paneId);
      if (output) {
        console.log(`\n<orchestrator-pane-output lines="50">`);
        console.log(output);
        console.log(`</orchestrator-pane-output>`);
      }
    }

    // Running agent panes
    for (const agent of runningAgents) {
      if (agent.paneId) {
        const output = capturePaneOutput(agent.paneId, 30);
        if (output) {
          console.log(`\n<agent-pane-output agent="${agent.id}" name="${agent.name}" lines="30">`);
          console.log(output);
          console.log(`</agent-pane-output>`);
        }
      }
    }
  }

  // Completion report
  if (verbose && session.completionReport) {
    console.log(`\n${bold('Completion Report:')}`);
    console.log(session.completionReport);
  }
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show session status')
    .argument('[session-id]', 'Session ID (defaults to SISYPHUS_SESSION_ID env)')
    .option('-v, --verbose', 'Show detailed output (roadmap, pane output, agent instructions)')
    .option('-j, --json', 'Output raw JSON instead of formatted text')
    .action(async (sessionIdArg?: string, opts?: { verbose?: boolean; json?: boolean }) => {
      const sessionId = sessionIdArg ?? process.env.SISYPHUS_SESSION_ID;
      const verbose = opts?.verbose ?? false;
      const json = opts?.json ?? false;
      const cwd = process.env['SISYPHUS_CWD'] ?? process.cwd();

      const request: Request = { type: 'status', sessionId, cwd };
      const response = await sendRequest(request);
      if (response.ok) {
        const session = response.data?.session as Session | undefined;
        if (session) {
          if (json) {
            console.log(JSON.stringify(session));
          } else {
            printSession(session, verbose);
          }
        } else {
          console.log('No session found');
        }
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
