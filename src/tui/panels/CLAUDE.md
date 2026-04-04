# Panels (`src/tui/panels/`)

Individual panel renderers for the frame-buffer TUI. Each panel is responsible for rendering a specific screen region.

## Two Rendering Contracts

**`RenderedPanel` contract** (`detail.ts`, `logs.ts`): takes `AppState` + bounds, returns array of ANSI strings cached via `RenderedCache`, dirty-tracked by input fingerprint.

**Direct FrameBuffer contract** (`tree.ts`, `overlays.ts`, `bottom.ts`): takes `FrameBuffer` + `Rect` (or `rows`/`cols`/`y`), writes via `drawBorder` + `writeClipped`, returns `void`. No caching, no dirty tracking — always re-painted every frame.

Panels are called from `render.ts` → `renderFrame()`. Frame-buffer diffs output and writes only changed lines.

## Non-Obvious `tree.ts` Behaviors

- **Companion reservation is dynamic**: `companionRows = 2 + commentaryLineCount` (blank + face row + wrapped commentary). `maxVisible = Math.max(1, innerH - companionRows)`. Fixed `innerH - 2` overflows when commentary wraps to multiple lines.
- **Companion face row shifts up**: pinned at `y + h - 2 - commentaryCount`, not always `y + h - 2`. Commentary renders below the face row, inside the panel border.
- **Companion render slots**: `renderCompanion(companion, ['face', 'boulder'], { maxWidth: innerW, color: true })` — `'commentary'` is NOT in the slot list; commentary is word-wrapped manually and written as separate `\x1b[2m` rows below.
- **Scroll indicator row theft**: `availRows` is decremented for each indicator shown (top and/or bottom). Node slot count is dynamic — the bottom indicator occupies the row that would otherwise hold the last visible node.
- **`bottomMore` uses `maxVisible`, not `availRows`**: The "↓ N more" count is `nodes.length - scrollOffset - maxVisible`, computed before indicator adjustment. When only the bottom indicator is shown it understates by 1; when both are shown it understates by 2 (both indicators steal rows from `availRows` but neither is subtracted from `maxVisible`).
- **Selection rendering**: selected + focused = bold + inverse video (`\x1b[7m`); selected + unfocused = bold only, no inverse — `inverse` is an empty string, not omitted.

## Non-Obvious `overlays.ts` Behaviors

- **Anchor strategy**: leader/copy overlays are bottom-right anchored (`cols - WIDTH - 1`, `rows - HEIGHT - 2`). Help/companion/debug are screen-centered with height dynamically clamped to `rows - 2`.
- **Height formula**: all centered overlays use `contentLines.length + 4` (2 border rows + title row + blank separator). `availableContentRows = height - 4`. Trailing blank writes only if a slot remains — it's not guaranteed.
- **Companion overlay has three pages** (`CompanionPage = 'profile' | 'badges' | 'help'`): Tab cycles `profile ↔ badges`; `?` jumps to `'help'` (stat guide) from either. `'help'` is not in the Tab cycle — Tab or `?` from `help` returns to `_prevPage`. `companionOverlayNextPage()` handles both the Tab cycle and help-page return; `companionOverlayShowHelp()` / `companionOverlayDismissHelp()` are the `?`-key entry/exit exports.
- **`_prevPage` module state**: set by `companionOverlayShowHelp()` before entering `'help'`. `closeBadgeGallery()` resets `_page` to `'profile'` but does NOT reset `_prevPage` — stale `_prevPage = 'badges'` can persist after close, harmless only because `_page` is already `'profile'` at that point.
- **`getCompanionPage()`**: exported so input handlers can gate hjkl/arrow navigation to the `'badges'` page and route `?` differently per page.
- **`_gallery` lazy init**: created from `companion.achievements` on first badges-page render; not recreated if already set. Stale if achievements change mid-session — `closeBadgeGallery()` forces recreation.
- **Badge list auto-scroll** (`_badgeScroll`): uses a 3-pass convergence loop (not a simple clamp) to keep `gallery.currentIndex` visible. Each pass recalculates scroll indicators; stealing a row for "↓ N more" can push `currentIndex` out of the new visible window, requiring another adjustment — 3 passes converges without needing a while loop. `maxListRows = Math.min(6, Math.max(4, rows - 2 - 4 - listStartIdx - 2))` — terminal height drives it.
- **Badge card centering**: ANSI sequences are stripped before measuring visual width; padding is computed from stripped length, then applied around the original colored string.
- **XP bar shows within-level progress**: `computeLevelProgress(companion.xp)` returns `{ xpIntoLevel, xpForNextLevel }` — non-linear scaling (150 base XP, ×1.35/level). Bar max is `xpForNextLevel`, not a fixed constant. `computeLevelProgress` is imported from `daemon/companion.js` — the only panel with a direct daemon-layer import; changes to level scaling require updating that file.
- **Stat bar maxes are fixed**: `strength` 100, `endurance` 500h, `wisdom` 50, `patience` 200. Bars saturate silently beyond these.
- **`GALLERY_WIDTH = 50`** vs `COMPANION_WIDTH = 52`: badges page uses its own narrower constant — profile/help pages are 2 cols wider. Changing badge card layout must account for this difference.
- **Companion stats units**: `endurance` is milliseconds, displayed as hours (`/ 3_600_000`). `patience` is a plain count (cycles + lifecycle bonuses), displayed directly.
- **`wrapText` assumes plain text**: no ANSI stripping before measuring word lengths. `lastCommentary.text` must be plain — ANSI sequences in commentary break word-wrap calculations.
- **`renderCompanionDebugOverlay`**: separate function (not a flag on `renderCompanionOverlay`). Shows `debugMood` signals and per-mood scores with block-character bar charts. `debug` is null until the daemon has computed at least one mood update — overlay shows two lines: "No mood signals yet" + "(mood is time-of-day only)".

