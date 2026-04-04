import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMoodFace, getMoodTmuxColor } from '../shared/companion-render.js';
import { loadCompanion } from './companion.js';
import { loadConfig } from '../shared/config.js';
import { execSafe } from '../shared/exec.js';
import { shellQuote } from '../shared/shell.js';

const POPUP_WIDTH = 38;
const INNER_WIDTH = POPUP_WIDTH - 4; // 2 border + 2 padding each side
const POPUP_DURATION = 15;
const POPUP_TMP = join(tmpdir(), 'sisyphus-popup.txt');
const POPUP_SCRIPT = join(tmpdir(), 'sisyphus-popup.sh');

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

export function showCommentaryPopup(text: string): void {
  try {
    const config = loadConfig(process.cwd());
    if (config.companionPopup === false) return;

    const companion = loadCompanion();
    const intensity = companion.debugMood?.scores[companion.mood] ?? 0;
    const face = getMoodFace(companion.mood, intensity);
    const moodColor = getMoodTmuxColor(companion.mood);

    const lines = wrapText(text, INNER_WIDTH);
    const height = Math.max(lines.length + 2, 5);

    // Pad inner width for the dismiss hint, centered
    const hint = '[enter to close]';
    const hintPad = Math.max(0, Math.floor((INNER_WIDTH - hint.length) / 2));
    const hintLine = ' '.repeat(hintPad + 2) + hint;

    const content = '\n' + lines.map(l => `  ${l}`).join('\n') + '\n\n' + hintLine + '\n';
    const contentHeight = Math.max(lines.length + 4, 5); // text + blank + hint + padding
    writeFileSync(POPUP_TMP, content);

    const title = ` (${face}) `;
    const titleArg = `-T ${shellQuote(title)}`;
    const script = `#!/bin/sh
printf '\\033[?25l'
cat ${shellQuote(POPUP_TMP)}
stty -echo 2>/dev/null
while IFS= read -r -n1 -t ${POPUP_DURATION} k; do
  if [ -z "$k" ]; then
    break
  else
    tmux display-popup ${titleArg} -S "fg=white"
    sleep 0.15
    tmux display-popup ${titleArg} -S "fg=${moodColor}"
  fi
done
`;
    writeFileSync(POPUP_SCRIPT, script, { mode: 0o755 });
    // Daemon runs outside tmux (launchd) — must target clients explicitly
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
        `-T ${shellQuote(title)}`,
        `-S "fg=${moodColor}"`,
        `-s "fg=${moodColor}"`,
        `-x ${x} -y 0`,
        `-w ${POPUP_WIDTH} -h ${contentHeight}`,
        shellQuote(POPUP_SCRIPT),
      ].join(' ');
      execSafe(`tmux display-popup ${args}`);
    }
  } catch { /* non-fatal */ }
}
