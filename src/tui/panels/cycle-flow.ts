import stringWidth from 'string-width';
import type { Session, Agent, OrchestratorCycle } from '../../shared/types.js';
import { formatDuration } from '../../shared/format.js';
import {
  seg,
  singleLine,
  agentDisplayName,
  agentStatusIcon,
  statusColor,
  durationColor,
  modeColor,
  abbreviateMode,
  truncate,
  wrapText,
  formatTime,
  type DetailLine,
  type Seg,
} from '../lib/format.js';

// ---------------------------------------------------------------------------
// Background tints (dark ANSI 24-bit backgrounds)
// ---------------------------------------------------------------------------

const BG_TINTS: Record<string, string> = {
  yellow:  '48;2;40;35;20',
  blue:    '48;2;20;25;45',
  green:   '48;2;20;35;20',
  magenta: '48;2;30;22;40',
  cyan:    '48;2;18;30;38',
  red:     '48;2;40;20;22',
  gray:    '48;2;25;26;32',
  white:   '48;2;30;30;30',
};

// Map tmux/extended color names to standard ANSI color names for seg()
const TMUX_TO_ANSI: Record<string, string> = {
  colour208: 'yellow',  // orange
  colour6: 'cyan',      // teal
  orange: 'yellow',
  teal: 'cyan',
};

