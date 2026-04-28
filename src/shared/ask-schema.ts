import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Deck } from './types.js';

// ── zod v4 building blocks ────────────────────────────────────────────────────
// v4 notes: .nonempty() → .min(1); error messages use {error: 'string'} per check.

export const interactionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  shortcut: z.string().optional(),
});

const interactionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/, { error: 'interaction id must match /^[A-Za-z0-9_-]+$/' }).min(1).max(64),
  title: z.string().min(1, { error: 'title must be non-empty' }),
  subtitle: z.string().min(1, { error: 'subtitle must be non-empty when present' }).optional(),
  body: z.string().optional(),
  bodyPath: z.string().optional(),
  options: z.array(interactionOptionSchema),
  allowFreetext: z.boolean().optional(),
  freetextLabel: z.string().optional(),
  kind: z.enum(['notify', 'validation', 'decision', 'context', 'error']).optional(),
});

const deckSourceSchema = z.object({
  sessionName: z.string().optional(),
  askedBy: z.string().optional(),
  blockedSince: z.string().optional(),
});

export const deckSchema = z.object({
  title: z.string().optional(),
  source: deckSourceSchema.optional(),
  interactions: z.array(interactionSchema).min(1, { error: 'interactions[] must be non-empty' }),
}).superRefine((input, ctx) => {
  const seen = new Map<string, number>();
  for (let i = 0; i < input.interactions.length; i++) {
    const interaction = input.interactions[i];
    if (interaction.body !== undefined && interaction.bodyPath !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'body and bodyPath are mutually exclusive',
        path: ['interactions', i],
      });
    }
    const prev = seen.get(interaction.id);
    if (prev !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate interaction id "${interaction.id}" at indices ${prev} and ${i}`,
        path: ['interactions', i, 'id'],
      });
    }
    seen.set(interaction.id, i);
  }
});

// ── termrender invocation ─────────────────────────────────────────────────────
function runTermrenderCheck(content: string): { ok: true } | { ok: false; error: string } {
  const result = spawnSync('termrender', ['--check'], {
    input: content,
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (result.error) {
    return { ok: false, error: `termrender invocation failed: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, error: `termrender --check exited ${result.status}: ${result.stderr.trim()}` };
  }
  return { ok: true };
}

// ── C2 bodyPath defense + inlining ────────────────────────────────────────────
function inlineBodyPath(deckPath: string, bodyPath: string): string {
  const deckDir = dirname(deckPath);
  const joined = resolve(deckDir, bodyPath);

  // STEP 1: existence + lstat BEFORE realpath to catch symlinks and directories.
  if (!existsSync(joined)) {
    throw new Error(`bodyPath does not exist: ${bodyPath}`);
  }
  const stat = lstatSync(joined);
  if (!stat.isFile()) {
    // Catches symlinks, directories, FIFOs — lstat does not follow symlinks.
    throw new Error(`bodyPath must be a regular file: ${bodyPath}`);
  }

  // STEP 2: realpath both sides, prefix-check (defense-in-depth for .. traversal).
  // realpathSync is safe here: lstat already confirmed the path exists.
  const realResolved = realpathSync(joined);
  const realDeckDir = realpathSync(deckDir);
  const prefix = realDeckDir + sep;
  if (realResolved !== realDeckDir && !realResolved.startsWith(prefix)) {
    throw new Error(`bodyPath escapes deck directory (outside): ${bodyPath}`);
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
      const check = runTermrenderCheck(body);
      if (!check.ok) {
        throw new Error(check.error);
      }
    }
    // Drop bodyPath from persisted decisions.json (recipe §1.8).
    const { bodyPath: _drop, ...rest } = interaction;
    return body !== undefined ? { ...rest, body } : { ...rest };
  });

  return { ...parsed, interactions: inlinedInteractions };
}
