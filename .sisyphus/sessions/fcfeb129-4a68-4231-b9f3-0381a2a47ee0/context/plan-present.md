# Implementation Plan: `sisyphus present`

## Overview

`sisyphus present <file.md>` renders a termrender-flavored markdown file, opens it in neovim for user annotation, diffs user edits against the original, and prints an annotated version to stdout. Purely CLI-side — no daemon, no protocol types.

---

## Files to Change

### 1. `src/cli/commands/present.ts` (NEW)

Full implementation. See structure below.

### 2. `src/cli/index.ts` (MODIFY)

Add two lines after the existing `registerReview` import/call:

```ts
// Line ~43 (imports section, after registerReview):
import { registerPresent } from './commands/present.js';

// Line ~93 (after registerReview(program)):
registerPresent(program);
```

---

## Implementation Order

1. Write `present.ts` skeleton with CLI registration
2. Add termrender invocation + error handling
3. Add temp file write + tmux/neovim blocking pattern
4. Add ANSI stripping
5. Add diff + annotation logic
6. Print to stdout + cleanup
7. Register in `index.ts`

---

## `present.ts` Full Structure

```ts
import type { Command } from 'commander';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { shellQuote } from '../../shared/shell.js';

export function registerPresent(program: Command): void {
  program
    .command('present')
    .description('Render a termrender markdown file, open in neovim for annotation, and print annotated output')
    .argument('<file>', 'Path to termrender-flavored markdown file')
    .option('--width <n>', 'Pass --width to termrender')
    .action(async (file: string, opts: { width?: string }) => {
      await runPresent(file, opts);
    });
}

async function runPresent(file: string, opts: { width?: string }): Promise<void> {
  const inputPath = resolve(file);

  // 1. Run termrender
  const renderedContent = renderFile(inputPath, opts.width);

  // 2. Write to temp file
  const tempId = randomBytes(4).toString('hex');
  const tempPath = join(tmpdir(), `sisyphus-present-${tempId}.txt`);
  writeFileSync(tempPath, renderedContent, 'utf-8');

  // 3. Open in neovim via tmux, block until done
  try {
    const channel = `present-${tempId}`;
    const cmd = `nvim ${shellQuote(tempPath)}; tmux wait-for -S ${shellQuote(channel)}; exit`;
    const windowId = execSync(
      `tmux new-window -n "present" -P -F "#{window_id}"`,
      { encoding: 'utf-8' },
    ).trim();
    execSync(`tmux send-keys -t ${shellQuote(windowId)} ${shellQuote(cmd)} Enter`);
    execSync(`tmux wait-for ${shellQuote(channel)}`);

    // 4. Read edited content
    const editedContent = readFileSync(tempPath, 'utf-8');

    // 5. Strip ANSI, diff, annotate
    const originalPlain = stripAnsi(renderedContent);
    const editedPlain = stripAnsi(editedContent);
    const annotated = annotateEdits(originalPlain, editedPlain);

    // 6. Print to stdout
    process.stdout.write(annotated);
    if (!annotated.endsWith('\n')) process.stdout.write('\n');
  } finally {
    // 7. Cleanup
    try { unlinkSync(tempPath); } catch { /* already gone */ }
  }
}
```

---

## Termrender Invocation

```ts
function renderFile(inputPath: string, width?: string): string {
  const args = [inputPath];
  if (width) args.push('--width', width);

  try {
    return execFileSync('termrender', args, { encoding: 'utf-8' });
  } catch (err: unknown) {
    const execErr = err as { code?: string; message?: string };
    if (execErr.code === 'ENOENT') {
      console.error('Error: termrender is not installed. Install it and try again.');
      console.error('  npm install -g termrender  (or your package manager)');
      process.exit(1);
    }
    console.error(`Error: termrender failed: ${execErr.message ?? String(err)}`);
    process.exit(1);
  }
}
```

---

## ANSI Strip Regex

Apply all three patterns in sequence:

```ts
function stripAnsi(text: string): string {
  return text
    // SGR + all CSI sequences (colors, cursor movement, erase, etc.)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // OSC sequences (window title, hyperlinks, etc.) — BEL-terminated
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // OSC sequences — ST-terminated (\x1b\\)
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
    // Charset designations
    .replace(/\x1b[()][AB012]/g, '')
    // Standalone ESC sequences (e.g. \x1b=, \x1b>)
    .replace(/\x1b[^[\]()]/g, '');
}
```

---

## Diff + Annotation Algorithm

