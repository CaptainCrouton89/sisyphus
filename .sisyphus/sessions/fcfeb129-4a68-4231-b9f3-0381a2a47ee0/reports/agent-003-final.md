# Review: `sisyphus present` Implementation

## Critical

### 1. `--no-wait` deletes temp file while neovim is still editing it
**File:** `src/cli/commands/present.ts:59,74-83`

The `return` at line 59 (inside the `--no-wait` branch) does **not** skip the `finally` block. This is fundamental JS semantics: `finally` always runs after `return` in a `try` block. The comment on line 75 ("skipped in --no-wait mode since we returned above") is wrong.

**Impact:** When `--no-wait` is used, `unlinkSync` deletes the temp file immediately while neovim is still open in the tmux window. Unix inode semantics keep the buffer readable, but `:w` will fail because the path is gone. The user's annotations are trapped in a buffer with no writable path — data loss scenario.

**Fix:** Guard cleanup with a flag:
```ts
let skipCleanup = false;
try {
  // ...
  if (opts.wait === false) {
    skipCleanup = true;
    return;
  }
  // ...
} finally {
  if (!skipCleanup) {
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch {}
  }
}
```

---

## High

### 2. Should use `exec()` from `src/shared/exec.ts` instead of raw `execSync`
**File:** `src/cli/commands/present.ts:51,55,63`

All three `execSync` calls are direct candidates for the shared `exec()` helper:
- Line 51: captures `windowId` with `.trim()` — exactly what `exec()` does
- Lines 55, 63: return values discarded — `exec()` works fine

Bypassing the shared helper loses `EXEC_ENV` PATH augmentation (Homebrew, nix, user-local bin paths), which is relevant since `tmux` may not be on a stripped `PATH` in launchd/daemon environments. This is a correctness risk, not just style.

---

## Medium

### 3. Redundant first regex in `stripAnsi`
**File:** `src/cli/commands/present.ts:94`

Line 94 (`\x1b\[[0-9;]*m`) is a strict subset of line 96 (`\x1b\[[0-9;]*[A-Za-z]`). Every SGR sequence matched by the first regex is also matched by the second. The first pass is dead code — remove it.

### 4. Temp file written before TMUX check
**File:** `src/cli/commands/present.ts:39-46`

`writeFileSync(tempPath, rendered)` runs unconditionally at line 39, but the non-tmux branch at line 42 never reads the file — it prints the in-memory `rendered` variable directly to stdout, then `finally` deletes the file. Move the temp file write below the TMUX guard to avoid a wasted write+delete cycle. Also aligns with the CLAUDE.md convention "avoid side effects before confirming validity."

### 5. tmux window pattern duplicated with `review.ts`
**File:** `src/cli/commands/present.ts:48-63` vs `src/cli/commands/review.ts:147-167`

Identical 4-step sequence (generate channel → build cmd string → `tmux new-window` → `tmux send-keys` → optional `tmux wait-for`) copy-pasted between the two files. A shared helper in `src/cli/` or `src/shared/` would eliminate this duplication. Not blocking for this PR, but worth noting as technical debt.