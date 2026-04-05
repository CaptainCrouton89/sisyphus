# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Fix 3 review findings in the TUI and CLI layers of the Companion feature. Review report: reports/agent-010-final.md

## Context
Read context/plan-companion.md for type contracts and module interfaces.
Read context/explore-companion-integration.md for integration surface.
Read src/tui/CLAUDE.md, src/tui/panels/CLAUDE.md, src/shared/CLAUDE.md for conventions.

**IMPORTANT architecture rule from CLAUDE.md: TUI and CLI must NEVER import from src/daemon/. Only import from src/shared/.**

## Tasks

### 1. Fix ACHIEVEMENTS cross-layer import (Finding #1 — consumer side)
**Files:** `src/tui/panels/overlays.ts`, `src/cli/commands/companion.ts`

A parallel agent is moving the ACHIEVEMENTS array to `src/shared/companion-types.ts`. Update these consumer imports:

- `src/tui/panels/overlays.ts` line 5: change `import { ACHIEVEMENTS } from '../../daemon/companion.js'` → `import { ACHIEVEMENTS } from '../../shared/companion-types.js'`
- `src/cli/commands/companion.ts` line 4: change `import { ACHIEVEMENTS } from '../../daemon/companion.js'` → `import { ACHIEVEMENTS } from '../../shared/companion-types.js'`

### 2. Fix loadCompanion cross-layer import + per-frame disk reads (Findings #1 + #2)
**Files:** `src/tui/app.ts`, `src/tui/panels/tree.ts`

Currently `tree.ts:3` and `app.ts:42` import `loadCompanion` from `../../daemon/companion.js` — architecture violation + called on every render frame.

**Fix approach:**
1. In `app.ts`: Move `loadCompanion` import to `../../shared/companion-types.js` — WAIT, `loadCompanion` is NOT in shared. Instead, create a lightweight module-level companion cache in app.ts itself:
   - Import `loadCompanion` from a new location OR inline the file read (companion.json is just `readFileSync + JSON.parse`)
   - Actually the cleanest approach: move `loadCompanion()` to `src/shared/companion-types.ts` since it's just file I/O using `companionPath()` (already in shared/paths.ts). It has NO daemon dependencies. Read the current implementation in `src/daemon/companion.ts` (the `loadCompanion` function) — it does readFileSync + JSON.parse + forward-compat field fills. All types are already in companion-types.ts.
   - BUT a parallel agent owns `src/daemon/companion.ts`. So instead: **create the cache without importing from daemon.** Read `companionPath()` (from shared/paths.ts) + `readFileSync` + `JSON.parse` + try/catch that returns a fallback. Wrap it in a cached reader that reloads every 2.5s (matching poll interval).

   Here's the approach: Add a module-level cache in app.ts:
   ```typescript
   import { companionPath } from '../shared/paths.js';
   import type { CompanionState } from '../shared/companion-types.js';
   import { readFileSync } from 'node:fs';

   let cachedCompanion: CompanionState | null = null;
   let companionMtime = 0;

   function getCompanion(): CompanionState | null {
     try {
       const { mtimeMs } = statSync(companionPath());
       if (cachedCompanion && mtimeMs === companionMtime) return cachedCompanion;
       companionMtime = mtimeMs;
       cachedCompanion = JSON.parse(readFileSync(companionPath(), 'utf-8'));
       return cachedCompanion;
     } catch { return cachedCompanion; }
   }
   ```

2. In `app.ts`: Replace the direct `loadCompanion()` calls with `getCompanion()`. The companion overlay render (~line 599) currently calls loadCompanion() — use the cache instead.

3. In `tree.ts:3`: Remove `import { loadCompanion } from '../../daemon/companion.js'`. Instead, have `renderTreePanel` receive the companion state as a parameter (or import the cache from app.ts). The cleanest approach: add `companion?: CompanionState` to renderTreePanel params, pass it from app.ts's cached value. Update the call site in app.ts to pass `getCompanion()` to the tree render call.

4. Remove the `loadCompanion` import from `app.ts` line 42.

### 3. Fix overlay dirty-tracking (Finding #7)
**File:** `src/tui/app.ts` (~line 480-485)

The overlayDirty fingerprint is just the mode string. When the companion overlay is open, companion state changes won't trigger re-render. 

Fix: Include a companion state fingerprint in the overlay dirty check when mode is `companion-overlay`. Something like:
```typescript
const companionFP = state.mode === 'companion-overlay'
  ? `${getCompanion()?.lastCommentary?.timestamp ?? ''}:${getCompanion()?.xp ?? 0}`
  : '';
const overlayMode = ...; // existing logic
const overlayInputs = `${overlayMode}:${companionFP}`;
```
Then use `overlayInputs` instead of bare `overlayMode` for the dirty check.

### 4. Update panels/CLAUDE.md
**File:** `src/tui/panels/CLAUDE.md`
This file documents the cross-layer dependency as a known issue. After your fix, update it to remove the known-issue notes about `ACHIEVEMENTS` and `loadCompanion()` imports.

## Verification
After all changes: `npm run build && npm test` must both pass.

## Done condition
Cross-layer imports eliminated, companion cached at poll frequency (not per-frame), overlay dirty tracking includes companion fingerprint. Report what you changed and any decisions made.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
