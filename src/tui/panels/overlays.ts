import { drawBorder, writeClipped, type FrameBuffer } from '../render.js';
import { ansiColor, ansiDim, ansiBold } from '../lib/format.js';
import type { CompanionState, AchievementDef, Mood } from '../../shared/companion-types.js';
import { getMoodFace } from '../../shared/companion-render.js';
import { computeLevelProgress } from '../../daemon/companion.js';
import { ACHIEVEMENTS } from '../../shared/companion-types.js';
import {
  createBadgeGallery,
  renderBadgeCard,
  galleryNext,
  galleryPrev,
  CARD_WIDTH,
  type BadgeGallery,
} from '../../shared/companion-badges.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEADER_WIDTH = 26;
const LEADER_HEIGHT = 20; // 18 content lines + 2 border lines
const COPY_HEIGHT = 9;    // 7 content lines + 2 border lines
const HELP_WIDTH = 62;
const COMPANION_WIDTH = 52;
const DEBUG_WIDTH = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function helpRow(left: string, right: string, innerWidth: number): string {
  const col = Math.floor(innerWidth / 2);
  return (left.padEnd(col) + right).padEnd(innerWidth);
}

// ─── Overlays ─────────────────────────────────────────────────────────────────

export function renderLeaderOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const x = cols - LEADER_WIDTH - 1;
  const y = rows - LEADER_HEIGHT - 2;
  const innerWidth = LEADER_WIDTH - 2;

  drawBorder(buf, x, y, LEADER_WIDTH, LEADER_HEIGHT, 'magenta');

  const lines: string[] = [
    ansiColor('  LEADER'.padEnd(innerWidth), 'magenta', true),
    ' '.padEnd(innerWidth),
    '  y  copy menu'.padEnd(innerWidth),
    '  d  delete session'.padEnd(innerWidth),
    '  l  daemon logs'.padEnd(innerWidth),
    '  o  open session dir'.padEnd(innerWidth),
    '  a  spawn agent'.padEnd(innerWidth),
    '  m  message agent'.padEnd(innerWidth),
    '  /  search'.padEnd(innerWidth),
    '  !  shell command'.padEnd(innerWidth),
    '  j  jump to pane'.padEnd(innerWidth),
    '  k  kill session/agent'.padEnd(innerWidth),
    '  c  companion overlay'.padEnd(innerWidth),
    '  q  quit'.padEnd(innerWidth),
    '  ?  help'.padEnd(innerWidth),
    ' 1-9  jump to session'.padEnd(innerWidth),
    ' '.padEnd(innerWidth),
    ansiDim('  esc  dismiss'.padEnd(innerWidth)),
  ];

  for (let i = 0; i < lines.length; i++) {
    writeClipped(buf, x + 1, y + 1 + i, lines[i]!, innerWidth);
  }
}

export function renderCopyMenuOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const x = cols - LEADER_WIDTH - 1;
  const y = rows - COPY_HEIGHT - 2;
  const innerWidth = LEADER_WIDTH - 2;

  drawBorder(buf, x, y, LEADER_WIDTH, COPY_HEIGHT, 'cyan');

  const lines: string[] = [
    ansiColor('  COPY'.padEnd(innerWidth), 'cyan', true),
    ' '.padEnd(innerWidth),
    '  p  session path'.padEnd(innerWidth),
    '  C  LLM context'.padEnd(innerWidth),
    '  l  logs content'.padEnd(innerWidth),
    '  s  session ID'.padEnd(innerWidth),
    ansiDim('  esc  cancel'.padEnd(innerWidth)),
  ];

  for (let i = 0; i < lines.length; i++) {
    writeClipped(buf, x + 1, y + 1 + i, lines[i]!, innerWidth);
  }
}