### Goal
- Lines the user **inserted** (new, not in original): wrapped in `<!-- user: --> ... <!-- /user -->`
- Lines the user **modified** (changed existing line): also wrapped
- Lines the user **deleted**: omitted (not in edited version, so naturally absent)
- Contiguous blocks of insertions/modifications: wrapped as a block (single comment pair)

### Algorithm: Myers/LCS line diff

Use a straightforward LCS (Longest Common Subsequence) on lines to classify each line in the edited version as either:
- `keep` — present in both original and edited (matched)
- `insert` or `modify` — new in edited (no match in original)

```ts
function annotateEdits(original: string, edited: string): string {
  if (original === edited) return edited;

  const origLines = original.split('\n');
  const editLines = edited.split('\n');

  // Build LCS table
  const m = origLines.length;
  const n = editLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (origLines[i] === editLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Trace back to classify each edited line
  // 'keep' = line exists in original (matched), 'user' = new/changed
  const tags: Array<'keep' | 'user'> = [];
  let i = 0, j = 0;
  while (j < n) {
    if (i < m && origLines[i] === editLines[j]) {
      tags.push('keep');
      i++; j++;
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
      // original line deleted — advance orig only
      i++;
    } else {
      // edited line is new or modified
      tags.push('user');
      j++;
    }
  }

  // Wrap contiguous 'user' blocks in comment tags
  const output: string[] = [];
  let k = 0;
  while (k < editLines.length) {
    if (tags[k] === 'user') {
      const blockStart = k;
      while (k < editLines.length && tags[k] === 'user') k++;
      output.push('<!-- user: -->');
      output.push(...editLines.slice(blockStart, k));
      output.push('<!-- /user -->');
    } else {
      output.push(editLines[k]);
      k++;
    }
  }

  return output.join('\n');
}
```

### Notes on modifications vs insertions
The LCS approach treats any line not matched to the original as "user content." This means:
- Pure insertions (new lines between original lines) → tagged `user` ✓
- Modified lines (user changed text of an existing line) → the modified version is unmatched → tagged `user` ✓  
- The original version of a modified line just disappears (it was "deleted" from original's perspective), which is correct behavior since we're annotating the *edited* output
- Empty-string lines are compared literally (blank lines match blank lines)

### Edge case: no changes
If `original === edited` after ANSI stripping, return edited verbatim with no comment tags.

---

## Edge Cases

### termrender not installed
`execFileSync` throws with `code === 'ENOENT'`. Catch and print a clear install message, then `process.exit(1)`. Do NOT leave temp file behind (nothing written yet at this point, so no cleanup needed).

### User quits neovim without saving (`:q!`)
The temp file is untouched — `editedContent` equals `renderedContent` after ANSI strip. `annotateEdits` will find `original === edited` and return the plain text with no annotations. This is correct: the user made no changes.

### User saves empty file (`:wq` on emptied buffer)
LCS against empty `editLines` produces all `keep` assignments for nothing, all original lines are "deleted." Output is empty string. This is expected behavior — user cleared the file.

### Empty input file / termrender outputs nothing
`renderedContent` is empty string. Temp file is empty. Neovim opens with empty buffer. If user saves empty: no-change path. If user adds content: all lines tagged `user`.

### termrender exits non-zero (render error)
`execFileSync` throws with non-ENOENT error. Caught, message printed, `process.exit(1)`. No temp file written.

### Not inside tmux
`tmux new-window` will fail. The execSync throws. Uncaught, propagates to top-level `parseAsync` handler which prints `err.message` and exits 1. Optionally: add explicit check for `process.env.TMUX` before running, with a clear error: `"Error: sisyphus present requires a tmux session"`.

### Temp file cleanup on error
`try/finally` around tmux/neovim block ensures `unlinkSync` is called even if an exception is thrown mid-way.

### LCS performance
For typical termrender output (< 500 lines), the O(m×n) LCS table is trivially fast. For very large files (thousands of lines), it's still fine in practice. No optimization needed.

---

## Registration in `index.ts`

Add after line 43 (imports):
```ts
import { registerPresent } from './commands/present.js';
```

Add after line 93 (`registerReview(program)`):
```ts
registerPresent(program);
```

`sortSubcommands: false` means position in list matters. `present` should appear near the end with other utility/content commands, after `registerReview`.

---

## Dependencies

All imports are from Node stdlib + existing project utilities:
- `node:fs` — `writeFileSync`, `readFileSync`, `unlinkSync`
- `node:child_process` — `execSync`, `execFileSync`
- `node:crypto` — `randomBytes`
- `node:path` — `resolve`, `join`
- `node:os` — `tmpdir`
- `../../shared/shell.js` — `shellQuote` (already used in review.ts)

No new dependencies.
