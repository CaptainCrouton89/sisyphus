# TUI (`src/tui/`)

Raw ANSI terminal UI for real-time session monitoring and control. No frameworks — frame-buffer with panel dirty-tracking and aggressive caching.

## Architecture

- **Frame-buffer pattern**: In-memory screen state, diffs against previous, writes only changed lines via ANSI escape sequences
- **Panel dirty tracking**: Each panel (tree, detail, logs, bottom) has an input fingerprint; skipped if unchanged
- **Render scheduling**: `requestRender()` deduplicates via `setImmediate` — poll, keypress, resize all coalesce to one render
- **Event loop**: Poll daemon every 2.5s; debounce session-change poll to 80ms (prevents poll storm during navigation)
- **`flushFrame` synchronized output**: Wraps every write in `\x1b[?2026h/l` (DEC mode 2026) to prevent tearing. Cursor-position suffix is emitted inside the block — writing cursor escapes outside `flushFrame` causes visible flicker.

## Files

- **`app.ts`** — Poll loop, `render()`, `InputActions` wiring; all module-level caches live here
- **`render.ts`** — Frame-buffer primitives (`createFrameBuffer`, `flushFrame`, `copyRows`) and ANSI helpers
- **`state.ts`** — `AppState`, `ThrottledScroll` (16ms throttle), cursor stabilization, render scheduling
- **`input.ts`** — Keyboard handlers, nvim bypass, compose mode; no direct tmux/clipboard imports
- **`panels/`** — Panel renderers; **`lib/`** — tree, format, tmux shell, socket client

## Key Constraints & Caching

- **`contentHeight = state.rows - 1`**: Single status row at bottom (notification + input bar removed in this refactor). The nvim resize formula in both `startApp` and `onResize` uses this same `-1` baseline; the formula then subtracts borders + `STATUS_ROW_COUNT` + separator. Mismatching the baseline causes nvim to resize on every cursor move.
- **`STATUS_ROW_COUNT = 2`**: Fixes status header height — both startup and `onResize` nvim resize formula must subtract this or nvim resizes on every cursor move.
- **`treeCacheKey` uses `expanded.size`** (not set contents): `${expanded.size}:${filteredSessions.length}:${selectedSession?.id}:${contextFiles.length}:${searchFilter}`. Collapsing one node and expanding another of the same size won't rebuild the tree.
- **Panel composition by concatenation**: Tree/detail/logs rows concatenated as fixed-width strings. All panels must produce exactly `contentHeight` rows or the frame tears.
- **`windowAlive` batch check**: Single `listAllWindowIds()` tmux call per poll; cached in `SessionSummary.windowAlive`. Render reads the cache — never spawns a subprocess during rendering.
- **`cachedReportBlocks` resolved in poll, not render**: `resolveReports()` is synchronous disk I/O; running it in `render()` blocks keypress processing. Keyed by `agent.id`.
- **`list` + `status` concurrent**: Both fire in `Promise.all`; `status` only when `selectedSessionId` is set; `paneAlive` sourced from `list` response's `windowAlive`, not a separate check.

