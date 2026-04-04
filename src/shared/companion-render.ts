import stringWidth from 'string-width';
import type {
  CompanionState,
  CompanionField,
  CompanionRenderOpts,
  CompanionStats,
  Mood,
} from './companion-types.js';

// --- Display-width-aware string slice ---

/** Slice a plain-text string to fit within `maxCols` display columns. */
function sliceToWidth(s: string, maxCols: number): string {
  let w = 0;
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const cw = stringWidth(ch);
    if (w + cw > maxCols) break;
    w += cw;
    i += ch.length;
  }
  return s.slice(0, i);
}

// --- Idle hobbies ---

export const IDLE_HOBBIES: string[] = [
  'reading Camus',
  'stacking pebbles',
  'watching clouds',
  'sketching boulders',
  'counting stars',
  'writing haiku',
  'practicing zen',
  'studying geology',
  'polishing rocks',
  'mapping the hill',
  'resting',
  'stargazing',
  'whittling',
  'collecting fossils',
  'napping on summit',
  'journaling',
  'stretching',
  'humming',
  'doodling',
  'tending moss',
  'making tea',
  'reading Myth of Sisyphus',
  'reorganizing rocks',
  'people watching',
  'whistling',
];

// --- Spinner verbs ---

export const SPINNER_VERBS: string[] = [
  // physical
  'pushing',
  'hauling',
  'heaving',
  'toiling',
  'straining',
  'trudging',
  'laboring',
  'rolling',
  'ascending',
  'dragging',
  'shouldering',
  'hoisting',
  'lugging',
  'schlepping',
  'grinding',
  'lifting',
  'bracing',
  'climbing',
  'leaning in',
  'digging in',
  // philosophical
  'philosophizing',
  'contemplating',
  'pondering',
  'musing',
  'ruminating',
  'reflecting',
  'meditating',
  'wondering',
  'questioning',
  'theorizing',
  'considering',
  'deliberating',
  'introspecting',
  'cogitating',
  'brooding',
  // endurance
  'persevering',
  'enduring',
  'persisting',
  'sustaining',
  'weathering',
  'carrying on',
  'pressing on',
  'holding steady',
  'keeping at it',
  'not stopping',
  // light/silly
  'napping',
  'procrastinating',
  'daydreaming',
  'vibing',
  'winging it',
  'hoping',
  'improvising',
  'making do',
  'whistling',
];

// --- Base form ---
//
// Returns a template with two placeholders:
//   FACE      — replaced by getMoodFace() in renderCompanion
//   {BOULDER} — replaced by composeLine() with the agent-count-driven boulder
//
// No literal boulder characters are embedded here.  The previous design embedded
// them (`.`, `o`, `O`, `OO`, `@`) which caused splitBodyAndBoulder to either
// discard multi-char boulders (OO) or corrupt output when the dynamic boulder
// didn't match the embedded one.

export function getBaseForm(level: number): string {
  if (level <= 2) return '(FACE) {BOULDER}';
  if (level <= 4) return '(FACE)/ {BOULDER}';
  if (level <= 7) return '/(FACE)/ {BOULDER}';
  if (level <= 11) return '\\(FACE)/ {BOULDER}';
  if (level <= 19) return 'ᕦ(FACE)ᕤ {BOULDER}';
  return '♛ᕦ(FACE)ᕤ {BOULDER}';
}

// --- Mood face ---
//
// Each mood has three intensity tiers driven by the winning mood score:
//   mild (score < 30), moderate (30–70), intense (> 70)

const MOOD_FACES: Record<Mood, [string, string, string]> = {
  happy:       ['^.^',    '^‿^',    '✧‿✧'],
  grinding:    ['>.<',    '>_<',    'ò.ó'],
  frustrated:  ['>.<#',   'ಠ_ಠ',   'ಠ益ಠ'],
  zen:         ['‾.‾',    '‾‿‾',   '˘‿˘'],
  sleepy:      ['-.-)zzZ','-_-)zzZ','˘.˘)zzZ'],
  excited:     ['*o*',    '*◡*',   '✦◡✦'],
  existential: ['◉_◉',   '⊙_⊙',   '◉‸◉'],
};

