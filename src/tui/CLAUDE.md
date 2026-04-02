# TUI (`src/tui/`)

Raw ANSI terminal UI for real-time session monitoring and control. No frameworks — frame-buffer with panel dirty-tracking and aggressive caching.

## Architecture

- **Frame-buffer pattern**: In-memory screen state, diffs against previous, writes only changed lines via ANSI escape sequences
- **Panel dirty tracking**: Each panel (tree, detail, logs, bottom) has an input fingerprint; skipped if unchanged (critical for perf)
- **Render scheduling**: `requestRender()` deduplicates via `setImmediate` — poll, keypress, resize all coalesce to one render
- **Event loop**: Poll daemon every 2.5s; debounce session-change poll to 80ms (prevents poll storm during navigation)
- **Extensive caching**: Trees, logs (mtime-checked), reports, context files, rendered ANSI strings; cache keys track inputs

## Directory Structure

- **`index.ts`** — Entry point: parses `--cwd` CLI arg, initializes terminal, state, and app loop
- **`app.ts`** — Main controller: polling, render loop, input dispatch, event loop
- **`render.ts`** — Frame-buffer primitives, ANSI parsing (optimized), panel rendering with RenderedCache
- **`state.ts`** — AppState interface, ThrottledScroll (16ms throttle), cursor stabilization, render scheduling
- **`input.ts`** — Keyboard/mouse handlers; compose mode (nvim-backed multi-line input) and leader-key dispatch
- **`terminal.ts`** — Terminal I/O (stdin, stdout, resize)
- **`lib/`** — Tree building, formatting, tmux shell access, socket client
- **`panels/`** — Panel renderers: tree, detail, logs, overlays

## Key Optimization Patterns

- **Module-level caches**: `latestNodes`, `cachedContextFilePath`, `prevFrame` for keypress handler and render perf
- **Optimized ANSI parsing**: Custom `ansiLen()` without allocations; `displayWidthFast()` optimized width calculation
- **Mtime-based invalidation**: Cycle logs tracked by mtime; stale cache entries auto-removed
- **Pre-rendered ANSI**: `RenderedCache` reuses ANSI strings if input unchanged

## Key Constraints

- **No frameworks** — raw ANSI only
- **Synchronous rendering** — async I/O only during poll phase
- **Terminal minimum** — 60 cols × 12 rows; graceful fallback

## Input & Compose Mode

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` or `lib/clipboard.js` directly — callers inject them. Avoids circular deps; add new tmux ops to the `InputActions` interface, not as direct imports.
- **Nvim bypass** (`setRawBypass`): when nvim or compose mode is active, all raw stdin is intercepted before the normal key handler. `Tab` (0x09) is the escape key — exits nvim focus or cancels compose. If `nvimBridge.ready` is false mid-bypass, the bypass auto-deactivates and returns `false` (input re-processed normally).
- **Compose mode** (multi-line nvim input): writes a temp file to `$TMPDIR/sisyphus-nvim/`, opens it in the detail-pane nvim via `openComposeFile(tempFile, signalFile)`, then polls for `signalFile` every 100ms. Signal content `"cancel"` = user quit; any other content = submit. Fallback: `enterComposeMode()` returns `false` if nvim is unavailable — callers must fall back to a tmux popup overlay.
- **`prevNvimFile` must be nulled on compose cancel** — otherwise nvim won't re-open the node's real file on the next render cycle (it compares against the cached key).
- **`continue` mode is two-step**: sends `{ type: 'continue' }` first (resets daemon state), then `{ type: 'resume' }` with the optional message. Both must succeed; the resume is skipped if `continue` returns an error.
- **`OPTIONAL_COMPOSE` / `OPTIONAL_INPUT`** (sets in `state.ts`): controls which compose/input actions accept empty content. Actions not in these sets reject submission and re-arm the signal file for retry.

## Rendering Flow

1. Poll daemon async (fetch session state, plan/logs, resolve reports)
2. Process input events (keypress, resize)
3. Build/cache tree; stabilize cursor by node ID
4. Render panels with dirty-tracking (skip clean ones)
5. Diff against previous frame; write deltas to terminal