export function renderHelpOverlay(buf: FrameBuffer, rows: number, cols: number): void {
  const innerWidth = HELP_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - HELP_WIDTH) / 2));

  const contentLines: string[] = [
    helpRow('  hjkl/↑↓←→  navigate', '  tab  switch pane', innerWidth),
    helpRow('  enter  expand/open', '  t  toggle logs', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  n  new session', '  m  message orch.', innerWidth),
    helpRow('  R  resume session', '  C  continue session', innerWidth),
    helpRow('  b  rollback cycle', '  x  restart agent', innerWidth),
    helpRow('  r  re-run agent', '  g  edit goal', innerWidth),
    helpRow('  p  open roadmap', '  s  toggle strategy', innerWidth),
    helpRow('  S  edit strategy', '  w  go to window', innerWidth),
    helpRow('  o  resume claude session', '  c  claude companion', innerWidth),
    helpRow('  q  quit', '', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  space → y  copy submenu', '  space → d  delete session', innerWidth),
    helpRow('  space → j  jump to pane', '  space → k  kill', innerWidth),
    helpRow('  space → q  quit', '  space → o  open dir', innerWidth),
    helpRow('  space → l  tail logs', '  space → /  search', innerWidth),
    helpRow('  space → a  spawn agent', '  space → m  msg agent', innerWidth),
    helpRow('  space → ?  help', '  space → 1-9  jump', innerWidth),
    ' '.padEnd(innerWidth),
    helpRow('  y → p  session path', '  y → C  LLM context', innerWidth),
    helpRow('  y → l  logs content', '  y → s  session ID', innerWidth),
  ];

  // title + blank + contentLines + blank = contentLines.length + 3 inner rows, + 2 border
  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, HELP_WIDTH, height, 'yellow');

  // Title row
  writeClipped(buf, x + 1, y + 1, ansiColor('  KEYBINDINGS  (esc or ? to close)'.padEnd(innerWidth), 'yellow', true), innerWidth);
  // Blank row after title
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  // Content rows (clamp to available height: height - 4 rows for title+blank+trailing_blank+borders)
  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }

  // Trailing blank (only if there's room)
  const trailingBlankRow = y + 3 + Math.min(contentLines.length, availableContentRows);
  if (trailingBlankRow < y + height - 1) {
    writeClipped(buf, x + 1, trailingBlankRow, ' '.padEnd(innerWidth), innerWidth);
  }
}

// ─── Companion Overlay State (module-level, reset on close) ──────────────────

type CompanionPage = 'profile' | 'badges' | 'help';

let _page: CompanionPage = 'profile';
let _prevPage: 'profile' | 'badges' = 'profile';
let _gallery: BadgeGallery | null = null;

export function companionOverlayNextPage(): void {
  if (_page === 'help') { _page = _prevPage; return; }
  _page = _page === 'profile' ? 'badges' : 'profile';
}

export function companionOverlayShowHelp(): void {
  if (_page !== 'help') _prevPage = _page as 'profile' | 'badges';
  _page = 'help';
}

export function companionOverlayDismissHelp(): void {
  _page = _prevPage;
}

export function badgeGalleryLeft(): void {
  if (_gallery) _gallery.currentIndex = galleryPrev(_gallery);
}

export function badgeGalleryRight(): void {
  if (_gallery) _gallery.currentIndex = galleryNext(_gallery);
}

export function closeBadgeGallery(): void {
  _page = 'profile';
  _gallery = null;
  _badgeScroll = 0;
}

export function getCompanionPage(): CompanionPage {
  return _page;
}

// ─── Companion Profile Page ──────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOOD_ICONS: Record<Mood, string> = {
  happy: '◉', grinding: '◈', frustrated: '◆', zen: '◎', sleepy: '◌', excited: '✦', existential: '◉',
};

const MOOD_COLORS: Record<Mood, string> = {
  happy: 'green', grinding: 'yellow', frustrated: 'red', zen: 'cyan', sleepy: 'gray', excited: 'white', existential: 'magenta',
};

