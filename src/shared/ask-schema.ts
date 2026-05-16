import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { checkMarkdown, deckSchema, parseDeck as humanloopParseDeck, validateDeck } from '@crouton-kit/humanloop';
import type { Deck } from './types.js';

export { deckSchema, validateDeck };

// ── C2 bodyPath defense + inlining ────────────────────────────────────────────
function inlineBodyPath(deckPath: string, bodyPath: string): string {
  const deckDir = dirname(deckPath);
  const joined = resolve(deckDir, bodyPath);

  // STEP 1: existence + lstat BEFORE realpath to catch symlinks and directories.
  if (!existsSync(joined)) {
    throw new Error(
      `bodyPath does not exist: '${bodyPath}' (resolved against deck dir '${deckDir}'). bodyPath is interpreted relative to the deck JSON's directory; place the body file there and use a relative path (e.g. "completion-summary.md").`,
    );
  }
  const stat = lstatSync(joined);
  if (!stat.isFile()) {
    // Catches symlinks, directories, FIFOs — lstat does not follow symlinks.
    throw new Error(`bodyPath must be a regular file (not a symlink, directory, or special file): ${bodyPath}`);
  }

  // STEP 2: realpath both sides, prefix-check (defense-in-depth for .. traversal).
  // realpathSync is safe here: lstat already confirmed the path exists.
  const realResolved = realpathSync(joined);
  const realDeckDir = realpathSync(deckDir);
  const prefix = realDeckDir + sep;
  if (realResolved !== realDeckDir && !realResolved.startsWith(prefix)) {
    throw new Error(
      `bodyPath '${bodyPath}' escapes the deck's directory ('${realDeckDir}'). bodyPath is resolved relative to the deck JSON file and must stay inside its directory (no '..', absolute paths pointing elsewhere, or symlinks out). Fix: write the deck JSON next to the body file (e.g. both inside $SISYPHUS_SESSION_DIR/context/) and use a relative path like "completion-summary.md".`,
    );
  }

  // STEP 3: read. lstat confirmed regular file; realpath confirmed in-tree.
  return readFileSync(joined, 'utf-8');
}

// ── public entry point ────────────────────────────────────────────────────────
export function parseDeck(deckPath: string): Deck {
  const raw = readFileSync(deckPath, 'utf-8');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('deck is not valid JSON');
  }

  const parsed = deckSchema.parse(json);

  const inlinedInteractions = parsed.interactions.map(interaction => {
    let body = interaction.body;
    if (interaction.bodyPath !== undefined) {
      body = inlineBodyPath(deckPath, interaction.bodyPath);
    }
    if (body !== undefined) {
      const check = checkMarkdown(body);
      if (!check.ok) {
        throw new Error(check.error);
      }
    }
    // Drop bodyPath from persisted deck.json (recipe §1.8).
    const { bodyPath: _drop, ...rest } = interaction;
    return body !== undefined ? { ...rest, body } : { ...rest };
  });

  return { ...parsed, interactions: inlinedInteractions };
}

export { humanloopParseDeck };
