import type { InteractionKind } from './types.js';
import { basename, dirname } from 'node:path';

export type { InteractionKind as InboxItemKind };
export type { InboxItem } from '@crouton-kit/humanloop';

export function coerceKind(k: InteractionKind | undefined): InteractionKind {
  if (k !== undefined) return k;
  return 'validation';
}

/**
 * Derive the sisyphus sessionId from an InboxItem's dir path.
 * dir structure: <cwd>/.sisyphus/sessions/<sessionId>/context/ask/<askId>
 * Three dirname calls climb from <askId> → ask → context → <sessionId>
 */
export function sessionIdFromDir(dir: string): string {
  return basename(dirname(dirname(dirname(dir))));
}

/**
 * Derive cwd from an InboxItem's dir path.
 * Four dirname calls climb from <askId> → ask → context → <sessionId> → sessions → .sisyphus → cwd
 */
export function cwdFromDir(dir: string): string {
  // dir/<askId> → sessions/<sessionId>/context/ask
  // dirname x4: sessions/<sessionId>/context/ask → sessions/<sessionId>/context → sessions/<sessionId> → sessions → .sisyphus
  // dirname x5: .sisyphus → cwd
  return dirname(dirname(dirname(dirname(dirname(dir)))));
}

/**
 * Derive the askId from an InboxItem's dir path (final path component).
 */
export function askIdFromDir(dir: string): string {
  return basename(dir);
}
