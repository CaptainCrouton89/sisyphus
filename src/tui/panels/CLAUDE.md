# Panels (`src/tui/panels/`)

Individual panel renderers for the frame-buffer TUI. Each panel is responsible for rendering a specific screen region.

## Panel Responsibilities

- **`tree.ts`** — Session/agent tree (left sidebar): navigable hierarchy with collapsed/expanded state, cursor tracking by node ID
- **`detail.ts`** — Agent state/output (right pane): selected pane status, latest output lines, command prompt
- **`logs.ts`** — Cycle history (bottom left): roadmap.md and logs.md displayed side-by-side, mtime-invalidated cache
- **`overlays.ts`** — Modals: leader menu, copy menu, help, companion overlay, companion debug overlay
- **`bottom.ts`** — Key-hint status bar (very bottom): context-sensitive key hints, transient notifications/errors, mode banners

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
- **`node.prefix` pre-caching**: `renderTreePrefix` is only called as fallback via `node.prefix ?? renderTreePrefix(...)`. If prefix is already set by the tree builder, the function is never called.

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
- **Profile achievement slot**: shows only the single most recent achievement + `N/total` count. No scrollable list — Tab → badges for the full gallery.
- **Companion stats units**: `endurance` is milliseconds, displayed as hours (`/ 3_600_000`). `patience` is a plain count (cycles + lifecycle bonuses), displayed directly.
- **`wrapText` assumes plain text**: no ANSI stripping before measuring word lengths. `lastCommentary.text` must be plain — ANSI sequences in commentary break word-wrap calculations.
- **`renderCompanionDebugOverlay`**: separate function (not a flag on `renderCompanionOverlay`). Shows `debugMood` signals and per-mood scores with block-character bar charts. `debug` is null until the daemon has computed at least one mood update — overlay shows two lines: "No mood signals yet" + "(mood is time-of-day only)".
- **`ACHIEVEMENTS` imported from `shared/companion-types.js`** — no daemon dependency (contrast with `computeLevelProgress`).

## Non-Obvious `bottom.ts` Behaviors

- **Silent modes**: `renderStatusLine` returns immediately (renders nothing) in `report-detail` and `compose` modes — status bar goes blank, not hidden. Debugging a missing status bar starts here.
- **Notification vs error priority**: `notification !== null` is checked before `error !== null`. Notifications render bold yellow (`1;33`) with regex-selected icon (`✕`/`✓`/`ℹ`). Errors render red (`\x1b[31m`) with a plain `⚠` — no icon selection, only shown when notification is null.
- **`cursorNodeType` gating**: `context-file` nodes inject `[e]dit  [⏎] open` into the tree-focused hint string; all other node types omit it. Caller must pass the correct type or hints will be wrong.
