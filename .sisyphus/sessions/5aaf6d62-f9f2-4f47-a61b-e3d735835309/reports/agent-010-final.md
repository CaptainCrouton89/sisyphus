# Companion Integration Review — 8 Validated Findings

Reviewed 16 modified files across daemon, CLI, TUI, and shared layers. 5 review sub-agents (reuse, quality, efficiency, compliance, security) produced 13 deduplicated findings. 3 validation agents confirmed 8, dismissed 2 (security dropped per user request).

---

## HIGH — Architecture / Performance

### 1. Cross-layer imports: TUI/CLI import from daemon module
**Files:** `src/tui/panels/tree.ts:3`, `src/tui/panels/overlays.ts:5`, `src/tui/app.ts:42`, `src/cli/commands/companion.ts:4`
**Rule:** Root CLAUDE.md architecture + `src/shared/CLAUDE.md:58` "Never import from src/daemon/"
**Evidence:** All four files import `loadCompanion` or `ACHIEVEMENTS` from `src/daemon/companion.ts`. `ACHIEVEMENTS` is pure static data (no daemon deps) — belongs in `src/shared/`. `loadCompanion` is file I/O that should be fetched via socket protocol and cached in AppState, not called directly.
**Fix:** Move `ACHIEVEMENTS` to `src/shared/companion-types.ts`. Replace direct `loadCompanion()` calls in TUI with protocol fetch during poll phase + AppState cache.

### 2. loadCompanion() synchronous disk read on every render frame
**Files:** `src/tui/panels/tree.ts:252`, `src/tui/app.ts:598-601`
**Rule:** `src/tui/panels/CLAUDE.md` "No async I/O — panels read from cached AppState"
**Evidence:** `loadCompanion()` calls `readFileSync` + `JSON.parse` on `~/.sisyphus/companion.json`. In tree.ts this fires on every dirty frame (keypresses, cursor moves, poll cycles). No caching, no fingerprint guard. The panels/CLAUDE.md itself acknowledges this as a known issue.
**Fix:** Fetch companion state during TUI poll phase, store on AppState. Panels read from cache only.

### 3. Duplicated fire-and-forget commentary pattern (5 instances)
**File:** `src/daemon/session-manager.ts:115-123, 500-509, 512-521, 528-537, 710-718`
**Evidence:** Five near-identical 8-line blocks: `generateCommentary(event, ...).then(text => { loadCompanion(); c.lastCommentary = {...}; saveCompanion(c); [flashCompanion(text);] }).catch(() => {})`. Only differences: event string and optional flash call. Each copy must independently maintain the reload-before-save pattern.
**Fix:** Extract `fireCommentary(event, companion, context?, flash?)` helper in companion.ts or companion-commentary.ts.

---

## MEDIUM — Correctness / Efficiency

### 4. Broken idle duration calculation — sleepy mood unreachable
**File:** `src/daemon/pane-monitor.ts:155,191-194`
**Evidence:** `lastPollTime = now` is set at line 155. Then `idleDurationMs = Date.now() - lastPollTime` at line 193 always yields ~0ms (microseconds since assignment). Sleepy thresholds require >1,800,000ms (30 min). The `sleepy` mood state can never be reached via the idle signal path.
**Fix:** Track idle start time separately from poll time. Set it when `trackedSessions` first becomes empty, clear when sessions resume.

### 5. recentRestarts always 0 — dead mood signal
**File:** `src/daemon/pane-monitor.ts:172,198`
**Evidence:** `recentRestarts` initialized to 0, never incremented. `computeMood()` at `companion.ts:173` multiplies by 15 for frustrated score — always adds 0. CLAUDE.md documents this as known/unwired.
**Fix:** Either wire it (count agent restarts from session state) or remove the field from MoodSignals and computeMood.

### 6. Unconditional companion load+compute every poll tick when idle
**File:** `src/daemon/pane-monitor.ts:166-214`
**Evidence:** The mood recomputation block (loadCompanion + signal building + computeMood + conditional save) runs every 5s with no guard on whether any sessions are tracked. When daemon is idle: disk read + JSON parse + mood scoring + potential disk write every 5 seconds for no reason.
**Fix:** Guard the block with `if (trackedSessions.size > 0)` or similar.

### 7. Companion overlay dirty-tracking incomplete
**File:** `src/tui/app.ts:480,485`
**Evidence:** `overlayDirty` fingerprint is just the mode string (`'companion-overlay'`). While overlay is open, companion state changes (XP gain, commentary, mood shift) won't trigger re-render — user sees stale data until they close/reopen. Events like session-complete fire during active sessions when user might have overlay open.
**Fix:** Include companion fingerprint (e.g., `lastCommentary?.timestamp + xp`) in overlay dirty tracking.

### 8. Redundant loadCompanion() on every status bar write
**File:** `src/daemon/status-bar.ts:173`
**Evidence:** `writeStatusBar()` calls `loadCompanion()` every 5s from poll loop. Combined with finding #6, the companion file is read twice per poll cycle from the daemon process. Low impact at 5s interval but entirely avoidable.
**Fix:** Pass companion state from the poll context or cache at module level.

---

## DISMISSED (2)

- **Stringly-typed event names** — `LastCommentary.event` is typed as `CommentaryEvent` union, not `string`. TypeScript catches typos at compile time.
- **Stats formatting duplication** — Overlay, CLI, and shared render use different output formats (multi-line vs compact). The shared `statSummary()` is private and not directly reusable. Nitpick.