/** Resolve a color name (possibly tmux-extended) to a valid ANSI color name */
function resolveColor(color: string): string {
  return TMUX_TO_ANSI[color] ?? color;
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

type Phase = 'orchestrator' | 'agents' | 'between' | 'complete';

function getCurrentPhase(session: Session): Phase {
  if (session.status === 'completed') return 'complete';
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return 'orchestrator';
  const lastCycle = cycles[cycles.length - 1]!;
  const cycleAgents = session.agents.filter(a => lastCycle.agentsSpawned.includes(a.id));

  if (!lastCycle.completedAt) {
    return cycleAgents.length > 0 ? 'agents' : 'orchestrator';
  }

  const allDone = cycleAgents.every(a => a.status !== 'running');
  if (cycleAgents.length > 0 && !allDone) return 'agents';
  if (cycleAgents.length > 0 && allDone && lastCycle.nextPrompt) return 'between';
  return 'orchestrator';
}

// ---------------------------------------------------------------------------
// Box rendering primitives
// ---------------------------------------------------------------------------

/** Pad or truncate text to exactly `w` display columns */
function padTo(text: string, w: number): string {
  const tw = stringWidth(text);
  if (tw >= w) return truncate(text, w);
  return text + ' '.repeat(w - tw);
}

/** Build a full-width orchestrator box */
function buildOrchestratorNode(
  cycle: OrchestratorCycle,
  agents: Agent[],
  width: number,
  bright: boolean,
  showConnectorBottom: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const inner = width - 2; // inside borders
  const bg = BG_TINTS.yellow;
  const dim = !bright;
  const isRunning = !cycle.completedAt;
  const icon = isRunning ? '●' : '○';
  const cycleLabel = `C${cycle.cycle}`;
  const modeLabel = abbreviateMode(cycle.mode);
  const mColor = modeColor(cycle.mode);

  let rightText: string;
  if (isRunning) {
    rightText = 'running';
  } else {
    const dur = formatDuration(cycle.activeMs);
    const time = formatTime(cycle.timestamp);
    rightText = `${dur}   ${time}`;
  }

  const leftContent = `${icon} ${cycleLabel}  ${modeLabel}`;
  const leftW = stringWidth(leftContent);
  const rightW = stringWidth(rightText);
  const gap = Math.max(1, inner - 2 - leftW - rightW);

  // Top border
  lines.push([seg('╭' + '─'.repeat(inner) + '╮', { color: 'yellow', dim })]);

  // Content row with bg tint
  const contentSegs: Seg[] = [
    seg('│', { color: 'yellow', dim }),
    seg(' ' + icon + ' ', { bg, color: isRunning ? 'green' : undefined, dim: !isRunning && dim, bold: bright }),
    seg(cycleLabel, { bg, dim, bold: bright }),
    seg('  ', { bg }),
    seg(modeLabel, { bg, color: mColor, dim }),
    seg(' '.repeat(gap), { bg }),
  ];
  if (isRunning && bright) {
    contentSegs.push(seg(rightText, { bg, color: 'green', bold: true }));
  } else {
    contentSegs.push(seg(rightText, { bg, dim }));
  }
  contentSegs.push(seg(' ', { bg }));
  // Pad remaining to fill inner width
  const usedWidth = 1 + 1 + 1 + 1 + stringWidth(cycleLabel) + 2 + stringWidth(modeLabel) + gap + stringWidth(rightText) + 1;
  if (usedWidth < inner) {
    contentSegs.push(seg(' '.repeat(inner - usedWidth), { bg }));
  }
  contentSegs.push(seg('│', { color: 'yellow', dim }));
  lines.push(contentSegs);

  // Agent summary row
  if (agents.length > 0) {
    const running = agents.filter(a => a.status === 'running').length;
    const done = agents.filter(a => a.status === 'completed').length;
    const failed = agents.filter(a => a.status === 'killed' || a.status === 'crashed').length;
    const parts: Seg[] = [
      seg('│', { color: 'yellow', dim }),
      seg(` ${agents.length} agent${agents.length !== 1 ? 's' : ''}: `, { bg, dim: true }),
    ];
    if (running > 0) parts.push(seg(`${running}▶ `, { bg, color: 'green', dim }));
    if (done > 0) parts.push(seg(`${done}✓ `, { bg, color: 'cyan', dim }));
    if (failed > 0) parts.push(seg(`${failed}✕ `, { bg, color: 'red', dim }));
    // Compute used width for padding
    const labelLen = ` ${agents.length} agent${agents.length !== 1 ? 's' : ''}: `.length;
    const countLen = (running > 0 ? `${running}▶ `.length : 0) + (done > 0 ? `${done}✓ `.length : 0) + (failed > 0 ? `${failed}✕ `.length : 0);
    const remaining = Math.max(0, inner - labelLen - countLen);
    parts.push(seg(' '.repeat(remaining), { bg }));
    parts.push(seg('│', { color: 'yellow', dim }));
    lines.push(parts);
  }

  // Bottom border — with or without connector
  if (showConnectorBottom) {
    const mid = Math.floor(inner / 2);
    const left = mid;
    const right = inner - mid - 1;
    lines.push([seg('╰' + '─'.repeat(left) + '┬' + '─'.repeat(right) + '╯', { color: 'yellow', dim })]);
  } else {
    lines.push([seg('╰' + '─'.repeat(inner) + '╯', { color: 'yellow', dim })]);
  }

  return lines;
}

/** Canonical stem column — all vertical connectors use this */
function stemCol(width: number): number {
  return Math.floor(width / 2);
}

/** Build the vertical connector line between orchestrator and agent branch */
function buildVerticalConnector(width: number, dim: boolean): DetailLine {
  const col = stemCol(width);
  return [
    seg(' '.repeat(col)),
    seg('│', { dim }),
  ];
}

/** Build horizontal branch connector: ┌────┼────┐ */
function buildBranchConnector(
  boxWidth: number,
  count: number,
  totalWidth: number,
  direction: 'down' | 'up',
): DetailLine[] {
  if (count === 0) return [];
  const centers = boxCenters(boxWidth, count, totalWidth);
  const mid = stemCol(totalWidth);
  const lineStart = centers[0]!;
  const lineEnd = centers[centers.length - 1]!;

  if (count === 1) {
    // Single agent — just a vertical line at center
    return [buildVerticalConnector(totalWidth, false)];
  }

  // Build the horizontal branch line
  const row = new Array(totalWidth).fill(' ');
  const upChar = direction === 'down' ? '┬' : '┴';
  const leftCorner = direction === 'down' ? '┌' : '└';
  const rightCorner = direction === 'down' ? '┐' : '┘';

  row[lineStart] = leftCorner;
  row[lineEnd] = rightCorner;
  for (let i = lineStart + 1; i < lineEnd; i++) {
    row[i] = '─';
  }
  // Place T-junctions at each box center (overwrite ─)
  row[mid] = '┼';
  for (const c of centers) {
    if (c !== mid && c !== lineStart && c !== lineEnd) {
      row[c] = upChar;
    }
  }

  return [[seg(row.join(''), { dim: false })]];
}

/** Get a short summary for an agent: report excerpt or instruction preview */
function agentSummary(a: Agent, maxW: number): string {
  // Prefer final report summary
  if (a.reports.length > 0) {
    const last = a.reports[a.reports.length - 1]!;
    const prefix = last.type === 'final' ? '↳ ' : '… ';
    return prefix + truncate(last.summary.split('\n')[0]!, maxW - 2);
  }
  // Fall back to instruction preview
  return truncate(a.instruction.split('\n')[0]!, maxW);
}

/**
 * Compute leftPad so the center box's ┴/┬ aligns with stemCol.
 * For odd counts the middle box aligns exactly; for even counts
 * we fall back to simple centering (no single "middle" box).
 */
function alignedLeftPad(boxWidth: number, count: number, totalWidth: number): number {
  if (count === 0) return 0;
  const stem = stemCol(totalWidth);
  const midIdx = Math.floor((count - 1) / 2);
  const idealPad = stem - midIdx * boxWidth - Math.floor(boxWidth / 2);
  return Math.max(0, idealPad);
}

/** Compute box center positions for a row of `count` boxes */
function boxCenters(boxWidth: number, count: number, totalWidth: number): number[] {
  const leftPad = alignedLeftPad(boxWidth, count, totalWidth);
  const centers: number[] = [];
  for (let i = 0; i < count; i++) {
    centers.push(leftPad + i * boxWidth + Math.floor(boxWidth / 2));
  }
  return centers;
}

/** Build a fan-in line from multiple box-bottom ┬ to a single stem center */
function buildInterRowFanIn(
  prevCenters: number[],
  totalWidth: number,
): DetailLine[] {
  const mid = stemCol(totalWidth);
  if (prevCenters.length <= 1) {
    // Single box — just vertical at the box center (might differ from stem)
    const col = prevCenters[0] ?? mid;
    if (col === mid) return [buildVerticalConnector(totalWidth, false)];
    // Connect box center to stem
    const row = new Array(totalWidth).fill(' ');
    const left = Math.min(col, mid);
    const right = Math.max(col, mid);
    row[left] = '└';
    row[right] = '┘';
    for (let i = left + 1; i < right; i++) row[i] = '─';
    if (col === left) row[col] = '┴';
    if (col === right) row[col] = '┴';
    row[mid] = mid === left || mid === right ? '┼' : '┼';
    // Overwrite corners that are the stem
    return [[seg(row.join(''))], buildVerticalConnector(totalWidth, false)];
  }
  const lineStart = Math.min(prevCenters[0]!, mid);
  const lineEnd = Math.max(prevCenters[prevCenters.length - 1]!, mid);
  const row = new Array(totalWidth).fill(' ');
  row[lineStart] = '└';
  row[lineEnd] = '┘';
  for (let i = lineStart + 1; i < lineEnd; i++) row[i] = '─';
  row[mid] = '┼';
  for (const c of prevCenters) {
    if (c !== lineStart && c !== lineEnd && c !== mid) row[c] = '┴';
    if (c === lineStart && c !== mid) row[c] = '┴';
    if (c === lineEnd && c !== mid) row[c] = '┴';
  }
  return [[seg(row.join(''))], buildVerticalConnector(totalWidth, false)];
}

/** Build agent box rows (4 lines per box, max 3 per row) */
function buildAgentBoxRows(
  agents: Agent[],
  boxWidth: number,
  totalWidth: number,
  bright: boolean,
  maxPerRow: number,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const innerW = boxWidth - 2; // inside left/right border chars

  for (let rowStart = 0; rowStart < agents.length; rowStart += maxPerRow) {
    const rowAgents = agents.slice(rowStart, rowStart + maxPerRow);
    const count = rowAgents.length;
    const leftPad = alignedLeftPad(boxWidth, count, totalWidth);
    const isFirstRow = rowStart === 0;

    // Inter-row connector: fan-in from previous row → stem → fan-out to this row
    if (!isFirstRow) {
      const prevCount = Math.min(agents.length - (rowStart - maxPerRow), maxPerRow);
      const prevCents = boxCenters(boxWidth, prevCount, totalWidth);
      lines.push(...buildInterRowFanIn(prevCents, totalWidth));
      // Fan-out from stem to this row's boxes
      if (count > 1) {
        lines.push(...buildBranchConnector(boxWidth, count, totalWidth, 'down'));
      } else {
        lines.push(buildVerticalConnector(totalWidth, false));
      }
    }

    // Top borders with ┴ connector (first row gets ┴ from branch above, subsequent rows from inter-row fan-out)
    const topSegs: Seg[] = [];
    if (leftPad > 0) topSegs.push(seg(' '.repeat(leftPad)));
    for (let i = 0; i < count; i++) {
      const a = rowAgents[i]!;
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const dim = !bright;

      const mid = Math.floor(innerW / 2);
      topSegs.push(seg('╭' + '─'.repeat(mid) + '┴' + '─'.repeat(innerW - mid - 1) + '╮', { color: borderColor, dim }));
    }
    lines.push(topSegs);

    // Line 1: colored icon + agent id
    const line1Segs: Seg[] = [];
    if (leftPad > 0) line1Segs.push(seg(' '.repeat(leftPad)));
    for (const a of rowAgents) {
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const agentBg = BG_TINTS[isError ? 'red' : resolveColor(a.color)] ?? BG_TINTS.gray;
      const dim = !bright;
      const icon = agentStatusIcon(a.status);
      const iconColor = statusColor(a.status);
      const idPadded = padTo(`  ${a.id}`, innerW - stringWidth(icon));
      line1Segs.push(seg('│', { color: borderColor, dim }));
      line1Segs.push(seg(icon, { bg: agentBg, color: iconColor, bold: bright }));
      line1Segs.push(seg(idPadded, { bg: agentBg, dim, bold: bright && a.status === 'running' }));
      line1Segs.push(seg('│', { color: borderColor, dim }));
    }
    lines.push(line1Segs);

    // Line 2: agent display name
    const line2Segs: Seg[] = [];
    if (leftPad > 0) line2Segs.push(seg(' '.repeat(leftPad)));
    for (const a of rowAgents) {
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const agentBg = BG_TINTS[isError ? 'red' : resolveColor(a.color)] ?? BG_TINTS.gray;
      const dim = !bright;
      const name = padTo(agentDisplayName(a), innerW);
      line2Segs.push(seg('│', { color: borderColor, dim }));
      line2Segs.push(seg(name, { bg: agentBg, dim }));
      line2Segs.push(seg('│', { color: borderColor, dim }));
    }
    lines.push(line2Segs);

    // Line 3: colored duration + status tag for errors
    const line3Segs: Seg[] = [];
    if (leftPad > 0) line3Segs.push(seg(' '.repeat(leftPad)));
    for (const a of rowAgents) {
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const agentBg = BG_TINTS[isError ? 'red' : resolveColor(a.color)] ?? BG_TINTS.gray;
      const dim = !bright;
      const dur = formatDuration(a.activeMs);
      const durClr = isError ? 'red' : (durationColor(a.activeMs) || undefined);
      let durText: string;
      if (isError) {
        const tag = a.status === 'killed' ? '✕ kill' : '✕ crash';
        durText = padTo(`${dur} ${tag}`, innerW);
      } else if (a.status === 'completed') {
        durText = padTo(`${dur} ✓`, innerW);
      } else {
        durText = padTo(dur, innerW);
      }
      line3Segs.push(seg('│', { color: borderColor, dim }));
      line3Segs.push(seg(durText, { bg: agentBg, dim, color: durClr }));
      line3Segs.push(seg('│', { color: borderColor, dim }));
    }
    lines.push(line3Segs);

    // Line 4: instruction preview or report summary (dim)
    const line4Segs: Seg[] = [];
    if (leftPad > 0) line4Segs.push(seg(' '.repeat(leftPad)));
    for (const a of rowAgents) {
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const agentBg = BG_TINTS[isError ? 'red' : resolveColor(a.color)] ?? BG_TINTS.gray;
      const dim = !bright;
      const summary = padTo(agentSummary(a, innerW), innerW);
      line4Segs.push(seg('│', { color: borderColor, dim }));
      line4Segs.push(seg(summary, { bg: agentBg, dim: true }));
      line4Segs.push(seg('│', { color: borderColor, dim }));
    }
    lines.push(line4Segs);

    // Bottom borders with ┬ connector
    const botSegs: Seg[] = [];
    if (leftPad > 0) botSegs.push(seg(' '.repeat(leftPad)));
    for (const a of rowAgents) {
      const isError = a.status === 'killed' || a.status === 'crashed';
      const borderColor = isError ? 'red' : resolveColor(a.color);
      const dim = !bright;
      const mid = Math.floor(innerW / 2);
      const left = mid;
      const right = innerW - mid - 1;
      botSegs.push(seg('╰' + '─'.repeat(left) + '┬' + '─'.repeat(right) + '╯', { color: borderColor, dim }));
    }
    lines.push(botSegs);
  }

  return lines;
}

/** Build fan-in merge connector below agent boxes */
function buildFanInConnector(
  boxWidth: number,
  count: number,
  totalWidth: number,
): DetailLine[] {
  if (count <= 1) {
    // Single agent — just vertical line
    return [buildVerticalConnector(totalWidth, false)];
  }

  const centers = boxCenters(boxWidth, count, totalWidth);
  const lineStart = centers[0]!;
  const lineEnd = centers[centers.length - 1]!;
  const mid = stemCol(totalWidth);

  const row = new Array(totalWidth).fill(' ');
  // Extend horizontal line to include stem if it's outside the box cluster
  const hStart = Math.min(lineStart, mid);
  const hEnd = Math.max(lineEnd, mid);
  row[hStart] = '└';
  row[hEnd] = '┘';
  for (let i = hStart + 1; i < hEnd; i++) {
    row[i] = '─';
  }
  row[mid] = '┼';
  // Box centers become ┴
  for (const c of centers) {
    if (c !== mid && c !== hStart && c !== hEnd) {
      row[c] = '┴';
    }
    // Corner chars that coincide with a box center
    if (c === hStart && c !== mid) row[c] = '┴';
    if (c === hEnd && c !== mid) row[c] = '┴';
  }

  const result: DetailLine[] = [];
  result.push([seg(row.join(''))]);
  // Vertical line down from merge point
  const vRow = new Array(totalWidth).fill(' ');
  vRow[mid] = '│';
  result.push([seg(vRow.join(''))]);

  return result;
}

/** Build yield prompt node (solid when known, dashed when unknown) */
function buildYieldNode(
  prompt: string | undefined,
  width: number,
  bright: boolean,
  known: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const inner = width - 2;
  const bg = BG_TINTS.gray;
  const dim = !bright;

  if (known && prompt) {
    // Solid border, yellow
    lines.push([seg('╭' + '─'.repeat(inner) + '╮', { color: 'yellow', dim })]);
    const wrapped = wrapText(prompt, inner - 2);
    for (const wl of wrapped) {
      const padded = padTo(' ' + wl, inner);
      lines.push([
        seg('│', { color: 'yellow', dim }),
        seg(padded, { bg, dim: true }),
        seg('│', { color: 'yellow', dim }),
      ]);
    }
    lines.push([seg('╰' + '─'.repeat(inner) + '╯', { color: 'yellow', dim })]);
  } else {
    // Dim placeholder with solid borders
    lines.push([seg('╭' + '─'.repeat(inner) + '╮', { dim: true })]);
    const placeholder = padTo(' awaiting agents…', inner);
    lines.push([seg('│', { dim: true }), seg(placeholder, { bg, dim: true }), seg('│', { dim: true })]);
    lines.push([seg('╰' + '─'.repeat(inner) + '╯', { dim: true })]);
  }

  return lines;
}

/** Build the complete node (terminal state) */
function buildCompleteNode(session: Session, width: number): DetailLine[] {
  const inner = width - 2;
  const dur = formatDuration(session.activeMs);
  const totalAgents = session.agents.length;
  const completed = session.agents.filter(a => a.status === 'completed').length;
  const crashed = session.agents.filter(a => a.status === 'crashed' || a.status === 'killed').length;
  const cycles = session.orchestratorCycles.length;

  const leftText = '◉ complete';
  const rightText = `${dur} total`;
  const gap = Math.max(1, inner - 2 - stringWidth(leftText) - stringWidth(rightText));

  // Summary line: "6 cycles · 12 agents (10 ok, 2 failed)"
  let summaryParts = `${cycles} cycle${cycles !== 1 ? 's' : ''} · ${totalAgents} agent${totalAgents !== 1 ? 's' : ''}`;
  if (totalAgents > 0) {
    const parts: string[] = [];
    if (completed > 0) parts.push(`${completed} ok`);
    if (crashed > 0) parts.push(`${crashed} failed`);
    if (parts.length > 0) summaryParts += ` (${parts.join(', ')})`;
  }
  const summaryLine = padTo(' ' + summaryParts, inner);

  return [
    [seg('╭' + '─'.repeat(inner) + '╮', { color: 'cyan', bold: true })],
    [
      seg('│', { color: 'cyan', bold: true }),
      seg(' ' + leftText, { bold: true }),
      seg(' '.repeat(gap)),
      seg(rightText, { dim: true }),
      seg(' ', {}),
      seg('│', { color: 'cyan', bold: true }),
    ],
    [
      seg('│', { color: 'cyan', bold: true }),
      seg(summaryLine, { dim: true }),
      seg('│', { color: 'cyan', bold: true }),
    ],
    [seg('╰' + '─'.repeat(inner) + '╯', { color: 'cyan', bold: true })],
  ];
}

/** Build a dim placeholder orchestrator (next phase) */
function buildDottedOrchestratorPlaceholder(width: number): DetailLine[] {
  const inner = width - 2;
  const placeholder = padTo(' spawning orchestrator…', inner);
  return [
    [seg('╭' + '─'.repeat(inner) + '╮', { dim: true })],
    [seg('│', { dim: true }), seg(placeholder, { bg: BG_TINTS.yellow, dim: true }), seg('│', { dim: true })],
    [seg('╰' + '─'.repeat(inner) + '╯', { dim: true })],
  ];
}

/** Build a dim placeholder agent box row */
function buildDottedAgentPlaceholder(width: number): DetailLine[] {
  const inner = width - 2;
  const placeholder = padTo(' awaiting orchestrator…', inner);
  return [
    [seg('╭' + '─'.repeat(inner) + '╮', { dim: true })],
    [seg('│', { dim: true }), seg(placeholder, { bg: BG_TINTS.blue, dim: true }), seg('│', { dim: true })],
    [seg('╰' + '─'.repeat(inner) + '╯', { dim: true })],
  ];
}

// ---------------------------------------------------------------------------
// Render a single cycle's flow (orchestrator → agents → yield)
// ---------------------------------------------------------------------------

function renderCycleFlow(
  session: Session,
  cycle: OrchestratorCycle,
  prevCycle: OrchestratorCycle | undefined,
  width: number,
  phase: Phase,
  isCurrentCycle: boolean,
  isPrevCycle: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const cycleAgents = session.agents.filter(a => cycle.agentsSpawned.includes(a.id));
  const maxPerRow = 3;
  const boxWidth = Math.max(12, Math.floor((width - 4) / maxPerRow));
  const firstRowCount = Math.min(cycleAgents.length, maxPerRow);
  const lastRowCount = cycleAgents.length > 0 ? ((cycleAgents.length - 1) % maxPerRow) + 1 : 0;

  // Determine brightness for each section
  let orchBright = false;
  let agentsBright = false;
  let yieldBright = false;

  if (isCurrentCycle) {
    if (phase === 'orchestrator') orchBright = true;
    else if (phase === 'agents') agentsBright = true;
    else if (phase === 'between') yieldBright = true;
  }
  // Previous cycle: everything dim (default false is fine)

  const showAgents = cycleAgents.length > 0;
  const hasConnectorFromOrch = showAgents;

  // Orchestrator node
  lines.push(...buildOrchestratorNode(cycle, cycleAgents, width, orchBright, hasConnectorFromOrch));

  if (showAgents) {
    // Vertical connector
    lines.push(buildVerticalConnector(width, !agentsBright));

    // Fan-out branch
    if (firstRowCount > 1) {
      lines.push(...buildBranchConnector(boxWidth, firstRowCount, width, 'down'));
    }

    // Agent boxes
    lines.push(...buildAgentBoxRows(cycleAgents, boxWidth, width, agentsBright, maxPerRow));

    // Fan-in merge (from last row's boxes)
    lines.push(...buildFanInConnector(boxWidth, lastRowCount, width));
  } else if (hasConnectorFromOrch) {
    lines.push(buildVerticalConnector(width, true));
  }

  // Yield prompt
  const yieldKnown = !!cycle.nextPrompt;
  if (yieldKnown || isCurrentCycle) {
    lines.push(...buildYieldNode(
      cycle.nextPrompt,
      width,
      yieldBright,
      yieldKnown,
    ));
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildCycleFlowLines(
  session: Session,
  width: number,
  expanded: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [];
  const cycles = session.orchestratorCycles;
  const phase = getCurrentPhase(session);
  const maxPerRow = 3;
  const boxWidth = Math.max(12, Math.floor((width - 4) / maxPerRow));
  const firstRowAgentCount = (c: OrchestratorCycle) => {
    const agents = session.agents.filter(a => c.agentsSpawned.includes(a.id));
    return Math.min(agents.length, maxPerRow);
  };
  const lastRowAgentCount = (c: OrchestratorCycle) => {
    const count = session.agents.filter(a => c.agentsSpawned.includes(a.id)).length;
    return count > 0 ? ((count - 1) % maxPerRow) + 1 : 0;
  };

  // Header
  lines.push([
    seg('  ▎ ◈ CYCLE FLOW', { color: 'blue', bold: true }),
    seg(expanded ? '  [F] collapse' : '  [F] full', { dim: true }),
  ]);
  lines.push(singleLine(' '));

  if (cycles.length === 0) {
    // First cycle, orchestrator hasn't started yet
    lines.push(singleLine('    waiting for orchestrator…', { dim: true, italic: true }));
    return lines;
  }

  if (expanded) {
    // Show all cycles, older ones dimmer
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i]!;
      const prevCycle = i > 0 ? cycles[i - 1] : undefined;
      const isLast = i === cycles.length - 1;

      const cycleLines = renderCycleFlow(
        session, cycle, prevCycle, width, phase, isLast, !isLast,
      );

      // Apply extra dim to older cycles
      if (!isLast) {
        for (const line of cycleLines) {
          for (const s of line) {
            s.dim = true;
          }
        }
      }

      lines.push(...cycleLines);

      if (!isLast) {
        lines.push(singleLine(' '));
      }
    }
  } else {
    // 3-phase sliding window
    const currentCycle = cycles[cycles.length - 1]!;
    const prevCycle = cycles.length >= 2 ? cycles[cycles.length - 2] : undefined;
    const currentAgents = session.agents.filter(a => currentCycle.agentsSpawned.includes(a.id));

    // Previous phase (dim)
    if (phase === 'agents' && currentCycle) {
      // Previous = orchestrator (dim)
      lines.push(...buildOrchestratorNode(currentCycle, currentAgents, width, false, true));
      lines.push(buildVerticalConnector(width, true));
      if (firstRowAgentCount(currentCycle) > 1) {
        const dimBranch = buildBranchConnector(boxWidth, firstRowAgentCount(currentCycle), width, 'down');
        for (const line of dimBranch) {
          for (const s of line) s.dim = true;
        }
        lines.push(...dimBranch);
      }
    } else if (phase === 'orchestrator' && prevCycle) {
      // Previous = yield prompt from prev cycle (dim)
      if (prevCycle.nextPrompt) {
        lines.push(...buildYieldNode(prevCycle.nextPrompt, width, false, true));
        lines.push(singleLine(' '));
      }
    } else if (phase === 'between') {
      // Previous = agent boxes (slightly dim)
      if (currentAgents.length > 0) {
        lines.push(...buildAgentBoxRows(currentAgents, boxWidth, width, false, maxPerRow));
        lines.push(...buildFanInConnector(boxWidth, lastRowAgentCount(currentCycle), width));
      }
    }

    // Current phase (bright)
    if (phase === 'orchestrator') {
      lines.push(...buildOrchestratorNode(currentCycle, currentAgents, width, true, false));
    } else if (phase === 'agents') {
      // Agent boxes bright
      lines.push(...buildAgentBoxRows(currentAgents, boxWidth, width, true, maxPerRow));
      lines.push(...buildFanInConnector(boxWidth, lastRowAgentCount(currentCycle), width));
    } else if (phase === 'between') {
      // Yield prompt bright
      lines.push(...buildYieldNode(currentCycle.nextPrompt, width, true, true));
    } else if (phase === 'complete') {
      // Previous = last agents dim
      if (currentAgents.length > 0) {
        lines.push(...buildAgentBoxRows(currentAgents, boxWidth, width, false, maxPerRow));
        lines.push(...buildFanInConnector(boxWidth, lastRowAgentCount(currentCycle), width));
      }
      // Complete node bright
      lines.push(...buildCompleteNode(session, width));
    }

    // Next phase (dotted/planned)
    if (phase === 'agents') {
      lines.push(...buildYieldNode(undefined, width, false, false));
    } else if (phase === 'orchestrator') {
      lines.push(singleLine(' '));
      lines.push(...buildDottedAgentPlaceholder(width));
    } else if (phase === 'between') {
      lines.push(singleLine(' '));
      lines.push(...buildDottedOrchestratorPlaceholder(width));
    }
    // 'complete' has no next phase
  }

  return lines;
}