export function getMoodFace(mood: Mood, intensity: number = 0): string {
  const faces = MOOD_FACES[mood];
  if (!faces) throw new Error(`Unknown mood: ${mood as string}`);
  const tier = intensity < 30 ? 0 : intensity <= 70 ? 1 : 2;
  return faces[tier];
}

// --- Stat cosmetics ---

export function getStatCosmetics(stats: CompanionStats): string[] {
  const cosmetics: string[] = [];
  if (stats.wisdom > 5) cosmetics.push('wisps');
  if (stats.endurance > 36_000_000) cosmetics.push('trail');
  if (stats.patience > 50) cosmetics.push('zen-prefix');
  return cosmetics;
}

// --- Boulder form ---

export function getBoulderForm(agentCount?: number, repoNickname?: string): string {
  let boulder: string;
  if (agentCount === undefined || agentCount <= 0) {
    boulder = '';
  } else if (agentCount <= 2) {
    boulder = 'o';
  } else if (agentCount <= 6) {
    boulder = 'O';
  } else if (agentCount <= 15) {
    boulder = '◉';
  } else if (agentCount <= 35) {
    boulder = '@';
  } else {
    boulder = '@@';
  }
  if (repoNickname !== undefined) {
    boulder = `${boulder} "${repoNickname}"`;
  }
  return boulder;
}

// --- composeLine ---
//
// body has already had FACE replaced with the mood face, and still contains
// the {BOULDER} placeholder from getBaseForm.
// composeLine applies cosmetics to `boulder`, then substitutes {BOULDER}.

export function composeLine(
  body: string,
  cosmetics: string[],
  boulder: string,
): string {
  let b = boulder;

  let hasZenPrefix = false;

  if (boulder !== '') {
    for (const c of cosmetics) {
      switch (c) {
        case 'wisps':
          b = `~${b}~`;
          break;
        case 'trail':
          b = `${b} ...`;
          break;
        case 'zen-prefix':
          hasZenPrefix = true;
          break;
      }
    }
  } else {
    // Zen prefix is a character trait, not boulder-related
    if (cosmetics.includes('zen-prefix')) hasZenPrefix = true;
  }

  let line = b === ''
    ? body.replace(' {BOULDER}', '')
    : body.replace('{BOULDER}', b);

  if (hasZenPrefix) line = `☯ ${line}`;

  return line;
}

// --- Color helpers ---

type AnsiCode = number;
type TmuxColor = string;

interface MoodColor {
  ansi: AnsiCode;
  tmux: TmuxColor;
}

const MOOD_COLORS: Record<Mood, MoodColor> = {
  happy:       { ansi: 32,  tmux: 'green' },
  grinding:    { ansi: 33,  tmux: 'yellow' },
  frustrated:  { ansi: 31,  tmux: 'red' },
  zen:         { ansi: 36,  tmux: 'cyan' },
  sleepy:      { ansi: 90,  tmux: 'colour245' },
  excited:     { ansi: 97,  tmux: 'white' },
  existential: { ansi: 35,  tmux: 'magenta' },
};

export function getMoodTmuxColor(mood: Mood): string {
  return MOOD_COLORS[mood].tmux;
}

export function getMoodAnsiCode(mood: Mood): number {
  return MOOD_COLORS[mood].ansi;
}

function colorize(text: string, mood: Mood, tmux: boolean): string {
  const { ansi, tmux: tmuxColor } = MOOD_COLORS[mood];
  if (tmux) {
    return `#[fg=${tmuxColor}]${text}#[fg=default]`;
  }
  return `\x1b[${ansi}m${text}\x1b[0m`;
}

// --- Stat summary string ---

function statSummary(stats: CompanionStats): string {
  const endH = Math.floor(stats.endurance / 3_600_000);
  return `STR:${stats.strength} END:${endH}h WIS:${stats.wisdom} PAT:${stats.patience}`;
}

// --- Main renderer ---