function statBar(value: number, max: number, width: number, color: string): string {
  const filled = max > 0 ? Math.min(width, Math.round((value / max) * width)) : 0;
  const bar = ansiColor('▓'.repeat(filled), color) + ansiDim('░'.repeat(width - filled));
  return bar;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function renderProfilePage(buf: FrameBuffer, rows: number, cols: number, companion: CompanionState): void {
  const innerWidth = COMPANION_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - COMPANION_WIDTH) / 2));

  const unlockedCount = companion.achievements.length;
  const totalAchievements = ACHIEVEMENTS.length;

  const endH = Math.floor(companion.stats.endurance / 3_600_000);

  const intensity = companion.debugMood?.scores[companion.mood] ?? 0;
  const face = getMoodFace(companion.mood, intensity);
  const moodColor = MOOD_COLORS[companion.mood];
  const moodIcon = MOOD_ICONS[companion.mood];
  const faceColored = ansiColor(`(${face})`, moodColor, true);

  const repoNicknames = Object.values(companion.repos)
    .map(r => r.nickname)
    .filter((n): n is string => n !== null);
  const repoDisplay = repoNicknames.length > 0 ? ansiDim(` "${repoNicknames[0]}"`) : '';

  const barW = 18;

  // XP progress within current level
  const { xpIntoLevel, xpForNextLevel } = computeLevelProgress(companion.xp);
  const xpBar = statBar(xpIntoLevel, xpForNextLevel, 20, 'cyan');

  // Most recent achievement
  const lastAchievement = companion.achievements.length > 0
    ? companion.achievements[companion.achievements.length - 1]
    : null;
  const lastDef = lastAchievement
    ? ACHIEVEMENTS.find(a => a.id === lastAchievement.id)
    : null;

  const contentLines: string[] = [];

  // Face + mood
  contentLines.push(`  ${faceColored} .${repoDisplay}`.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  // Level + title
  contentLines.push(`  ${ansiColor(`Lv ${companion.level}`, 'cyan', true)}  ${ansiBold(companion.title)}`.padEnd(innerWidth));
  contentLines.push(`  ${xpBar}  ${ansiDim(`${companion.xp} xp`)}`.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  // Mood
  contentLines.push(`  ${ansiColor(moodIcon, moodColor)} ${ansiColor(companion.mood, moodColor)}`.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  // Stats with colored bars
  contentLines.push(`  ${ansiColor('STR', 'red')} ${String(companion.stats.strength).padStart(4)}  ${statBar(companion.stats.strength, 100, barW, 'red')}`.padEnd(innerWidth));
  contentLines.push(`  ${ansiColor('END', 'yellow')} ${String(endH + 'h').padStart(4)}  ${statBar(endH, 500, barW, 'yellow')}`.padEnd(innerWidth));
  contentLines.push(`  ${ansiColor('WIS', 'blue')} ${String(companion.stats.wisdom).padStart(4)}  ${statBar(companion.stats.wisdom, 50, barW, 'blue')}`.padEnd(innerWidth));
  contentLines.push(`  ${ansiColor('PAT', 'magenta')} ${String(companion.stats.patience).padStart(4)}  ${statBar(companion.stats.patience, 200, barW, 'magenta')}`.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  // Achievement
  if (lastDef) {
    contentLines.push(`  ${ansiColor('★', 'yellow')} ${lastDef.name}  ${ansiDim(`${unlockedCount}/${totalAchievements}`)}`.padEnd(innerWidth));
  } else {
    contentLines.push(`  ${ansiDim(`◇ ${unlockedCount}/${totalAchievements} achievements`)}`.padEnd(innerWidth));
  }

  contentLines.push(' '.padEnd(innerWidth));

  // Commentary — word-wrapped, styled
  if (companion.lastCommentary) {
    const raw = companion.lastCommentary.text;
    const wrapped = wrapText(raw, innerWidth - 6);
    contentLines.push(`  ${ansiDim('┊')} ${ansiColor(wrapped[0] ?? '', 'white')}`.padEnd(innerWidth));
    for (let i = 1; i < wrapped.length; i++) {
      contentLines.push(`  ${ansiDim('┊')} ${ansiColor(wrapped[i] ?? '', 'white')}`.padEnd(innerWidth));
    }
  }

  contentLines.push(' '.padEnd(innerWidth));
  contentLines.push(`  ${ansiDim('tab → badges  ? → stat guide')}`.padEnd(innerWidth));

  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, COMPANION_WIDTH, height, 'cyan');

  writeClipped(buf, x + 1, y + 1, ansiColor('  COMPANION  (esc to close)'.padEnd(innerWidth), 'cyan', true), innerWidth);
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }
}

// ─── Badge Gallery Page ──────────────────────────────────────────────────────

const GALLERY_WIDTH = 50;

let _badgeScroll = 0;

export function badgeListScrollUp(): void { _badgeScroll = Math.max(0, _badgeScroll - 1); }
export function badgeListScrollDown(): void { _badgeScroll++; }

function renderBadgesPage(buf: FrameBuffer, rows: number, cols: number, companion: CompanionState): void {
  if (!_gallery) _gallery = createBadgeGallery(companion.achievements);
  const gallery = _gallery;

  const innerWidth = GALLERY_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - GALLERY_WIDTH) / 2));

  const unlockedCount = companion.achievements.length;
  const totalAchievements = ACHIEVEMENTS.length;

  // Render current badge card
  const currentDef = gallery.achievements[gallery.currentIndex]!;
  const currentUnlock = gallery.unlocked.get(currentDef.id) ?? null;
  const card = renderBadgeCard(currentDef, currentUnlock);

  const contentLines: string[] = [];

  // Badge card (centered within overlay)
  for (const cardLine of card.lines) {
    const stripped = cardLine.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, Math.floor((innerWidth - stripped.length) / 2));
    const padded = ' '.repeat(pad) + cardLine + ' '.repeat(Math.max(0, innerWidth - stripped.length - pad));
    contentLines.push(padded);
  }

  contentLines.push(' '.padEnd(innerWidth));

  // Navigation footer
  const navIdx = gallery.currentIndex + 1;
  const navTotal = gallery.total;
  const unlockLabel = currentUnlock !== null ? '  ✓ unlocked' : '  · locked';
  const navLine = `  ← ${navIdx}/${navTotal} →   ${unlockedCount}/${totalAchievements} earned${unlockLabel}`;
  contentLines.push(navLine.padEnd(innerWidth));

  contentLines.push(' '.padEnd(innerWidth));

  // Achievement checklist — scrollable, current badge highlighted
  const listStartIdx = contentLines.length;
  const maxListRows = Math.min(6, Math.max(4, (rows - 2) - 4 - listStartIdx - 2));
  const maxScroll = Math.max(0, gallery.total - maxListRows + 1);
  if (_badgeScroll > maxScroll) _badgeScroll = maxScroll;

  // Auto-scroll to keep current badge visible (iterative: indicators steal rows)
  if (gallery.currentIndex < _badgeScroll) _badgeScroll = gallery.currentIndex;
  for (let pass = 0; pass < 3; pass++) {
    const a = _badgeScroll > 0 ? 1 : 0;
    const b = _badgeScroll + maxListRows < gallery.total ? 1 : 0;
    const vis = maxListRows - a - b;
    if (gallery.currentIndex >= _badgeScroll + vis) {
      _badgeScroll = gallery.currentIndex - vis + 1;
    } else break;
  }
  if (_badgeScroll > maxScroll) _badgeScroll = maxScroll;

  const hasMoreAbove = _badgeScroll > 0;
  const hasMoreBelow = _badgeScroll + maxListRows < gallery.total;
  const itemRows = maxListRows - (hasMoreAbove ? 1 : 0) - (hasMoreBelow ? 1 : 0);

  if (hasMoreAbove) {
    contentLines.push(ansiDim(`  ↑ ${_badgeScroll} more`.padEnd(innerWidth)));
  }

  for (let i = 0; i < itemRows && (_badgeScroll + i) < gallery.total; i++) {
    const idx = _badgeScroll + i;
    const def = gallery.achievements[idx]!;
    const u = gallery.unlocked.has(def.id);
    const icon = u ? '✓' : '·';
    const isCurrent = idx === gallery.currentIndex;
    let line = `  ${icon} ${def.name}`.padEnd(innerWidth);
    if (isCurrent) line = ansiColor(line, 'cyan', false);
    else if (!u) line = ansiDim(line);
    contentLines.push(line);
  }

  if (hasMoreBelow) {
    const below = gallery.total - _badgeScroll - itemRows;
    contentLines.push(ansiDim(`  ↓ ${below} more`.padEnd(innerWidth)));
  }

  contentLines.push(' '.padEnd(innerWidth));
  contentLines.push(ansiDim('  tab → profile  ? → stat guide'.padEnd(innerWidth)));

  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, GALLERY_WIDTH, height, 'cyan');

  writeClipped(buf, x + 1, y + 1, ansiColor('  BADGES  (↑↓ navigate, esc close)'.padEnd(innerWidth), 'cyan', true), innerWidth);
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }
}

