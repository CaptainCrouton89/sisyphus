import { writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import stringWidth from 'string-width';
import type { Key } from './terminal.js';
import { setupTerminal, startKeypressListener, onResize, writeToStdout } from './terminal.js';
import type {
  RequirementsData, ReviewState, Phase, Requirement, RequirementsGroup,
  OpenQuestion, EarsKeyword, InputMode,
} from './review-types.js';
import {
  resolveEarsKeyword, getEarsCondition, pendingRequirements,
  totalRequirements, totalReviewed, EARS_KEYWORDS,
} from './review-types.js';

// ─── ANSI Helpers ────────────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const FG_RED = `${ESC}31m`;
const FG_GREEN = `${ESC}32m`;
const FG_YELLOW = `${ESC}33m`;
const FG_BLUE = `${ESC}34m`;
const FG_MAGENTA = `${ESC}35m`;
const FG_CYAN = `${ESC}36m`;
const FG_WHITE = `${ESC}37m`;
const FG_GRAY = `${ESC}90m`;
const BG_BLUE_TINT = `${ESC}48;2;25;35;55m`;
const BG_GREEN_TINT = `${ESC}48;2;25;50;35m`;
const BG_YELLOW_TINT = `${ESC}48;2;55;50;25m`;
const BG_DARK = `${ESC}48;2;30;30;35m`;
const BG_CARD = `${ESC}48;2;35;35;42m`;
const BG_SELECTED = `${ESC}48;2;45;45;55m`;

const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const ALT_SCREEN = `${ESC}?1049h`;
const MAIN_SCREEN = `${ESC}?1049l`;
const CLEAR = `${ESC}2J`;
const HOME = `${ESC}H`;

// ─── Icons ───────────────────────────────────────────────────────────────────

const ICON = {
  approved: '✓',
  comment: '◆',
  pending: '○',
  bullet: '▸',
  section: '●',
  sectionDone: '●',
  sectionPending: '○',
  arrow: '▼',
  warning: '⚠',
  expand: '▸',
  collapse: '▾',
  bar: '█',
  barEmpty: '░',
} as const;

// ─── EARS Keyword Colors ─────────────────────────────────────────────────────

const EARS_COLORS: Record<EarsKeyword, { fg: string; bg: string; label: string }> = {
  when: { fg: FG_CYAN, bg: BG_BLUE_TINT, label: 'WHEN' },
  while: { fg: FG_MAGENTA, bg: BG_BLUE_TINT, label: 'WHILE' },
  if: { fg: FG_RED, bg: BG_YELLOW_TINT, label: 'IF' },
  where: { fg: FG_BLUE, bg: BG_BLUE_TINT, label: 'WHERE' },
};

// ─── Layout Constants ────────────────────────────────────────────────────────

const MAX_CONTENT_WIDTH = 72;
const MIN_CONTENT_WIDTH = 50;

// ─── Text Utilities ──────────────────────────────────────────────────────────

function visWidth(s: string): number {
  return stringWidth(s.replace(/\x1b\[[0-9;]*m/g, ''));
}

function pad(n: number): string {
  return n > 0 ? ' '.repeat(n) : '';
}

function centerPad(text: string, width: number): string {
  const w = visWidth(text);
  const left = Math.max(0, Math.floor((width - w) / 2));
  return pad(left) + text;
}

/** Word-wrap plain text to a max width, returning lines */
function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    let line = '';
    for (const word of rawLine.split(/(\s+)/)) {
      if (line.length + word.length > width && line.length > 0) {
        result.push(line);
        line = word.trimStart();
      } else {
        line += word;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

/** Draw a box around text lines */
function boxLines(lines: string[], width: number, borderColor: string = FG_GRAY): string[] {
  const inner = width - 4; // 2 border + 2 padding
  const result: string[] = [];
  result.push(`${borderColor}┌${'─'.repeat(width - 2)}┐${RESET}`);
  for (const line of lines) {
    const wrapped = wrapText(line, inner);
    for (const wl of wrapped) {
      const pw = visWidth(wl);
      result.push(`${borderColor}│${RESET} ${wl}${pad(inner - pw)} ${borderColor}│${RESET}`);
    }
  }
  result.push(`${borderColor}└${'─'.repeat(width - 2)}┘${RESET}`);
  return result;
}

/** Horizontal rule */
function hr(width: number, color: string = FG_GRAY): string {
  return `${color}${'─'.repeat(width)}${RESET}`;
}

/** Progress bar: [████░░░░] 3/8 */
function progressBar(done: number, total: number, width: number): string {
  const barW = Math.max(8, width - 8);
  const filled = total > 0 ? Math.round((done / total) * barW) : 0;
  const bar = `${FG_GREEN}${ICON.bar.repeat(filled)}${FG_GRAY}${ICON.barEmpty.repeat(barW - filled)}${RESET}`;
  return `${bar} ${FG_WHITE}${done}/${total}${RESET}`;
}

/** Section dots: ● ● ○ ○ */
function sectionDots(current: number, total: number): string {
  let s = '';
  for (let i = 0; i < total; i++) {
    if (i > 0) s += ' ';
    if (i < current) s += `${FG_GREEN}${ICON.sectionDone}${RESET}`;
    else if (i === current) s += `${FG_CYAN}${ICON.section}${RESET}`;
    else s += `${FG_GRAY}${ICON.sectionPending}${RESET}`;
  }
  return s;
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function saveData(state: ReviewState): void {
  state.data.meta.lastModified = new Date().toISOString();
  const json = JSON.stringify(state.data, null, 2);
  const tmpFile = state.filePath + '.tmp';
  writeFileSync(tmpFile, json, 'utf-8');
  renameSync(tmpFile, state.filePath);
  state.dirty = false;
}

function buildReviewFeedback(state: ReviewState): string {
  const { data } = state;
  const lines: string[] = [];

  lines.push(`# Review Feedback — ${data.meta.title} (draft ${data.meta.draft})`);
  lines.push('');

  for (const g of data.groups) {
    lines.push(`## ${g.name}`);
    lines.push('');

    for (const r of g.requirements) {
      if (!r.reviewAction && r.status !== 'approved') continue;
      const action = r.reviewAction === 'approve' ? '✓ approved'
        : r.reviewAction === 'comment' ? '◆ commented'
        : r.status === 'approved' ? '✓ previously approved'
        : '—';
      lines.push(`- **${r.id}** ${r.title} — ${action}`);
      if (r.userComment) {
        lines.push(`  > ${r.userComment}`);
      }
    }

    const skipped = g.requirements.filter(r => !r.reviewAction && r.status !== 'approved');
    for (const r of skipped) {
      lines.push(`- **${r.id}** ${r.title} — skipped (no action taken)`);
    }

    if (g.openQuestions) {
      for (const q of g.openQuestions) {
        if (q.response) {
          lines.push(`- **Q:** ${q.question}`);
          lines.push(`  **A:** ${q.response}`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ─── Render Engine ───────────────────────────────────────────────────────────

let prevFrame: string[] = [];

function flush(lines: string[]): void {
  // Synchronized output to prevent tearing
  let out = '\x1b[?2026h';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== prevFrame[i]) {
      out += `${ESC}${i + 1};1H${ESC}2K${lines[i]}`;
    }
  }
  // Clear any leftover lines from previous frame
  for (let i = lines.length; i < prevFrame.length; i++) {
    out += `${ESC}${i + 1};1H${ESC}2K`;
  }
  out += '\x1b[?2026l';
  writeToStdout(out);
  prevFrame = [...lines];
}

// ─── Phase Renderers ─────────────────────────────────────────────────────────

function renderOverview(state: ReviewState): string[] {
  const { data, cols } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  // Title
  lines.push('');
  lines.push(centerPad(`${BOLD}${FG_WHITE}${data.meta.title}${RESET}`, cols));
  if (data.meta.subtitle) {
    lines.push(centerPad(`${DIM}${data.meta.subtitle}${RESET}`, cols));
  }
  lines.push('');

  // Summary
  if (data.meta.summary) {
    const wrapped = wrapText(data.meta.summary, cw - 4);
    for (const line of wrapped) {
      lines.push(`${m}  ${FG_WHITE}${line}${RESET}`);
    }
    lines.push('');
  }

  // Divider
  lines.push(`${m}${hr(cw)}`);
  lines.push('');

  // Groups
  const totalR = totalRequirements(data);

  for (let i = 0; i < data.groups.length; i++) {
    const g = data.groups[i]!;
    const pending = pendingRequirements(g);
    const approved = g.requirements.length - pending.length;
    const statusIcon = pending.length === 0
      ? `${FG_GREEN}${ICON.approved}${RESET}`
      : `${FG_GRAY}${ICON.pending}${RESET}`;

    lines.push(`${m}  ${statusIcon} ${BOLD}${FG_WHITE}${g.name}${RESET}`);

    // First line of context or description
    const desc = g.context || g.description || '';
    const firstLine = desc.split('\n')[0] || '';
    if (firstLine) {
      const truncated = firstLine.length > cw - 8 ? firstLine.slice(0, cw - 11) + '...' : firstLine;
      lines.push(`${m}    ${DIM}${truncated}${RESET}`);
    }

    // Stats
    const statsText = pending.length === 0
      ? `${FG_GREEN}all ${g.requirements.length} approved${RESET}`
      : `${pending.length} to review${approved > 0 ? `, ${approved} approved` : ''}`;
    lines.push(`${m}    ${FG_GRAY}${g.requirements.length} requirements${RESET} ${DIM}·${RESET} ${statsText}`);

    if (g.openQuestions && g.openQuestions.length > 0) {
      const unanswered = g.openQuestions.filter(q => !q.response).length;
      if (unanswered > 0) {
        lines.push(`${m}    ${FG_YELLOW}${unanswered} open question${unanswered !== 1 ? 's' : ''}${RESET}`);
      }
    }
    lines.push('');
  }

  // Overall progress
  lines.push(`${m}${hr(cw)}`);
  lines.push('');
  const reviewed = totalReviewed(data);
  lines.push(`${m}  ${progressBar(reviewed, totalR, cw - 4)}`);
  lines.push('');

  return lines;
}

function renderGroupIntro(state: ReviewState, groupIndex: number): string[] {
  const { data, cols } = state;
  const group = data.groups[groupIndex]!;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  // Section progress
  lines.push('');
  lines.push(`${m}  ${sectionDots(groupIndex, data.groups.length)} ${DIM}Section ${groupIndex + 1} of ${data.groups.length}${RESET}`);
  lines.push('');

  // Group name
  lines.push(`${m}  ${BOLD}${FG_CYAN}${group.name}${RESET}`);
  lines.push(`${m}  ${hr(cw - 4)}`);
  lines.push('');

  // Context (rich text with potential diagrams)
  const context = group.context || group.description || '';
  if (context) {
    const contextLines = context.split('\n');
    for (const cl of contextLines) {
      if (cl.trim() === '') {
        lines.push('');
      } else {
        // Detect diagram lines (contain box drawing or multiple spaces)
        const isDiagram = /[─│┌┐└┘├┤┬┴┼╭╮╯╰▸▹►▲▼◄═║╔╗╚╝]/.test(cl) ||
                          /^\s{4,}\S/.test(cl) ||
                          /[│|+\-]{2,}/.test(cl);
        if (isDiagram) {
          lines.push(`${m}  ${FG_CYAN}${cl}${RESET}`);
        } else {
          const wrapped = wrapText(cl, cw - 4);
          for (const wl of wrapped) {
            lines.push(`${m}  ${FG_WHITE}${wl}${RESET}`);
          }
        }
      }
    }
    lines.push('');
  }

  // Items preview
  const pending = pendingRequirements(group);
  lines.push(`${m}  ${FG_GRAY}${pending.length} requirement${pending.length !== 1 ? 's' : ''} to review${RESET}`);
  if (group.openQuestions && group.openQuestions.length > 0) {
    const unanswered = group.openQuestions.filter(q => !q.response).length;
    if (unanswered > 0) {
      lines.push(`${m}  ${FG_YELLOW}${unanswered} open question${unanswered !== 1 ? 's' : ''} to answer${RESET}`);
    }
  }
  lines.push('');

  return lines;
}

function renderItemReview(state: ReviewState, groupIndex: number, reqIndex: number, expanded: boolean, selectedAction: number): string[] {
  const { data, cols } = state;
  const group = data.groups[groupIndex]!;
  const pending = pendingRequirements(group);
  const req = pending[reqIndex];
  if (!req) return ['  No items to review.'];

  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const boxW = cw - 4;
  const lines: string[] = [];

  // Header: section + item progress
  lines.push('');
  lines.push(`${m}  ${sectionDots(groupIndex, data.groups.length)} ${DIM}${group.name}${RESET}`);
  lines.push(`${m}  ${FG_GRAY}Item ${reqIndex + 1} of ${pending.length}${RESET}  ${progressBar(reqIndex, pending.length, 20)}`);
  lines.push('');

  // Requirement title
  const statusBadge = req.status === 'draft' ? `${FG_GRAY}draft${RESET}`
    : req.status === 'question' ? `${FG_YELLOW}question${RESET}`
    : req.status === 'deferred' ? `${FG_MAGENTA}deferred${RESET}`
    : `${FG_GRAY}${req.status}${RESET}`;
  lines.push(`${m}  ${BOLD}${FG_WHITE}${req.id}${RESET}  ${req.title}  ${DIM}[${statusBadge}${DIM}]${RESET}`);
  lines.push('');

  // EARS blocks
  const keyword = resolveEarsKeyword(req.ears);
  if (keyword) {
    const condition = getEarsCondition(req.ears);
    const earsStyle = EARS_COLORS[keyword];

    // Condition block
    const condWrapped = wrapText(condition, boxW - 4);
    lines.push(`${m}  ${earsStyle.bg}${earsStyle.fg}${BOLD} ${earsStyle.label} ${'─'.repeat(Math.max(0, boxW - earsStyle.label.length - 3))}${RESET}`);
    for (const cl of condWrapped) {
      lines.push(`${m}  ${earsStyle.bg} ${FG_WHITE}${cl}${pad(boxW - visWidth(cl) - 2)} ${RESET}`);
    }
    lines.push(`${m}  ${earsStyle.bg}${' '.repeat(boxW)}${RESET}`);
    lines.push('');

    // Connector
    lines.push(centerPad(`${FG_GRAY}${ICON.arrow}${RESET}`, cols));
    lines.push('');

    // Behavior block (SHALL)
    const shallWrapped = wrapText(req.ears.shall, boxW - 4);
    lines.push(`${m}  ${BG_GREEN_TINT}${FG_GREEN}${BOLD} SHALL ${'─'.repeat(Math.max(0, boxW - 8))}${RESET}`);
    for (const sl of shallWrapped) {
      lines.push(`${m}  ${BG_GREEN_TINT} ${FG_WHITE}${sl}${pad(boxW - visWidth(sl) - 2)} ${RESET}`);
    }
    lines.push(`${m}  ${BG_GREEN_TINT}${' '.repeat(boxW)}${RESET}`);
    lines.push('');
  }

  // Agent notes (yellow)
  if (req.agentNotes) {
    const noteLines = req.agentNotes.split('\n');
    const allWrapped: string[] = [];
    for (const nl of noteLines) {
      allWrapped.push(...wrapText(nl, cw - 8));
    }
    if (allWrapped.length > 0) {
      lines.push(`${m}  ${FG_YELLOW}${ICON.warning}  ${ITALIC}${allWrapped[0]}${RESET}`);
      for (let i = 1; i < allWrapped.length; i++) {
        lines.push(`${m}     ${FG_YELLOW}${ITALIC}${allWrapped[i]}${RESET}`);
      }
    }
    lines.push('');
  }

  // Acceptance criteria (expandable)
  if (req.criteria && req.criteria.length > 0) {
    if (expanded) {
      lines.push(`${m}  ${FG_GRAY}${ICON.collapse} Acceptance criteria${RESET}`);
      for (const c of req.criteria) {
        const check = c.checked ? `${FG_GREEN}✓${RESET}` : `${FG_GRAY}○${RESET}`;
        const wrapped = wrapText(c.text, cw - 10);
        lines.push(`${m}    ${check} ${wrapped[0]}${RESET}`);
        for (let i = 1; i < wrapped.length; i++) {
          lines.push(`${m}      ${wrapped[i]}`);
        }
      }
    } else {
      lines.push(`${m}  ${FG_GRAY}${ICON.expand} Acceptance criteria (${req.criteria.length})${RESET}  ${DIM}[space]${RESET}`);
    }
    lines.push('');
  }

  // Per-item questions (if any)
  if (req.questions && req.questions.length > 0) {
    const unanswered = req.questions.filter(q => !q.response);
    if (unanswered.length > 0) {
      lines.push(`${m}  ${FG_YELLOW}${unanswered.length} question${unanswered.length !== 1 ? 's' : ''} from agent${RESET}`);
      lines.push('');
    }
  }

  // Existing user comment
  if (req.userComment) {
    const commentWrapped = wrapText(req.userComment, cw - 8);
    lines.push(`${m}  ${FG_CYAN}${ICON.comment}  Your comment:${RESET}`);
    for (const cl of commentWrapped) {
      lines.push(`${m}     ${FG_WHITE}${cl}${RESET}`);
    }
    lines.push('');
  }

  // Review status if already acted on
  if (req.reviewAction) {
    const actionLabel = req.reviewAction === 'approve'
      ? `${FG_GREEN}${ICON.approved} Approved${RESET}`
      : `${FG_YELLOW}${ICON.comment} Commented${RESET}`;
    lines.push(`${m}  ${actionLabel}  ${DIM}(2/3 to change)${RESET}`);
    lines.push('');
  }

  // Action bar
  lines.push(`${m}  ${hr(boxW)}`);
  lines.push('');
  const actions = [
    { label: `${ICON.approved} Approve & next`, color: FG_GREEN },
    { label: `${ICON.approved}+ Approve with comment`, color: FG_CYAN },
    { label: `${ICON.comment} Comment`, color: FG_YELLOW },
  ];
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i]!;
    const isSelected = i === selectedAction;
    const bullet = isSelected ? `${FG_CYAN}${ICON.bullet}${RESET}` : ` `;
    const numColor = isSelected ? `${FG_CYAN}${BOLD}` : FG_GRAY;
    const titleColor = isSelected ? `${FG_CYAN}${BOLD}` : act.color;
    lines.push(`${m}  ${bullet} ${numColor}${i + 1}${RESET}  ${titleColor}${act.label}${RESET}`);
  }
  lines.push('');

  return lines;
}

function renderGroupQuestions(state: ReviewState, groupIndex: number, questionIndex: number, selectedOption: number): string[] {
  const { data, cols } = state;
  const group = data.groups[groupIndex]!;
  const questions = (group.openQuestions || []).filter(q => !q.response);
  const q = questions[questionIndex];
  if (!q) return ['  No questions remaining.'];

  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${m}  ${sectionDots(groupIndex, data.groups.length)} ${DIM}${group.name} · Questions${RESET}`);
  lines.push(`${m}  ${FG_GRAY}Question ${questionIndex + 1} of ${questions.length}${RESET}`);
  lines.push('');

  // Question text
  const qWrapped = wrapText(q.question, cw - 4);
  for (const ql of qWrapped) {
    lines.push(`${m}  ${BOLD}${FG_WHITE}${ql}${RESET}`);
  }
  lines.push('');

  // Options
  lines.push(`${m}  ${hr(cw - 4)}`);
  lines.push('');

  const optionCount = q.options.length;
  for (let i = 0; i < optionCount; i++) {
    const opt = q.options[i]!;
    const isSelected = i === selectedOption;
    const bullet = isSelected ? `${FG_CYAN}${ICON.bullet}${RESET}` : ` `;
    const numColor = isSelected ? `${FG_CYAN}${BOLD}` : FG_GRAY;
    const titleColor = isSelected ? `${FG_CYAN}${BOLD}` : FG_WHITE;

    lines.push(`${m}  ${bullet} ${numColor}${i + 1}${RESET}  ${titleColor}${opt.title}${RESET}`);
    if (opt.description) {
      const descWrapped = wrapText(opt.description, cw - 12);
      for (const dl of descWrapped) {
        lines.push(`${m}        ${DIM}${dl}${RESET}`);
      }
    }
    lines.push('');
  }

  // Custom answer option
  const customIdx = optionCount;
  const isCustomSelected = selectedOption === customIdx;
  const customBullet = isCustomSelected ? `${FG_CYAN}${ICON.bullet}${RESET}` : ` `;
  const customNumColor = isCustomSelected ? `${FG_CYAN}${BOLD}` : FG_GRAY;
  const customTitleColor = isCustomSelected ? `${FG_CYAN}${BOLD}` : FG_YELLOW;
  lines.push(`${m}  ${customBullet} ${customNumColor}${customIdx + 1}${RESET}  ${customTitleColor}Type a custom answer...${RESET}`);
  lines.push('');

  // Instructions
  lines.push(`${m}  ${DIM}j/k or 1-${customIdx + 1} to select · enter to confirm${RESET}`);
  lines.push('');

  return lines;
}

function renderFinal(state: ReviewState): string[] {
  const { data, cols } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  const totalR = totalRequirements(data);
  const reviewed = totalReviewed(data);

  let totalComments = 0;
  let totalApproved = 0;
  let totalAnswered = 0;
  let totalQuestionsAll = 0;

  for (const g of data.groups) {
    for (const r of g.requirements) {
      if (r.reviewAction === 'approve') totalApproved++;
      if (r.userComment) totalComments++;
    }
    if (g.openQuestions) {
      totalQuestionsAll += g.openQuestions.length;
      totalAnswered += g.openQuestions.filter(q => q.response).length;
    }
  }

  lines.push('');
  lines.push(centerPad(`${BOLD}${FG_WHITE}Review Complete${RESET}`, cols));
  lines.push('');

  const statLines = [
    `${reviewed}/${totalR} requirements reviewed`,
    `${data.groups.length} sections completed`,
    '',
    `${totalApproved} approved · ${totalComments} with comments`,
  ];
  if (totalQuestionsAll > 0) {
    statLines.push(`${totalAnswered}/${totalQuestionsAll} questions answered`);
  }

  const boxed = boxLines(statLines, cw - 8, FG_GREEN);
  for (const bl of boxed) {
    lines.push(`${m}    ${bl}`);
  }
  lines.push('');

  lines.push(centerPad(`${FG_GREEN}${BOLD}Press enter to save and exit${RESET}`, cols));
  lines.push(centerPad(`${DIM}Press q to exit without saving${RESET}`, cols));
  lines.push('');

  return lines;
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function renderFooter(state: ReviewState): string[] {
  const { phase, cols, data } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  // Progress summary
  const totalR = totalRequirements(data);
  lines.push(`${m}${hr(cw)}`);

  // Keybind hints based on phase
  let hints = '';
  switch (phase.kind) {
    case 'overview':
      hints = `${DIM}n${RESET} next  ${DIM}q${RESET} quit`;
      break;
    case 'group-intro':
      hints = `${DIM}n${RESET} start review  ${DIM}p${RESET} back  ${DIM}q${RESET} quit`;
      break;
    case 'item-review':
      hints = `${DIM}j/k${RESET} select  ${DIM}enter${RESET} confirm  ${DIM}space${RESET} expand  ${DIM}q${RESET} quit`;
      break;
    case 'group-questions':
      hints = `${DIM}j/k${RESET} select  ${DIM}enter${RESET} confirm  ${DIM}q${RESET} quit`;
      break;
    case 'final':
      hints = `${DIM}enter${RESET} save & exit  ${DIM}q${RESET} exit`;
      break;
  }

  const progressText = `${FG_GRAY}${totalReviewed(data)}/${totalR} reviewed${RESET}`;

  // Input mode: show wrapped text input area
  if (state.inputMode) {
    const label = state.inputMode.kind === 'comment' ? 'Comment' : 'Answer';
    const inputW = cw - 6; // margin inside the input area
    const textWithCursor = state.inputBuffer + '█';
    const wrapped = wrapText(textWithCursor, inputW);

    lines.push(`${m}  ${FG_CYAN}${label}:${RESET}`);
    for (const wl of wrapped) {
      lines.push(`${m}    ${FG_WHITE}${wl}${RESET}`);
    }
    lines.push(`${m}  ${DIM}enter${RESET} submit  ${DIM}esc${RESET} cancel  ${progressText}`);
  } else {
    lines.push(`${m}  ${hints}  ${progressText}`);
  }

  return lines;
}

// ─── Main Render ─────────────────────────────────────────────────────────────

function render(state: ReviewState): void {
  const { phase, rows } = state;
  let content: string[] = [];

  switch (phase.kind) {
    case 'overview':
      content = renderOverview(state);
      break;
    case 'group-intro':
      content = renderGroupIntro(state, phase.groupIndex);
      break;
    case 'item-review':
      content = renderItemReview(state, phase.groupIndex, phase.reqIndex, phase.expanded, phase.selectedAction);
      break;
    case 'group-questions':
      content = renderGroupQuestions(state, phase.groupIndex, phase.questionIndex, phase.selectedOption);
      break;
    case 'final':
      content = renderFinal(state);
      break;
  }

  const footer = renderFooter(state);

  // Fit content to screen height, apply scroll
  const footerH = footer.length;
  const availH = rows - footerH;
  const maxScroll = Math.max(0, content.length - availH);
  if (state.scroll > maxScroll) state.scroll = maxScroll;
  if (state.scroll < 0) state.scroll = 0;

  const visible = content.slice(state.scroll, state.scroll + availH);

  // Pad to fill screen
  const frame: string[] = [];
  for (let i = 0; i < availH; i++) {
    frame.push(visible[i] || '');
  }
  for (const fl of footer) {
    frame.push(fl);
  }

  flush(frame);
}

// ─── Navigation Logic ────────────────────────────────────────────────────────

function advanceToNextGroup(state: ReviewState, currentGroupIndex: number): void {
  const nextG = currentGroupIndex + 1;
  if (nextG < state.data.groups.length) {
    state.phase = { kind: 'group-intro', groupIndex: nextG };
  } else {
    state.phase = { kind: 'final' };
  }
  state.scroll = 0;
}

function startGroupReview(state: ReviewState, groupIndex: number): void {
  const group = state.data.groups[groupIndex]!;
  const pending = pendingRequirements(group);
  if (pending.length > 0) {
    state.phase = { kind: 'item-review', groupIndex, reqIndex: 0, expanded: false, selectedAction: 0 };
  } else {
    // No pending items, go to questions or next group
    startGroupQuestions(state, groupIndex);
  }
  state.scroll = 0;
}

function advanceItem(state: ReviewState, groupIndex: number, reqIndex: number): void {
  const group = state.data.groups[groupIndex]!;
  const pending = pendingRequirements(group);
  if (reqIndex + 1 < pending.length) {
    state.phase = { kind: 'item-review', groupIndex, reqIndex: reqIndex + 1, expanded: false, selectedAction: 0 };
  } else {
    startGroupQuestions(state, groupIndex);
  }
  state.scroll = 0;
}

function startGroupQuestions(state: ReviewState, groupIndex: number): void {
  const group = state.data.groups[groupIndex]!;
  const unanswered = (group.openQuestions || []).filter(q => !q.response);
  if (unanswered.length > 0) {
    state.phase = { kind: 'group-questions', groupIndex, questionIndex: 0, selectedOption: 0 };
  } else {
    advanceToNextGroup(state, groupIndex);
  }
  state.scroll = 0;
}

// ─── Input Handler ───────────────────────────────────────────────────────────

function handleInput(state: ReviewState, input: string, key: Key): boolean {
  const { phase } = state;

  // ── Inline input mode ──
  if (state.inputMode) {
    if (key.escape) {
      // Cancel input
      state.inputMode = null;
      state.inputBuffer = '';
      return false;
    }
    if (key.return) {
      const text = state.inputBuffer.trim();
      if (state.inputMode.kind === 'comment' && phase.kind === 'item-review') {
        const group = state.data.groups[phase.groupIndex]!;
        const pending = pendingRequirements(group);
        const req = pending[phase.reqIndex];
        if (req) {
          req.reviewAction = state.inputMode.action;
          if (text) req.userComment = text;
          state.dirty = true;
          saveData(state);
          advanceItem(state, phase.groupIndex, phase.reqIndex);
        }
      } else if (state.inputMode.kind === 'custom-answer' && phase.kind === 'group-questions') {
        const group = state.data.groups[phase.groupIndex]!;
        const unanswered = (group.openQuestions || []).filter(q => !q.response);
        const q = unanswered[phase.questionIndex];
        if (q && text) {
          q.response = text;
          state.dirty = true;
          saveData(state);
          if (phase.questionIndex + 1 < unanswered.length) {
            state.phase = { kind: 'group-questions', groupIndex: phase.groupIndex, questionIndex: phase.questionIndex + 1, selectedOption: 0 };
          } else {
            advanceToNextGroup(state, phase.groupIndex);
          }
        }
      }
      state.inputMode = null;
      state.inputBuffer = '';
      state.scroll = 0;
      return false;
    }
    if (key.backspace) {
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      return false;
    }
    // Printable characters
    if (input.length === 1 && !key.ctrl && !key.meta) {
      state.inputBuffer += input;
    }
    return false;
  }

  // Global: quit
  if (input === 'q' && !key.ctrl) {
    return true; // signal exit
  }
  if (key.ctrl && input === 'c') {
    return true;
  }

  // Scroll
  if ((key.downArrow && phase.kind !== 'group-questions' && phase.kind !== 'item-review') || (input === 'j' && phase.kind !== 'group-questions' && phase.kind !== 'item-review')) {
    state.scroll++;
    return false;
  }
  if ((key.upArrow && phase.kind !== 'group-questions' && phase.kind !== 'item-review') || (input === 'k' && phase.kind !== 'group-questions' && phase.kind !== 'item-review')) {
    state.scroll = Math.max(0, state.scroll - 1);
    return false;
  }
  if (key.pageDown) {
    state.scroll += Math.floor(state.rows / 2);
    return false;
  }
  if (key.pageUp) {
    state.scroll = Math.max(0, state.scroll - Math.floor(state.rows / 2));
    return false;
  }

  switch (phase.kind) {
    case 'overview': {
      if (input === 'n' || key.return) {
        if (state.data.groups.length > 0) {
          state.phase = { kind: 'group-intro', groupIndex: 0 };
          state.scroll = 0;
        }
      }
      break;
    }

    case 'group-intro': {
      if (input === 'n' || key.return) {
        startGroupReview(state, phase.groupIndex);
      } else if (input === 'p') {
        if (phase.groupIndex > 0) {
          state.phase = { kind: 'group-intro', groupIndex: phase.groupIndex - 1 };
        } else {
          state.phase = { kind: 'overview' };
        }
        state.scroll = 0;
      }
      break;
    }

    case 'item-review': {
      const group = state.data.groups[phase.groupIndex]!;
      const pending = pendingRequirements(group);
      const req = pending[phase.reqIndex];
      if (!req) break;

      const actionCount = 3;

      if (input === 'j' || key.downArrow) {
        const next = Math.min(phase.selectedAction + 1, actionCount - 1);
        state.phase = { ...phase, selectedAction: next };
      } else if (input === 'k' || key.upArrow) {
        const prev = Math.max(0, phase.selectedAction - 1);
        state.phase = { ...phase, selectedAction: prev };
      } else if (key.return) {
        if (phase.selectedAction === 0) {
          req.reviewAction = 'approve';
          state.dirty = true;
          saveData(state);
          advanceItem(state, phase.groupIndex, phase.reqIndex);
        } else if (phase.selectedAction === 1) {
          state.inputMode = { kind: 'comment', action: 'approve' };
          state.inputBuffer = req.userComment || '';
        } else if (phase.selectedAction === 2) {
          state.inputMode = { kind: 'comment', action: 'comment' };
          state.inputBuffer = req.userComment || '';
        }
      } else if (input === ' ') {
        // Toggle acceptance criteria
        state.phase = { ...phase, expanded: !phase.expanded };
      } else if (input === '1') {
        // Approve and next
        req.reviewAction = 'approve';
        state.dirty = true;
        saveData(state);
        advanceItem(state, phase.groupIndex, phase.reqIndex);
      } else if (input === '2') {
        // Approve with comment — enter inline input mode, pre-fill existing comment
        state.inputMode = { kind: 'comment', action: 'approve' };
        state.inputBuffer = req.userComment || '';
      } else if (input === '3') {
        // Comment only — enter inline input mode, pre-fill existing comment
        state.inputMode = { kind: 'comment', action: 'comment' };
        state.inputBuffer = req.userComment || '';
      } else if (input === 'p') {
        if (phase.reqIndex > 0) {
          state.phase = { kind: 'item-review', groupIndex: phase.groupIndex, reqIndex: phase.reqIndex - 1, expanded: false, selectedAction: 0 };
          state.scroll = 0;
        } else {
          state.phase = { kind: 'group-intro', groupIndex: phase.groupIndex };
          state.scroll = 0;
        }
      } else if (input === 'n') {
        // Skip without action
        advanceItem(state, phase.groupIndex, phase.reqIndex);
      }
      break;
    }

    case 'group-questions': {
      const group = state.data.groups[phase.groupIndex]!;
      const unanswered = (group.openQuestions || []).filter(q => !q.response);
      const q = unanswered[phase.questionIndex];
      if (!q) break;

      const optionCount = q.options.length + 1; // +1 for custom

      if (input === 'p') {
        if (phase.questionIndex > 0) {
          state.phase = { ...phase, questionIndex: phase.questionIndex - 1, selectedOption: 0 };
        } else {
          // Back to last item in this group (or group intro if no pending items)
          const pending = pendingRequirements(group);
          if (pending.length > 0) {
            state.phase = { kind: 'item-review', groupIndex: phase.groupIndex, reqIndex: pending.length - 1, expanded: false, selectedAction: 0 };
          } else {
            state.phase = { kind: 'group-intro', groupIndex: phase.groupIndex };
          }
        }
        state.scroll = 0;
      } else if (input === 'j' || key.downArrow) {
        const next = Math.min(phase.selectedOption + 1, optionCount - 1);
        state.phase = { ...phase, selectedOption: next };
      } else if (input === 'k' || key.upArrow) {
        const prev = Math.max(0, phase.selectedOption - 1);
        state.phase = { ...phase, selectedOption: prev };
      } else if (key.return) {
        // Confirm selection
        if (phase.selectedOption < q.options.length) {
          // Prefilled answer
          q.response = q.options[phase.selectedOption]!.title;
          q.selectedOption = phase.selectedOption;
          state.dirty = true;
          saveData(state);
        } else {
          // Custom answer — enter inline input mode
          state.inputMode = { kind: 'custom-answer' };
          state.inputBuffer = '';
          return false;
        }

        // Next question or next group
        if (phase.questionIndex + 1 < unanswered.length) {
          state.phase = { kind: 'group-questions', groupIndex: phase.groupIndex, questionIndex: phase.questionIndex + 1, selectedOption: 0 };
        } else {
          advanceToNextGroup(state, phase.groupIndex);
        }
        state.scroll = 0;
      } else {
        // Number keys for direct selection
        const num = parseInt(input, 10);
        if (num >= 1 && num <= optionCount) {
          state.phase = { ...phase, selectedOption: num - 1 };
        }
      }
      break;
    }

    case 'final': {
      if (key.return) {
        saveData(state);
        return true;
      } else if (input === 'p') {
        // Back to last group
        const lastG = state.data.groups.length - 1;
        if (lastG >= 0) {
          state.phase = { kind: 'group-intro', groupIndex: lastG };
          state.scroll = 0;
        }
      }
      break;
    }
  }

  return false;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export function startReviewApp(data: RequirementsData, filePath: string): void {
  const cleanup = setupTerminal();

  const state: ReviewState = {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
    data,
    filePath,
    phase: { kind: 'overview' },
    scroll: 0,
    dirty: false,
    inputMode: null,
    inputBuffer: '',
  };

  // Render
  const doRender = (): void => render(state);

  // Initial render
  doRender();

  // Resize handler
  const removeResize = onResize(() => {
    state.rows = process.stdout.rows || 24;
    state.cols = process.stdout.columns || 80;
    prevFrame = []; // force full redraw
    doRender();
  });

  // Input handler
  const removeKeypress = startKeypressListener((input, key) => {
    const shouldExit = handleInput(state, input, key);
    if (shouldExit) {
      removeKeypress();
      removeResize();
      cleanup();

      // Print review feedback to stdout so the calling agent can read it
      const feedback = buildReviewFeedback(state);
      console.log(feedback);

      // Also write feedback to a file so --wait mode can retrieve it
      const feedbackPath = join(dirname(state.filePath), 'review-feedback.md');
      writeFileSync(feedbackPath, feedback, 'utf-8');

      process.exit(0);
    }
    doRender();
  });
}