## Input & Compose Mode

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` or `lib/clipboard.js` directly — callers inject them. Avoids circular deps; add new tmux ops to the `InputActions` interface, not as direct imports.
- **Nvim bypass** (`setRawBypass`): when nvim or compose mode is active, all raw stdin is intercepted before the normal key handler. `Tab` (0x09) is the escape key — exits nvim focus or cancels compose. If `nvimBridge.ready` is false mid-bypass, the bypass auto-deactivates and returns `false` (input re-processed normally).
- **Compose mode** (multi-line nvim input): writes a temp file to `$TMPDIR/sisyphus-nvim/`, opens it in the detail-pane nvim via `openComposeFile(tempFile, signalFile)`, then polls for `signalFile` every 100ms. Signal content `"cancel"` = user quit; any other content = submit. Fallback when nvim unavailable: `enterComposeMode()` returns `false` — caller then invokes `actions.editInPopup(cwd, editor)` which blocks on an external editor popup (e.g. tmux popup running `$EDITOR`). The inline input bar modes (`resume`, `continue`, `rollback`, `delete-confirm`, `spawn-agent`, `message-agent`, `shell-command`) no longer exist as `InputMode` values — all text entry uses compose or popup.
- **`prevNvimFile` / `composePrevNvimFile`**: On compose enter, `prevNvimFile` is saved to `composePrevNvimFile`. On cancel/submit, both are nulled — this forces the render loop to re-resolve and re-open the node's real file. Nulling only one of them breaks re-open.
- **NvimBridge auto-respawn**: Render detects `wasReady && !ready && !respawning` and calls `respawn()` async; `prevNvimFile` is nulled first to force file re-resolution after recovery. If `respawn()` rejects, `nvimEnabled` is permanently set to `false` (not retried).
- **`nvimEnabled` vs `nvimBridge`**: `nvimEnabled` is a persistent flag — `false` means disabled for the session lifetime (set when respawn fails). `nvimBridge` can be null if the bridge was never initialized. Always gate on both: `nvimEnabled && nvimBridge?.ready`.
- **`mergeCheckOrReload()` in poll**: Called after every successful poll when nvim is ready and `prevNvimFile` is set. Returns `'clean'` (notifies "Auto-merged external changes"), `'union'` (notifies "Auto-merged overlapping edits — review buffer"), or `null` (no-op/silent). Called in poll, not render, so it doesn't block the frame.
- **`autoExpandCycle`**: Only auto-manages cycle expansion if the user already expanded the session node (respects collapse intent). When a new cycle appears: collapses the previous cycle node, expands the latest.
- **`continue` is two-step**: sends `{ type: 'continue' }` first (resets daemon state), then `{ type: 'resume' }` with the optional message. Both must succeed; resume is skipped if `continue` returns an error. In compose path this is handled in `dispatchComposeAction`; in `editInPopup` fallback it's an inline async IIFE in `handleNavigateKey`.
- **`OPTIONAL_COMPOSE`** (set in `state.ts`): actions where empty content is allowed (`resume`, `continue`). All other compose actions reject empty submission and delete the signal file so nvim re-arms for retry without reopening.
- **Tab focus target**: Tab exits nvim bypass to `'logs'` if `showCombinedView` is active, otherwise `'tree'`. `h`/`←` from `logs` moves focus to `detail` and *re-activates* nvim bypass (if nvim ready) — it's not a pure focus change. Debugging "wrong pane focused after Tab/h" starts here.
- **`search` mode** (`/` key): live-updates `searchFilter` on every keystroke via `handleSearchKey`. `state.searchText` accumulates raw input; `state.searchFilter` is what the tree uses. Escape sets `searchFilter = null` and clears `searchText`; Enter locks the filter without clearing it. `search` mode is a sibling of `navigate`, not an `INPUT_MODE` — it has its own handler branch in the main dispatch.
- **Companion state** (`CompanionState` from `shared/companion-types.ts`): read from `companionPath()` with mtime-based caching (`_companionMtime`). On cache hit, returns cached value even if `statSync` or `readFileSync` throws. `companion-overlay` (`<leader>c`): Escape dismisses; Tab cycles pages; hjkl/arrows navigate only when on `badges` page; all other keys are silently ignored (not dismissed). `companion-debug` (`<leader>D`): any keypress dismisses. Companion data is also passed to `renderTreePanel` on every render — tree panel may render companion-derived UI elements. Overlay dirty-tracking fingerprints `lastCommentary.timestamp`, `xp`, and `debugMood.winner:score` — changes in other companion fields don't trigger re-render.
- **`w` vs `o` key**: `w` targets the session's tmux window (falls back to `openClaudeResumeSession` which creates a new detached tmux session when the window is dead or session is completed). `o` opens an in-place popup to resume the *specific* agent's or cycle's Claude session — cursor must be on an agent, report, or cycle node.
- **`r` vs `x` key**: `r` spawns a *new* agent clone (name = `{original.name}-retry`, same `agentType`/`instruction`) — the original agent is untouched and both run in parallel. `x` calls `restart-agent` (kills the existing pane, respawns same `agentId`).
- **`expandSessionLatestCycle` side effect**: Pressing `→` or Enter to expand a collapsed session node also auto-expands the latest cycle inside it — one keypress expands two tree levels. Auto-expand is skipped if there are no cycles yet.

## State Derived in Render

- **`selectedSessionId` set from cursor**: Derived as `cursorNode.sessionId` inside `render()`, not by input handlers. On change: resets `detailScroll`, `logsScroll`, `cachedDetailLines`, `cachedLogsLines`, `prevNvimFile`, and fires the 80ms debounced poll. Debugging "wrong session shown" issues starts here, not in input handling.
- **`resolveNvimFile` → `openTabFiles` (multi-file tabs)**: Returns `{ files: NvimFile[] }`; `prevNvimFile` key is `files.map(f => f.path).join('|')`. `nvimEditable` = `files.some(f => !f.readonly)`. Not called during compose — nvim holds the temp file; calling it would override the buffer mid-session.
- **`showCombinedView` layout**: Detail = `floor(remaining * 0.6)`, logs = remainder of panel width. When disabled, `logsRect`/`logsRows` are `null` and skipped in row concatenation — panel row count must still equal `contentHeight`.
- **`resolveEditor()` priority**: `config.editor` (`.sisyphus/config.json`) → `$EDITOR` env → `'nvim'`.
- **`sliceDisplayCols(restoreState=true)`**: When slicing a suffix (start > 0), ANSI SGR sequences before the slice point are accumulated and prepended to the result. Both `writeAt` and `writeClipped` pass `restoreState=true` for the suffix argument — without this, writing a colored span into the middle of a row that already had colors set causes the suffix text to lose its color.
