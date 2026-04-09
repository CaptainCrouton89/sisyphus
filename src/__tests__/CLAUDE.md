# CLAUDE.md — src/__tests__

## Two isolation patterns — don't mix them

Tests that exercise **state/daemon logic** pass a `testDir` (mkdtemp) directly into functions like `createSession(id, goal, testDir)`. The path helpers (`statePath`, `sessionDir`) accept a root argument, so no env mutation is needed.

Tests that exercise **install/onboard logic** (`installBeginCommand`, `installAutopsyCommand`) instead mutate `process.env.HOME` in `beforeEach`/`afterEach`. These functions accept an explicit source path (injectable via fixture file), but resolve the destination (`~/.claude/commands/sisyphus/`) from `HOME` at call time — no injectable dest arg. Always restore `HOME` even when it was originally `undefined` (use `delete process.env['HOME']`, not `= undefined`).

The return value has three fields: `installed: true` means the file exists on disk (including pre-existing); `autoInstalled: true` means it was written *this call*; `path` is the resolved destination. `installed: true, autoInstalled: false` is the idempotent "already there" path — not an error. The lazy-install path in `ensureDaemonInstalled` depends on this distinction to avoid false failure reports on repeat calls. Both commands write to the same `~/.claude/commands/sisyphus/` directory under different filenames — the coexistence test in `install-begin.test.ts` guards against one silently overwriting the other.

`install-begin.test.ts` tests both `installBeginCommand` **and** `installAutopsyCommand` despite its name. It exists because both were originally only called from `sisyphus setup` — users who ran `sisyphus start` directly never got the slash commands. The fix wires both into `ensureDaemonInstalled`; these tests pin the install functions' behavior so that wiring has a stable contract. Idempotency tests use a sentinel-mutation pattern: write extra content to the dest file after the first install, then verify the second call leaves it untouched — return value alone can't prove no rewrite occurred.

## Each test file is a regression pin

Test comments name the specific bug and date. Before deleting or weakening an assertion, confirm the original failure mode is covered elsewhere — these tests exist precisely because the code path was silently broken before.

## Runner

`node:test` native runner (no Jest/Vitest). Run a single file with:
```
node --import tsx --test src/__tests__/<file>.test.ts
```
Tests don't share global state — `beforeEach`/`afterEach` are scoped to their `describe` block, not the module, except in `state.test.ts` where they're declared at module scope (applies to all `describe` blocks in that file).
