import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMoodFace, getMoodTmuxColor } from '../shared/companion-render.js';
import { loadCompanion } from './companion.js';
import { loadConfig } from '../shared/config.js';
import { execSafe } from '../shared/exec.js';
import { shellQuote } from '../shared/shell.js';

const POPUP_WIDTH = 38;
const INNER_WIDTH = POPUP_WIDTH - 6; // 2 border + 2 padding each side
const POPUP_DURATION = 15;
const POPUP_TMP_PREFIX = join(tmpdir(), 'sisyphus-popup');
const POPUP_SCRIPT = join(tmpdir(), 'sisyphus-popup.sh');

export interface PopupPage {
  text: string;
  title?: string; // overrides default face title
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Show a single commentary popup (convenience wrapper). */
export function showCommentaryPopup(text: string): void {
  showCommentaryPopupQueue([{ text }]);
}

/** Show one or more popup pages in sequence. Enter advances; last Enter closes. */
export function showCommentaryPopupQueue(pages: PopupPage[]): void {
  if (pages.length === 0) return;

  try {
    const config = loadConfig(process.cwd());
    if (config.companionPopup === false) return;

    const companion = loadCompanion();
    const intensity = companion.debugMood?.scores[companion.mood] ?? 0;
    const face = getMoodFace(companion.mood, intensity);
    const moodColor = getMoodTmuxColor(companion.mood);
    const defaultTitle = ` (${face}) `;

    let maxContentHeight = 0;

    // Write each page's content file
    for (let i = 0; i < pages.length; i++) {
      const lines = wrapText(pages[i].text, INNER_WIDTH);
      const isLast = i === pages.length - 1;
      const hint = isLast ? '[enter to close]' : '[enter: next]';
      const hintPad = Math.max(0, Math.floor((INNER_WIDTH - hint.length) / 2));
      const hintLine = ' '.repeat(hintPad + 2) + hint;
      const content = '\n\n' + lines.map(l => `  ${l}`).join('\n') + '\n\n' + hintLine + '\n';
      const contentLineCount = content.split('\n').length - 1; // trailing \n artifact
      const contentHeight = Math.max(contentLineCount + 2, 5);
      if (contentHeight > maxContentHeight) maxContentHeight = contentHeight;
      writeFileSync(`${POPUP_TMP_PREFIX}-${i}.txt`, content);
    }

    // Build per-page title case block for shell
    const titleCases = pages.map((p, i) => {
      const t = p.title ?? defaultTitle;
      return `    ${i}) TITLE=${shellQuote(t)} ;;`;
    }).join('\n');

    const initialTitle = pages[0].title ?? defaultTitle;

    const script = `#!/bin/sh
printf '\\033[?25l'
stty -echo 2>/dev/null
PAGE=0
TOTAL=${pages.length}
TITLE=${shellQuote(initialTitle)}

get_title() {
  case $PAGE in
${titleCases}
  esac
}

show_page() {
  get_title
  tmux display-popup -T "$TITLE" -S "fg=${moodColor}" -s "fg=${moodColor}"
  printf '\\033[2J\\033[H'
  cat ${shellQuote(POPUP_TMP_PREFIX)}-$PAGE.txt
}

show_page
while IFS= read -r -n1 -t ${POPUP_DURATION} k; do
  if [ -z "$k" ]; then
    PAGE=$((PAGE + 1))
    if [ $PAGE -ge $TOTAL ]; then
      break
    fi
    show_page
  else
    tmux display-popup -T "$TITLE" -S "fg=white"
    sleep 0.15
    tmux display-popup -T "$TITLE" -S "fg=${moodColor}"
  fi
done
`;
    writeFileSync(POPUP_SCRIPT, script, { mode: 0o755 });

    // Daemon runs outside tmux — target each attached client
    const clientsRaw = execSafe('tmux list-clients -F "#{client_name} #{client_width}"');
    if (!clientsRaw) return;
    for (const line of clientsRaw.split('\n').filter(Boolean)) {
      const lastSpace = line.lastIndexOf(' ');
      const client = line.slice(0, lastSpace);
      const clientWidth = parseInt(line.slice(lastSpace + 1), 10);
      if (!clientWidth) continue;
      const x = Math.max(0, clientWidth - POPUP_WIDTH);
      const args = [
        `-c ${shellQuote(client)}`,
        '-E -b rounded',
        `-T ${shellQuote(initialTitle)}`,
        `-S "fg=${moodColor}"`,
        `-s "fg=${moodColor}"`,
        `-x ${x} -y 0`,
        `-w ${POPUP_WIDTH} -h ${maxContentHeight}`,
        shellQuote(POPUP_SCRIPT),
      ].join(' ');
      execSafe(`tmux display-popup ${args}`);
    }
  } catch { /* non-fatal */ }
}