// ─── Stat Guide Page ─────────────────────────────────────────────────────────

function renderHelpPage(buf: FrameBuffer, rows: number, cols: number): void {
  const innerWidth = COMPANION_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - COMPANION_WIDTH) / 2));

  const divider = (label: string, color: string) => {
    const rest = innerWidth - label.length - 5;
    return `  ${ansiColor(label, color, true)} ${ansiDim('─'.repeat(Math.max(0, rest)))}`;
  };

  const contentLines: string[] = [];

  contentLines.push(divider('STR (Strength)', 'red'));
  contentLines.push('  +1 per completed session'.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('END (Endurance)', 'yellow'));
  contentLines.push('  Total active time across sessions'.padEnd(innerWidth));
  contentLines.push('  (displayed in hours)'.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('WIS (Wisdom)', 'blue'));
  contentLines.push('  +1 per efficient session'.padEnd(innerWidth));
  contentLines.push(ansiDim('  agents have <30% stddev in active').padEnd(innerWidth));
  contentLines.push(ansiDim('  time, 2+ agents required').padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('PAT (Patience)', 'magenta'));
  contentLines.push('  +cycles per completed session'.padEnd(innerWidth));
  contentLines.push(ansiDim('  +3 if validation mode').padEnd(innerWidth));
  contentLines.push(ansiDim('  +2 if completion mode').padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('XP & Level', 'cyan'));
  contentLines.push('  STR×80 + END/h×15 + WIS×40'.padEnd(innerWidth));
  contentLines.push('  + PAT×5'.padEnd(innerWidth));
  contentLines.push(ansiDim('  level: 150 base xp, ×1.35/lvl').padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('Mood', 'white'));
  contentLines.push('  Real-time scoring from signals:'.padEnd(innerWidth));
  contentLines.push(ansiDim('  time of day, idle time, crashes,').padEnd(innerWidth));
  contentLines.push(ansiDim('  streaks, session length, agents').padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(divider('Badges', 'yellow'));
  contentLines.push('  Milestones, session feats, time'.padEnd(innerWidth));
  contentLines.push('  patterns, and behavioral checks'.padEnd(innerWidth));
  contentLines.push(' '.padEnd(innerWidth));

  contentLines.push(ansiDim('  tab → back  ? → close'.padEnd(innerWidth)));

  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, COMPANION_WIDTH, height, 'cyan');

  writeClipped(buf, x + 1, y + 1, ansiColor('  STAT GUIDE  (? or esc to close)'.padEnd(innerWidth), 'cyan', true), innerWidth);
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }

  const trailingBlankRow = y + 3 + Math.min(contentLines.length, availableContentRows);
  if (trailingBlankRow < y + height - 1) {
    writeClipped(buf, x + 1, trailingBlankRow, ' '.padEnd(innerWidth), innerWidth);
  }
}

