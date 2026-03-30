# TUI (`src/tui/`)

Raw ANSI terminal UI for real-time session monitoring and control. No frameworks — frame-buffer with panel dirty-tracking and aggressive caching.

## Architecture

- **Frame-buffer pattern**: In-memory screen state, diffs against previous, writes only changed lines via ANSI escape sequences
- **Panel dirty tracking**: Each panel (tree, detail, logs, bottom) has an input fingerprint; skipped if unchanged (critical for perf)
- **Render scheduling**: `requestRender()` deduplicates via `setImmediate` — poll, keypress, resize all coalesce to one render
- **Event loop**: Poll daemon every 2.5s; debounce session-change poll to 80ms (prevents poll storm during navigation)
- **Extensive caching**: Trees, logs (mtime-checked), reports, context files, rendered ANSI strings; cache keys track inputs

## Directory Structure

- **`app.ts`** — Main controller: polling, render loop, input dispatch, event loop
- **`render.ts`** — Frame-buffer primitives, ANSI parsing (optimized), panel rendering with RenderedCache
- **`state.ts`** — AppState interface, ThrottledScroll (16ms throttle), cursor stabilization, render scheduling
- **`input.ts`** — Keyboard/mouse handlers
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

## Rendering Flow

1. Poll daemon async (fetch session state, plan/logs, resolve reports)
2. Process input events (keypress, resize)
3. Build/cache tree; stabilize cursor by node ID
4. Render panels with dirty-tracking (skip clean ones)
5. Diff against previous frame; write deltas to terminal