export function renderCompanion(
  companion: CompanionState,
  fields: CompanionField[],
  opts?: CompanionRenderOpts,
): string {
  const hasFace = fields.includes('face');
  const hasBoulder = fields.includes('boulder');

  const repoNickname = opts?.repoPath !== undefined
    ? companion.repos[opts.repoPath]?.nickname ?? undefined
    : undefined;

  const boulder = getBoulderForm(opts?.agentCount, repoNickname);
  const cosmetics = getStatCosmetics(companion.stats);

  let facePart: string | null = null;
  let boulderOnlyPart: string | null = null;

  if (hasFace) {
    const baseForm = getBaseForm(companion.level);
    const intensity = companion.debugMood?.scores[companion.mood] ?? 0;
    const face = getMoodFace(companion.mood, intensity);
    const bodyWithFace = baseForm.replace('FACE', face);
    facePart = composeLine(bodyWithFace, cosmetics, boulder);
  } else if (hasBoulder) {
    // Boulder standalone (unusual)
    boulderOnlyPart = boulder;
  }

  let commentary = fields.includes('commentary')
    ? (companion.lastCommentary?.text ?? '')
    : null;

  const parts: string[] = [];

  for (const field of fields) {
    switch (field) {
      case 'face':
        if (facePart !== null) parts.push(facePart);
        break;
      case 'boulder':
        if (!hasFace && boulderOnlyPart !== null) parts.push(boulderOnlyPart);
        // If face included, boulder is already embedded — skip
        break;
      case 'title':
        parts.push(companion.title);
        break;
      case 'commentary':
        if (commentary !== null) parts.push(commentary);
        break;
      case 'mood':
        parts.push(`[${companion.mood}]`);
        break;
      case 'level':
        parts.push(`Lv ${companion.level}`);
        break;
      case 'stats':
        parts.push(statSummary(companion.stats));
        break;
      case 'achievements':
        parts.push(`${companion.achievements.length} achievements`);
        break;
      case 'verb': {
        const idx = (opts?.verbIndex ?? companion.spinnerVerbIndex) % SPINNER_VERBS.length;
        parts.push(SPINNER_VERBS[idx]!);
        break;
      }
      case 'hobby': {
        // Rotate hourly based on hour + companion level as seed for variety
        const hobbyIdx = (new Date().getHours() + companion.level) % IDLE_HOBBIES.length;
        parts.push(IDLE_HOBBIES[hobbyIdx]!);
        break;
      }
    }
  }

  // Apply maxWidth: truncate commentary first, then right-truncate.
  // Use display width (stringWidth) not .length — faces like ಠ益ಠ contain
  // wide characters where .length < displayWidth, causing writeClipped to
  // hard-clip the line without an ellipsis.
  if (opts?.maxWidth !== undefined) {
    const maxWidth = opts.maxWidth;
    const joined = parts.join('  ');
    const joinedWidth = stringWidth(joined);
    if (joinedWidth > maxWidth && commentary !== null && commentary.length > 0) {
      // Shorten commentary progressively
      const commentaryIdx = parts.indexOf(commentary);
      if (commentaryIdx !== -1) {
        const commentaryWidth = stringWidth(commentary);
        const overhead = joinedWidth - commentaryWidth;
        const available = maxWidth - overhead - 2; // account for double-space
        if (available < 0) {
          parts[commentaryIdx] = '';
        } else {
          parts[commentaryIdx] = sliceToWidth(commentary, available);
        }
        commentary = parts[commentaryIdx];
      }
    }
    const result = parts.filter(p => p.length > 0).join('  ');
    const resultWidth = stringWidth(result);
    const final = resultWidth > maxWidth
      ? sliceToWidth(result, maxWidth - 1) + '…'
      : result;

    return applyColor(final, fields, facePart, companion.mood, opts);
  }

  const result = parts.filter(p => p.length > 0).join('  ');
  return applyColor(result, fields, facePart, companion.mood, opts);
}

function applyColor(
  result: string,
  fields: CompanionField[],
  facePart: string | null,
  mood: Mood,
  opts?: CompanionRenderOpts,
): string {
  const useColor = opts?.color === true || opts?.tmuxFormat === true;
  if (!useColor || facePart === null || !fields.includes('face')) return result;

  const tmux = opts?.tmuxFormat === true;
  const coloredFace = colorize(facePart, mood, tmux);
  return result.replace(facePart, coloredFace);
}