// ─── Companion Overlay Dispatcher ────────────────────────────────────────────

export function renderCompanionOverlay(buf: FrameBuffer, rows: number, cols: number, companion: CompanionState): void {
  if (_page === 'help') {
    renderHelpPage(buf, rows, cols);
  } else if (_page === 'badges') {
    renderBadgesPage(buf, rows, cols, companion);
  } else {
    renderProfilePage(buf, rows, cols, companion);
  }
}

export function renderCompanionDebugOverlay(buf: FrameBuffer, rows: number, cols: number, companion: CompanionState): void {
  const innerWidth = DEBUG_WIDTH - 2;
  const x = Math.max(0, Math.floor((cols - DEBUG_WIDTH) / 2));

  const intensity = companion.debugMood?.scores[companion.mood] ?? 0;
  const face = getMoodFace(companion.mood, intensity);
  const debug = companion.debugMood;

  const contentLines: string[] = [
    `  (${face})  mood: ${companion.mood}`.padEnd(innerWidth),
    ' '.padEnd(innerWidth),
  ];

  if (debug) {
    const { signals, scores } = debug;

    contentLines.push(ansiDim('  ── Signals ──'.padEnd(innerWidth)));
    contentLines.push(`  hourOfDay: ${signals.hourOfDay}`.padEnd(innerWidth));
    contentLines.push(`  sessionLengthMs: ${signals.sessionLengthMs}  (${Math.round(signals.sessionLengthMs / 60_000)}min)`.padEnd(innerWidth));
    contentLines.push(`  idleDurationMs: ${signals.idleDurationMs}  (${Math.round(signals.idleDurationMs / 60_000)}min)`.padEnd(innerWidth));
    contentLines.push(`  recentCrashes: ${signals.recentCrashes}`.padEnd(innerWidth));
    contentLines.push(`  cleanStreak: ${signals.cleanStreak}`.padEnd(innerWidth));
    contentLines.push(`  justCompleted: ${signals.justCompleted}`.padEnd(innerWidth));
    contentLines.push(`  justCrashed: ${signals.justCrashed}`.padEnd(innerWidth));
    contentLines.push(`  justLeveledUp: ${signals.justLeveledUp}`.padEnd(innerWidth));
    contentLines.push(' '.padEnd(innerWidth));

    contentLines.push(ansiDim('  ── Scores ──'.padEnd(innerWidth)));
    const moodOrder: Mood[] = ['happy', 'grinding', 'frustrated', 'zen', 'sleepy', 'excited', 'existential'];
    for (const mood of moodOrder) {
      const score = scores[mood] ?? 0;
      const bar = score > 0 ? ansiDim('█'.repeat(Math.min(Math.round(score / 5), 12))) : '';
      const marker = mood === debug.winner ? ' ◀' : '';
      contentLines.push(`  ${mood.padEnd(12)} ${String(score).padStart(3)} ${bar}${marker}`.padEnd(innerWidth));
    }
  } else {
    contentLines.push(ansiDim('  No mood signals yet'.padEnd(innerWidth)));
    contentLines.push(ansiDim('  (mood is time-of-day only)'.padEnd(innerWidth)));
  }

  contentLines.push(' '.padEnd(innerWidth));

  const height = Math.min(contentLines.length + 4, rows - 2);
  const y = Math.max(0, Math.floor((rows - height) / 2));

  drawBorder(buf, x, y, DEBUG_WIDTH, height, 'yellow');

  writeClipped(buf, x + 1, y + 1, ansiColor('  COMPANION DEBUG  (esc to close)'.padEnd(innerWidth), 'yellow', true), innerWidth);
  writeClipped(buf, x + 1, y + 2, ' '.padEnd(innerWidth), innerWidth);

  const availableContentRows = height - 4;
  for (let i = 0; i < Math.min(contentLines.length, availableContentRows); i++) {
    writeClipped(buf, x + 1, y + 3 + i, contentLines[i]!, innerWidth);
  }

  const trailingRow = y + 3 + Math.min(contentLines.length, availableContentRows);
  if (trailingRow < y + height - 1) {
    writeClipped(buf, x + 1, trailingRow, ' '.padEnd(innerWidth), innerWidth);
  }
}
