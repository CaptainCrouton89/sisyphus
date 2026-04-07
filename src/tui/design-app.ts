import { writeFileSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import stringWidth from 'string-width';
import type { Key } from './terminal.js';
import { setupTerminal, startKeypressListener, onResize, writeToStdout } from './terminal.js';
import type {
  DesignData, DesignState, DesignPhase, DesignSection, DesignItem,
} from './design-types.js';
import { totalItems, totalReviewed, sectionProgress } from './design-types.js';
import { renderMarkdownLines, clearMarkdownCache } from './lib/md-render.js';

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
const BG_GREEN_TINT = `${ESC}48;2;25;50;35m`;
const BG_DARK = `${ESC}48;2;30;30;35m`;

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

function boxLines(lines: string[], width: number, borderColor: string = FG_GRAY): string[] {
  const inner = width - 4;
  const result: string[] = [];
  result.push(`${borderColor}┌${'─'.repeat(width - 2)}┐${RESET}`);
  for (const line of lines) {
    if (line === '') {
      result.push(`${borderColor}│${RESET}${' '.repeat(width - 2)}${borderColor}│${RESET}`);
      continue;
    }
    const wrapped = wrapText(line, inner);
    for (const wl of wrapped) {
      const pw = visWidth(wl);
      result.push(`${borderColor}│${RESET} ${wl}${pad(inner - pw)} ${borderColor}│${RESET}`);
    }
  }
  result.push(`${borderColor}└${'─'.repeat(width - 2)}┘${RESET}`);
  return result;
}

function hr(width: number, color: string = FG_GRAY): string {
  return `${color}${'─'.repeat(width)}${RESET}`;
}

function progressBar(done: number, total: number, width: number): string {
  const barW = Math.max(8, width - 8);
  const filled = total > 0 ? Math.round((done / total) * barW) : 0;
  const bar = `${FG_GREEN}${ICON.bar.repeat(filled)}${FG_GRAY}${ICON.barEmpty.repeat(barW - filled)}${RESET}`;
  return `${bar} ${FG_WHITE}${done}/${total}${RESET}`;
}

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

function renderContent(text: string, cw: number, m: string): string[] {
  return renderMarkdownLines(text, cw, { margin: m });
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function statusBadge(status: DesignItem['status']): string {
  switch (status) {
    case 'draft': return `${FG_GRAY}draft${RESET}`;
    case 'approved': return `${FG_GREEN}approved${RESET}`;
    case 'rejected': return `${FG_RED}rejected${RESET}`;
    case 'deferred': return `${FG_MAGENTA}deferred${RESET}`;
  }
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function saveData(state: DesignState): void {
  state.data.meta.lastModified = new Date().toISOString();
  const json = JSON.stringify(state.data, null, 2);
  const tmpFile = state.filePath + '.tmp';
  writeFileSync(tmpFile, json, 'utf-8');
  renameSync(tmpFile, state.filePath);
  state.dirty = false;
}

function stampStarted(item: { startedAt?: string }): void {
  if (!item.startedAt) item.startedAt = new Date().toISOString();
}

function stampCompleted(item: { completedAt?: string }): void {
  item.completedAt = new Date().toISOString();
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
}

function buildDesignFeedback(state: DesignState): string {
  const { data } = state;
  const lines: string[] = [];

  lines.push(`# Design Review Feedback — ${data.meta.title} (draft ${data.meta.draft})`);
  lines.push('');

  // Timing summary
  if (data.meta.reviewStartedAt && data.meta.reviewCompletedAt) {
    const durationMs = new Date(data.meta.reviewCompletedAt).getTime() - new Date(data.meta.reviewStartedAt).getTime();
    lines.push(`**Review duration:** ${formatDurationMs(durationMs)} (${data.meta.reviewStartedAt} → ${data.meta.reviewCompletedAt})`);
    lines.push('');
  }

  for (const section of data.sections) {
    lines.push(`## ${section.name}`);
    lines.push('');

    for (const item of section.items) {
      let actionLabel = 'skipped (no action taken)';
      if (item.reviewAction === 'agree') {
        actionLabel = '✓ agreed';
      } else if (item.reviewAction === 'pick-alt') {
        const altIdx = item.selectedAlternative ?? 0;
        const alt = item.decision?.alternatives[altIdx];
        actionLabel = `◆ picked Alt ${altIdx + 1}${alt ? `: "${alt.title}"` : ''}`;
      } else if (item.reviewAction === 'comment') {
        actionLabel = '◆ commented';
      } else if (item.status === 'approved') {
        actionLabel = '✓ previously approved';
      }

      const dur = item.startedAt && item.completedAt
        ? ` (${formatDurationMs(new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime())})`
        : '';
      lines.push(`- **${item.id}** ${item.title} — ${actionLabel}${dur}`);
      if (item.userComment) {
        lines.push(`  > ${item.userComment}`);
      }
    }

    if (section.openQuestions && section.openQuestions.length > 0) {
      for (const q of section.openQuestions) {
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
  let out = '\x1b[?2026h';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== prevFrame[i]) {
      out += `${ESC}${i + 1};1H${ESC}2K${lines[i]}`;
    }
  }
  for (let i = lines.length; i < prevFrame.length; i++) {
    out += `${ESC}${i + 1};1H${ESC}2K`;
  }
  out += '\x1b[?2026l';
  writeToStdout(out);
  prevFrame = [...lines];
}

// ─── Phase Renderers ─────────────────────────────────────────────────────────

function renderOverview(state: DesignState): string[] {
  const { data, cols } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  lines.push('');
  lines.push(centerPad(`${BOLD}${FG_WHITE}${data.meta.title}${RESET}`, cols));
  if (data.meta.subtitle) {
    lines.push(centerPad(`${DIM}${data.meta.subtitle}${RESET}`, cols));
  }
  lines.push(centerPad(`${FG_GRAY}v${data.meta.version} · draft ${data.meta.draft}${RESET}`, cols));
  lines.push('');

  if (data.meta.summary) {
    const wrapped = wrapText(data.meta.summary, cw - 4);
    for (const line of wrapped) {
      lines.push(`${m}  ${FG_WHITE}${line}${RESET}`);
    }
    lines.push('');
  }

  lines.push(`${m}${hr(cw)}`);
  lines.push('');

  const totalI = totalItems(data);

  for (let i = 0; i < data.sections.length; i++) {
    const section = data.sections[i]!;
    const prog = sectionProgress(section);
    const allDone = prog.reviewed === prog.total && prog.total > 0;
    const statusIcon = allDone
      ? `${FG_GREEN}${ICON.approved}${RESET}`
      : `${FG_GRAY}${ICON.pending}${RESET}`;

    const numKey = i < 9 ? `${FG_GRAY}${i + 1}${RESET} ` : '  ';
    lines.push(`${m}  ${numKey}${statusIcon} ${BOLD}${FG_WHITE}${section.name}${RESET}`);

    if (section.goal) {
      const truncated = section.goal.length > cw - 8 ? section.goal.slice(0, cw - 11) + '...' : section.goal;
      lines.push(`${m}    ${DIM}${truncated}${RESET}`);
    }

    const statsText = allDone
      ? `${FG_GREEN}all ${prog.total} reviewed${RESET}`
      : `${prog.reviewed}/${prog.total} reviewed`;
    const decisionText = prog.decisions > 0 ? ` ${DIM}·${RESET} ${prog.decisions} decision${prog.decisions !== 1 ? 's' : ''}` : '';
    lines.push(`${m}    ${FG_GRAY}${prog.total} item${prog.total !== 1 ? 's' : ''}${RESET} ${DIM}·${RESET} ${statsText}${decisionText}`);

    if (section.openQuestions && section.openQuestions.length > 0) {
      const unanswered = section.openQuestions.filter(q => !q.response).length;
      if (unanswered > 0) {
        lines.push(`${m}    ${FG_YELLOW}${unanswered} open question${unanswered !== 1 ? 's' : ''}${RESET}`);
      }
    }
    lines.push('');
  }

  lines.push(`${m}${hr(cw)}`);
  lines.push('');

  const reviewed = totalReviewed(data);
  lines.push(`${m}  ${progressBar(reviewed, totalI, cw - 4)}`);
  lines.push('');

  return lines;
}

function renderSectionIntro(state: DesignState, sectionIndex: number): string[] {
  const { data, cols } = state;
  const section = data.sections[sectionIndex]!;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  lines.push('');
  lines.push(`${m}  ${sectionDots(sectionIndex, data.sections.length)} ${DIM}Section ${sectionIndex + 1} of ${data.sections.length}${RESET}`);
  lines.push('');

  lines.push(`${m}  ${BOLD}${FG_CYAN}${section.name}${RESET}`);
  if (section.goal) {
    lines.push(`${m}  ${DIM}${section.goal}${RESET}`);
  }
  lines.push(`${m}  ${hr(cw - 4)}`);
  lines.push('');

  if (section.context) {
    lines.push(...renderContent(section.context, cw, m));
    lines.push('');
  }

  const prog = sectionProgress(section);
  lines.push(`${m}  ${FG_GRAY}${prog.total} item${prog.total !== 1 ? 's' : ''}${prog.decisions > 0 ? ` · ${prog.decisions} decision${prog.decisions !== 1 ? 's' : ''}` : ''}${RESET}`);

  if (section.openQuestions && section.openQuestions.length > 0) {
    const unanswered = section.openQuestions.filter(q => !q.response).length;
    if (unanswered > 0) {
      lines.push(`${m}  ${FG_YELLOW}${unanswered} open question${unanswered !== 1 ? 's' : ''} to answer${RESET}`);
    }
  }
  lines.push('');

  return lines;
}

function getDesignActions(item: DesignItem): Array<{ label: string; color: string; key: string }> {
  if (item.decision) {
    const actions: Array<{ label: string; color: string; key: string }> = [
      { label: `${ICON.approved} Agree`, color: FG_GREEN, key: 'a' },
    ];
    for (let i = 0; i < item.decision.alternatives.length; i++) {
      const alt = item.decision.alternatives[i]!;
      actions.push({ label: `Alt ${i + 1}: ${alt.title}`, color: FG_YELLOW, key: `${i + 1}` });
    }
    actions.push({ label: `${ICON.comment} Comment`, color: FG_CYAN, key: 'c' });
    actions.push({ label: 'Next', color: FG_GRAY, key: 'n' });
    return actions;
  } else {
    return [
      { label: `${ICON.comment} Comment`, color: FG_CYAN, key: 'c' },
      { label: 'Next', color: FG_GRAY, key: 'n' },
    ];
  }
}

function renderItemWalkthrough(state: DesignState, sectionIndex: number, itemIndex: number, selectedAction: number): string[] {
  const { data, cols } = state;
  const section = data.sections[sectionIndex]!;
  const item = section.items[itemIndex];
  if (!item) return ['  No items to review.'];

  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const boxW = cw - 4;
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`${m}  ${sectionDots(sectionIndex, data.sections.length)} ${DIM}${section.name}${RESET}`);
  lines.push(`${m}  ${FG_GRAY}Item ${itemIndex + 1} of ${section.items.length}${RESET}`);
  lines.push('');

  // Item title + status badge
  lines.push(`${m}  ${BOLD}${FG_WHITE}${item.id}${RESET}  ${item.title}  ${DIM}[${statusBadge(item.status)}${DIM}]${RESET}`);
  lines.push('');

  // Description (dimmed)
  if (item.description) {
    const wrapped = wrapText(item.description, cw - 4);
    for (const wl of wrapped) {
      lines.push(`${m}  ${DIM}${wl}${RESET}`);
    }
    lines.push('');
  }

  // Content (main body — with diagram detection)
  if (item.content) {
    lines.push(...renderContent(item.content, cw, m));
    lines.push('');
  }

  // Decision block
  if (item.decision) {
    const { proposal, alternatives, lenses } = item.decision;

    // Proposal box
    lines.push(`${m}  ${BG_GREEN_TINT}${FG_GREEN}${BOLD} Proposed ${'─'.repeat(Math.max(0, boxW - 11))}${RESET}`);
    const proposalTitle = wrapText(proposal.title, boxW - 4);
    for (const wl of proposalTitle) {
      const pw = visWidth(wl);
      lines.push(`${m}  ${BG_GREEN_TINT} ${BOLD}${FG_WHITE}${wl}${pad(boxW - pw - 2)} ${RESET}`);
    }
    if (proposal.description) {
      const descWrapped = wrapText(proposal.description, boxW - 4);
      for (const wl of descWrapped) {
        const pw = visWidth(wl);
        lines.push(`${m}  ${BG_GREEN_TINT} ${FG_WHITE}${wl}${pad(boxW - pw - 2)} ${RESET}`);
      }
    }
    lines.push(`${m}  ${BG_GREEN_TINT}${' '.repeat(boxW)}${RESET}`);
    lines.push('');

    // Alternatives
    if (alternatives.length > 0) {
      lines.push(`${m}  ${FG_GRAY}Alternatives:${RESET}`);
      for (let i = 0; i < alternatives.length; i++) {
        const alt = alternatives[i]!;
        lines.push(`${m}  ${DIM}Alt ${i + 1}: ${FG_WHITE}${alt.title}${RESET}`);
        if (alt.description) {
          const altWrapped = wrapText(alt.description, cw - 8);
          for (const wl of altWrapped) {
            lines.push(`${m}    ${DIM}${wl}${RESET}`);
          }
        }
      }
      lines.push('');
    }

    // Lenses
    const lensKeys = Object.keys(lenses);
    if (lensKeys.length > 0) {
      const maxLensLen = Math.max(...lensKeys.map(k => k.length));
      const lensLines: string[] = [];
      for (const key of lensKeys) {
        const val = lenses[key] ?? '';
        const keyPadded = key.padEnd(maxLensLen, ' ');
        lensLines.push(`${FG_GRAY}${keyPadded}${RESET}  ${FG_WHITE}${val}${RESET}`);
      }

      // Build the box manually (lenses have embedded ANSI)
      lines.push(`${m}  ${FG_GRAY}┌ Lenses ${'─'.repeat(Math.max(0, boxW - 10))}┐${RESET}`);
      for (const ll of lensLines) {
        const plainLen = visWidth(ll);
        const padding = Math.max(0, boxW - plainLen - 4);
        lines.push(`${m}  ${FG_GRAY}│${RESET} ${ll}${pad(padding)} ${FG_GRAY}│${RESET}`);
      }
      lines.push(`${m}  ${FG_GRAY}└${'─'.repeat(boxW - 2)}┘${RESET}`);
      lines.push('');
    }

    // Existing review action
    if (item.reviewAction) {
      if (item.reviewAction === 'agree') {
        lines.push(`${m}  ${FG_GREEN}${ICON.approved} Agreed with proposal${RESET}`);
      } else if (item.reviewAction === 'pick-alt') {
        const altIdx = item.selectedAlternative ?? 0;
        const alt = alternatives[altIdx];
        lines.push(`${m}  ${FG_YELLOW}${ICON.comment} Picked Alt ${altIdx + 1}${alt ? `: ${alt.title}` : ''}${RESET}`);
      } else if (item.reviewAction === 'comment') {
        lines.push(`${m}  ${FG_CYAN}${ICON.comment} Commented${RESET}`);
      }
      lines.push('');
    }
  }

  // Agent notes (yellow italic)
  if (item.agentNotes) {
    const noteLines = item.agentNotes.split('\n');
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

  // Existing user comment
  if (item.userComment) {
    const commentWrapped = wrapText(item.userComment, cw - 8);
    lines.push(`${m}  ${FG_CYAN}${ICON.comment}  Your comment:${RESET}`);
    for (const cl of commentWrapped) {
      lines.push(`${m}     ${FG_WHITE}${cl}${RESET}`);
    }
    lines.push('');
  }

  // User notes field
  if (item.userNotes) {
    const notesWrapped = wrapText(item.userNotes, cw - 8);
    lines.push(`${m}  ${FG_BLUE}Notes:${RESET}`);
    for (const nl of notesWrapped) {
      lines.push(`${m}     ${FG_WHITE}${nl}${RESET}`);
    }
    lines.push('');
  }

  // Action bar - navigable
  lines.push(`${m}  ${hr(boxW)}`);
  lines.push('');
  const actions = getDesignActions(item);
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i]!;
    const isSelected = i === selectedAction;
    const bullet = isSelected ? `${FG_CYAN}${ICON.bullet}${RESET}` : ` `;
    const keyColor = isSelected ? `${FG_CYAN}${BOLD}` : FG_GRAY;
    const titleColor = isSelected ? `${FG_CYAN}${BOLD}` : act.color;
    lines.push(`${m}  ${bullet} ${keyColor}${act.key}${RESET}  ${titleColor}${act.label}${RESET}`);
  }
  lines.push('');

  return lines;
}

function renderSectionQuestions(state: DesignState, sectionIndex: number, questionIndex: number, selectedOption: number): string[] {
  const { data, cols } = state;
  const section = data.sections[sectionIndex]!;
  const questions = (section.openQuestions || []).filter(q => !q.response);
  const q = questions[questionIndex];
  if (!q) return ['  No questions remaining.'];

  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  lines.push('');
  lines.push(`${m}  ${sectionDots(sectionIndex, data.sections.length)} ${DIM}${section.name} · Questions${RESET}`);
  lines.push(`${m}  ${FG_GRAY}Question ${questionIndex + 1} of ${questions.length}${RESET}`);
  lines.push('');

  const qWrapped = wrapText(q.question, cw - 4);
  for (const ql of qWrapped) {
    lines.push(`${m}  ${BOLD}${FG_WHITE}${ql}${RESET}`);
  }
  lines.push('');

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

  const customIdx = optionCount;
  const isCustomSelected = selectedOption === customIdx;
  const customBullet = isCustomSelected ? `${FG_CYAN}${ICON.bullet}${RESET}` : ` `;
  const customNumColor = isCustomSelected ? `${FG_CYAN}${BOLD}` : FG_GRAY;
  const customTitleColor = isCustomSelected ? `${FG_CYAN}${BOLD}` : FG_YELLOW;
  lines.push(`${m}  ${customBullet} ${customNumColor}${customIdx + 1}${RESET}  ${customTitleColor}Type a custom answer...${RESET}`);
  lines.push('');

  lines.push(`${m}  ${DIM}j/k or 1-${customIdx + 1} to select · enter to confirm${RESET}`);
  lines.push('');

  return lines;
}

function renderFinal(state: DesignState): string[] {
  const { data, cols } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  const totalI = totalItems(data);
  const reviewed = totalReviewed(data);

  let totalAgreed = 0;
  let totalComments = 0;
  let totalAnswered = 0;
  let totalQuestionsAll = 0;

  for (const section of data.sections) {
    for (const item of section.items) {
      if (item.reviewAction === 'agree' || item.reviewAction === 'pick-alt') totalAgreed++;
      if (item.userComment) totalComments++;
    }
    if (section.openQuestions) {
      totalQuestionsAll += section.openQuestions.length;
      totalAnswered += section.openQuestions.filter(q => q.response).length;
    }
  }

  lines.push('');
  lines.push(centerPad(`${BOLD}${FG_WHITE}Design Review Complete${RESET}`, cols));
  lines.push('');

  const statLines = [
    `${reviewed}/${totalI} items reviewed`,
    `${data.sections.length} section${data.sections.length !== 1 ? 's' : ''} completed`,
    '',
    `${totalAgreed} agreed · ${totalComments} with comments`,
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

function renderFooter(state: DesignState, overflow?: { pct: number }): string[] {
  const { phase, cols, data } = state;
  const cw = Math.min(MAX_CONTENT_WIDTH, cols - 4);
  const marginL = Math.max(0, Math.floor((cols - cw) / 2));
  const m = pad(marginL);
  const lines: string[] = [];

  const totalI = totalItems(data);
  lines.push(`${m}${hr(cw)}`);

  let hints = '';
  switch (phase.kind) {
    case 'overview':
      hints = `${DIM}1-9${RESET} jump  ${DIM}n${RESET} next  ${DIM}q${RESET} quit`;
      break;
    case 'section-intro':
      hints = `${DIM}n${RESET} start  ${DIM}p${RESET} back  ${DIM}o${RESET} overview  ${DIM}q${RESET} quit`;
      break;
    case 'item-walkthrough': {
      hints = `${DIM}j/k${RESET} select  ${DIM}enter${RESET} confirm  ${DIM}o${RESET} overview  ${DIM}q${RESET} quit`;
      break;
    }
    case 'section-questions':
      hints = `${DIM}j/k${RESET} select  ${DIM}enter${RESET} confirm  ${DIM}q${RESET} quit`;
      break;
    case 'final':
      hints = `${DIM}enter${RESET} save & exit  ${DIM}q${RESET} exit`;
      break;
  }

  // Scroll indicator: show only when content overflows and not in text input mode.
  // j/k navigates options in item-walkthrough/section-questions, so those phases
  // get pgup/pgdn instead.
  let scrollHint = '';
  if (overflow && !state.inputMode) {
    const jkScrolls = phase.kind !== 'item-walkthrough' && phase.kind !== 'section-questions';
    const key = jkScrolls ? '↑↓' : 'pgup/pgdn';
    scrollHint = `  ${DIM}${key} scroll ↕ ${overflow.pct}%${RESET}`;
  }

  const progressText = `${FG_GRAY}${totalReviewed(data)}/${totalI} reviewed${RESET}`;

  if (state.inputMode) {
    const label = state.inputMode.kind === 'comment' ? 'Comment' : 'Answer';
    const inputW = cw - 6;
    const textWithCursor = state.inputBuffer + '█';
    const wrapped = wrapText(textWithCursor, inputW);

    lines.push(`${m}  ${FG_CYAN}${label}:${RESET}`);
    for (const wl of wrapped) {
      lines.push(`${m}    ${FG_WHITE}${wl}${RESET}`);
    }
    lines.push(`${m}  ${DIM}enter${RESET} submit  ${DIM}esc${RESET} cancel  ${progressText}`);
  } else {
    lines.push(`${m}  ${hints}${scrollHint}  ${progressText}`);
  }

  return lines;
}

// ─── Main Render ─────────────────────────────────────────────────────────────

function render(state: DesignState): void {
  const { phase, rows } = state;
  let content: string[] = [];

  switch (phase.kind) {
    case 'overview':
      content = renderOverview(state);
      break;
    case 'section-intro':
      content = renderSectionIntro(state, phase.sectionIndex);
      break;
    case 'item-walkthrough':
      content = renderItemWalkthrough(state, phase.sectionIndex, phase.itemIndex, phase.selectedAction);
      break;
    case 'section-questions':
      content = renderSectionQuestions(state, phase.sectionIndex, phase.questionIndex, phase.selectedOption);
      break;
    case 'final':
      content = renderFinal(state);
      break;
  }

  // First pass without overflow info to measure footer height (height does not change
  // with the scroll indicator — it lives on the existing hints line).
  const footerProvisional = renderFooter(state);

  const footerH = footerProvisional.length;
  const availH = rows - footerH;
  const maxScroll = Math.max(0, content.length - availH);
  if (state.scroll > maxScroll) state.scroll = maxScroll;
  if (state.scroll < 0) state.scroll = 0;

  // Re-render footer with overflow info if there's something to scroll.
  const footer = maxScroll > 0
    ? renderFooter(state, { pct: Math.round((state.scroll / maxScroll) * 100) })
    : footerProvisional;

  const visible = content.slice(state.scroll, state.scroll + availH);

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

function advanceToNextSection(state: DesignState, currentSectionIndex: number): void {
  const nextS = currentSectionIndex + 1;
  if (nextS < state.data.sections.length) {
    state.phase = { kind: 'section-intro', sectionIndex: nextS };
  } else {
    state.phase = { kind: 'final' };
  }
  state.scroll = 0;
}

function startSectionReview(state: DesignState, sectionIndex: number): void {
  const section = state.data.sections[sectionIndex]!;
  if (section.items.length > 0) {
    stampStarted(section.items[0]!);
    state.phase = { kind: 'item-walkthrough', sectionIndex, itemIndex: 0, selectedAction: 0 };
  } else {
    startSectionQuestions(state, sectionIndex);
  }
  state.scroll = 0;
}

function advanceItem(state: DesignState, sectionIndex: number, itemIndex: number): void {
  const section = state.data.sections[sectionIndex]!;
  if (itemIndex + 1 < section.items.length) {
    stampStarted(section.items[itemIndex + 1]!);
    state.phase = { kind: 'item-walkthrough', sectionIndex, itemIndex: itemIndex + 1, selectedAction: 0 };
  } else {
    startSectionQuestions(state, sectionIndex);
  }
  state.scroll = 0;
}

function startSectionQuestions(state: DesignState, sectionIndex: number): void {
  const section = state.data.sections[sectionIndex]!;
  const unanswered = (section.openQuestions || []).filter(q => !q.response);
  if (unanswered.length > 0) {
    stampStarted(unanswered[0]!);
    state.phase = { kind: 'section-questions', sectionIndex, questionIndex: 0, selectedOption: 0 };
  } else {
    advanceToNextSection(state, sectionIndex);
  }
  state.scroll = 0;
}

// ─── Input Handler ───────────────────────────────────────────────────────────

function handleInput(state: DesignState, input: string, key: Key): boolean {
  const { phase } = state;

  // ── Inline input mode ──
  if (state.inputMode) {
    if (key.escape) {
      state.inputMode = null;
      state.inputBuffer = '';
      return false;
    }
    if (key.return) {
      const text = state.inputBuffer.trim();

      if (state.inputMode.kind === 'comment' && phase.kind === 'item-walkthrough') {
        const section = state.data.sections[phase.sectionIndex]!;
        const item = section.items[phase.itemIndex];
        if (item) {
          if (state.inputMode.kind === 'comment' && state.inputMode.pendingAlt !== undefined) {
            item.reviewAction = 'pick-alt';
            item.selectedAlternative = state.inputMode.pendingAlt;
          } else {
            item.reviewAction = 'comment';
          }
          if (text) item.userComment = text;
          stampCompleted(item);
          state.dirty = true;
          saveData(state);
          advanceItem(state, phase.sectionIndex, phase.itemIndex);
        }
      } else if (state.inputMode.kind === 'custom-answer' && phase.kind === 'section-questions') {
        const section = state.data.sections[phase.sectionIndex]!;
        const unanswered = (section.openQuestions || []).filter(q => !q.response);
        const q = unanswered[phase.questionIndex];
        if (q && text) {
          q.response = text;
          stampCompleted(q);
          state.dirty = true;
          saveData(state);
          if (phase.questionIndex + 1 < unanswered.length) {
            stampStarted(unanswered[phase.questionIndex + 1]!);
            state.phase = { kind: 'section-questions', sectionIndex: phase.sectionIndex, questionIndex: phase.questionIndex + 1, selectedOption: 0 };
          } else {
            advanceToNextSection(state, phase.sectionIndex);
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
    if (input.length === 1 && !key.ctrl && !key.meta) {
      state.inputBuffer += input;
    }
    return false;
  }

  // Global: quit
  if (input === 'q' && !key.ctrl) {
    return true;
  }
  if (key.ctrl && input === 'c') {
    return true;
  }

  // Scroll (except in section-questions and item-walkthrough where j/k navigate options)
  if ((key.downArrow && phase.kind !== 'section-questions' && phase.kind !== 'item-walkthrough') || (input === 'j' && phase.kind !== 'section-questions' && phase.kind !== 'item-walkthrough')) {
    state.scroll++;
    return false;
  }
  if ((key.upArrow && phase.kind !== 'section-questions' && phase.kind !== 'item-walkthrough') || (input === 'k' && phase.kind !== 'section-questions' && phase.kind !== 'item-walkthrough')) {
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
        if (state.data.sections.length > 0) {
          state.phase = { kind: 'section-intro', sectionIndex: 0 };
          state.scroll = 0;
        }
      } else {
        // Number key: jump to section 1-9
        const num = parseInt(input, 10);
        if (num >= 1 && num <= Math.min(9, state.data.sections.length)) {
          state.phase = { kind: 'section-intro', sectionIndex: num - 1 };
          state.scroll = 0;
        }
      }
      break;
    }

    case 'section-intro': {
      if (input === 'n' || key.return) {
        startSectionReview(state, phase.sectionIndex);
      } else if (input === 'p') {
        if (phase.sectionIndex > 0) {
          state.phase = { kind: 'section-intro', sectionIndex: phase.sectionIndex - 1 };
        } else {
          state.phase = { kind: 'overview' };
        }
        state.scroll = 0;
      } else if (input === 'o') {
        state.phase = { kind: 'overview' };
        state.scroll = 0;
      }
      break;
    }

    case 'item-walkthrough': {
      const section = state.data.sections[phase.sectionIndex]!;
      const item = section.items[phase.itemIndex];
      if (!item) break;

      const actions = getDesignActions(item);
      const actionCount = actions.length;

      if (input === 'j' || key.downArrow) {
        const next = Math.min(phase.selectedAction + 1, actionCount - 1);
        state.phase = { ...phase, selectedAction: next };
      } else if (input === 'k' || key.upArrow) {
        const prev = Math.max(0, phase.selectedAction - 1);
        state.phase = { ...phase, selectedAction: prev };
      } else if (key.return) {
        // Execute the selected action based on index mapping
        if (item.decision) {
          const numAlts = item.decision.alternatives.length;
          if (phase.selectedAction === 0) {
            // Agree
            item.reviewAction = 'agree';
            item.status = 'approved';
            stampCompleted(item);
            state.dirty = true;
            saveData(state);
            advanceItem(state, phase.sectionIndex, phase.itemIndex);
          } else if (phase.selectedAction >= 1 && phase.selectedAction <= numAlts) {
            // Pick alternative (requires comment)
            state.inputMode = { kind: 'comment', pendingAlt: phase.selectedAction - 1 };
            state.inputBuffer = item.userComment || '';
          } else if (phase.selectedAction === numAlts + 1) {
            // Comment
            state.inputMode = { kind: 'comment' };
            state.inputBuffer = item.userComment || '';
          } else if (phase.selectedAction === numAlts + 2) {
            // Next
            advanceItem(state, phase.sectionIndex, phase.itemIndex);
          }
        } else {
          if (phase.selectedAction === 0) {
            // Comment
            state.inputMode = { kind: 'comment' };
            state.inputBuffer = item.userComment || '';
          } else if (phase.selectedAction === 1) {
            // Next
            advanceItem(state, phase.sectionIndex, phase.itemIndex);
          }
        }
      } else if (input === 'o') {
        state.phase = { kind: 'overview' };
        state.scroll = 0;
      } else if (input === 'p') {
        if (phase.itemIndex > 0) {
          stampStarted(state.data.sections[phase.sectionIndex]!.items[phase.itemIndex - 1]!);
          state.phase = { kind: 'item-walkthrough', sectionIndex: phase.sectionIndex, itemIndex: phase.itemIndex - 1, selectedAction: 0 };
          state.scroll = 0;
        } else {
          state.phase = { kind: 'section-intro', sectionIndex: phase.sectionIndex };
          state.scroll = 0;
        }
      } else if (input === 'n') {
        advanceItem(state, phase.sectionIndex, phase.itemIndex);
      } else if (input === 'a' && item.decision) {
        item.reviewAction = 'agree';
        item.status = 'approved';
        stampCompleted(item);
        state.dirty = true;
        saveData(state);
        advanceItem(state, phase.sectionIndex, phase.itemIndex);
      } else if (input === 'c') {
        state.inputMode = { kind: 'comment' };
        state.inputBuffer = item.userComment || '';
      } else if (item.decision) {
        // Digit keys for alternative selection
        const num = parseInt(input, 10);
        const altCount = item.decision.alternatives.length;
        if (num >= 1 && num <= altCount) {
          // Picking an alt requires a comment explaining why
          state.inputMode = { kind: 'comment', pendingAlt: num - 1 };
          state.inputBuffer = item.userComment || '';
        }
      }
      break;
    }

    case 'section-questions': {
      const section = state.data.sections[phase.sectionIndex]!;
      const unanswered = (section.openQuestions || []).filter(q => !q.response);
      const q = unanswered[phase.questionIndex];
      if (!q) {
        if (key.return) {
          advanceToNextSection(state, phase.sectionIndex);
          state.scroll = 0;
        }
        break;
      }

      const optionCount = q.options.length + 1; // +1 for custom

      if (input === 'o') {
        state.phase = { kind: 'overview' };
        state.scroll = 0;
      } else if (input === 'p') {
        if (phase.questionIndex > 0) {
          state.phase = { ...phase, questionIndex: phase.questionIndex - 1, selectedOption: 0 };
        } else {
          if (section.items.length > 0) {
            state.phase = { kind: 'item-walkthrough', sectionIndex: phase.sectionIndex, itemIndex: section.items.length - 1, selectedAction: 0 };
          } else {
            state.phase = { kind: 'section-intro', sectionIndex: phase.sectionIndex };
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
        if (phase.selectedOption < q.options.length) {
          q.response = q.options[phase.selectedOption]!.title;
          q.selectedOption = phase.selectedOption;
          stampCompleted(q);
          state.dirty = true;
          saveData(state);
        } else {
          state.inputMode = { kind: 'custom-answer' };
          state.inputBuffer = '';
          return false;
        }

        if (phase.questionIndex + 1 < unanswered.length) {
          stampStarted(unanswered[phase.questionIndex + 1]!);
          state.phase = { kind: 'section-questions', sectionIndex: phase.sectionIndex, questionIndex: phase.questionIndex + 1, selectedOption: 0 };
        } else {
          advanceToNextSection(state, phase.sectionIndex);
        }
        state.scroll = 0;
      } else {
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
        const lastS = state.data.sections.length - 1;
        if (lastS >= 0) {
          state.phase = { kind: 'section-intro', sectionIndex: lastS };
          state.scroll = 0;
        }
      }
      break;
    }
  }

  return false;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

export function startDesignApp(data: DesignData, filePath: string): void {
  // Snapshot original JSON before any modifications
  const snapshotPath = filePath.replace(/\.json$/, '.pre-review.json');
  if (!existsSync(snapshotPath)) {
    copyFileSync(filePath, snapshotPath);
  }

  // Stamp session-level review start
  data.meta.reviewStartedAt = new Date().toISOString();

  const cleanup = setupTerminal();

  const state: DesignState = {
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

  const doRender = (): void => render(state);

  doRender();

  const removeResize = onResize(() => {
    state.rows = process.stdout.rows || 24;
    state.cols = process.stdout.columns || 80;
    clearMarkdownCache();
    prevFrame = [];
    doRender();
  });

  const removeKeypress = startKeypressListener((input, key) => {
    const shouldExit = handleInput(state, input, key);
    if (shouldExit) {
      removeKeypress();
      removeResize();
      cleanup();

      // Stamp session-level review completion and persist
      state.data.meta.reviewCompletedAt = new Date().toISOString();
      saveData(state);

      const feedback = buildDesignFeedback(state);
      console.log(feedback);

      const feedbackPath = join(dirname(state.filePath), 'design-feedback.md');
      writeFileSync(feedbackPath, feedback, 'utf-8');

      process.exit(0);
    }
    doRender();
  });
}