## Non-Obvious `detail.ts` Behaviors

- **Three renderers, one file**: `detail.ts` exports `renderDetailRows`, `renderDigestRows`, and `renderLogsRows` — each with its own cache key + cached lines on `AppState` (`detailCacheKey`/`cachedDetailLines`, `digestCacheKey`/`cachedDigestLines`, `logsCacheKey`/`cachedLogsLines`). There is no `renderFlowRows` — cycle flow is embedded via `buildCycleFlowLines`, called from both `buildSessionLines` (detail panel, session/cycle/agent cursor) and `renderDigestRows` (right panel when `rightPanelMode === 'digest'`). Changing flow rendering affects both panels. `renderDigestRows` uses `focusPane === 'logs'` for focus highlight even though it renders in the right pane — counterintuitive but correct.
- **`report-detail` mode bypasses `cursorNode`**: at the top of `renderDetailRows`, `state.mode === 'report-detail'` reads `state.targetAgentId` and returns immediately — `cursorNode` is never consulted. All other modes fall through to cursor-based dispatch.
- **`borderColor` is computed twice**: inside the switch (cache-miss path, written inline) and again after the cache block (lines 728–741, always runs). The post-switch recomputation is the authoritative one — without it, cache hits would always use `'gray'`. When adding new node types that need a custom border, add the logic to **both** locations.
- **`detailReportBlocks` vs `reportBlocks`**: `DetailContext` carries two separate report collections. `reportBlocks` is used only in `report-detail` mode (full-screen view). `detailReportBlocks` is used for inline display within agent nodes and report nodes in normal mode. They're resolved separately in `render.ts` — fixing a missing report in one view doesn't fix the other.
- **Cache key uses content lengths, not hashes**: `state.planContent.length`, `goalContent.length`, `strategyContent.length` are included but not their content. Edits that preserve character count (e.g., replacing one word with another of equal length) won't invalidate the detail cache.
- **Report node reverse-index lookup**: `detailReportBlocks` is stored reverse-chronologically. Finding the block for `reportNode.reportIndex` (an index into `agent.reports`, chronological) requires `detailReportBlocks.find((_b, i) => agent.reports.length - 1 - i === reportIdx)`. Getting this formula wrong silently displays the wrong report.
- **Strategy replaces plan, never coexists**: `buildSessionLines` renders `▎ ◈ STRATEGY` when `strategyContent` is truthy, `▎ ◈ PLAN` otherwise — the two sections are mutually exclusive. An empty string (not absent) `strategyContent` shows the plan.
- **`buildPlanLines` truncation overwrites**: when `lines.length >= maxLines && totalContentLines > maxLines`, the truncation indicator replaces `lines[lines.length - 1]`. The second guard (`totalContentLines` = raw non-blank line count) means content that wraps past `maxLines` formatted lines but has few raw lines won't show the indicator. Both current call sites pass `99999` so this guard never fires in normal usage.
- **`renderLogsRows` cache key uses cycle numbers, not content**: `logsCycles.length + cycle numbers joined` — editing a cycle log file without adding/removing cycles won't invalidate the logs panel.
- **`renderDigestRows` cache key differs from detail**: uses `JSON.stringify(digest)` (full content) for the digest portion, but also includes `agentStatuses` (`agents.map(a => \`${a.id}:${a.status}\`).join(',')`) and `lastCycle?.nextPrompt?.length`. Plan/strategy lengths are **not** in the digest cache key — unlike `renderDetailRows`. Also embeds `buildCycleFlowLines` unconditionally when `session` is set; `flowExpanded` is in the key.
- **`cursorNode.sessionId !== session.id` guard**: returns empty panel when the poll debounce hasn't fired after cursor navigation. This prevents showing stale session content during rapid scrolling; "blank detail pane right after moving cursor" is expected, not a bug.

## Non-Obvious `bottom.ts` Behaviors

- **Silent modes**: `renderStatusLine` returns immediately (renders nothing) in `report-detail` and `compose` modes — status bar goes blank, not hidden. Debugging a missing status bar starts here.
- **Notification vs error priority**: `notification !== null` is checked before `error !== null`. Notifications render bold yellow (`1;33`) with regex-selected icon (`✕`/`✓`/`ℹ`). Errors render red (`\x1b[31m`) with a plain `⚠` — no icon selection, only shown when notification is null.
- **Mode-specific branches run before focus-pane hints**: After notification/error checks, `search` / `leader` / `copy-menu` / `help` each render their own inline banner. `search` emits a fake block cursor via `\x1b[7m \x1b[0m` appended to `searchText` — it's not a real terminal cursor. `leader` is purple, `copy-menu` cyan, `help` yellow. All four branches are only reached when both notification and error are null.
- **`focusPane === 'logs'` and `focusPane === 'detail'` share identical hints**: same scroll/back/toggle/flow hint string regardless of which right-pane renderer is active.
- **`cursorNodeType` gating**: `context-file` nodes inject `[e]dit  [⏎] open` into the tree-focused hint string; all other node types omit it. Caller must pass the correct type or hints will be wrong.
