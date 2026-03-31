# Panels (`src/tui/panels/`)

Individual panel renderers for the frame-buffer TUI. Each panel is responsible for rendering a specific screen region.

## Panel Responsibilities

- **`tree.ts`** — Session/agent tree (left sidebar): navigable hierarchy with collapsed/expanded state, cursor tracking by node ID
- **`detail.ts`** — Agent state/output (right pane): selected pane status, latest output lines, command prompt
- **`logs.ts`** — Cycle history (bottom left): roadmap.md and logs.md displayed side-by-side, mtime-invalidated cache
- **`overlays.ts`** — Modals and status banners: error overlays, help, session confirmation dialogs
- **`bottom.ts`** — Status bar (very bottom): pane counts, selected node info, mode indicator, key hints

## Rendering Pattern

Each panel function:
1. Takes `AppState` (full state) and region bounds (`x, y, width, height`)
2. Returns `RenderedPanel` — array of lines as ANSI strings (cached via `RenderedCache`)
3. Only re-renders if input fingerprint changed (dirty tracking)

Panels are called from `render.ts` → `renderFrame()`. Frame-buffer diffs output and writes only changed lines.

## Key Constraints

- **No async I/O** — panels read from cached AppState (polling happens async in poll phase)
- **Width awareness** — lines must respect terminal width; use `displayWidthFast()` for layout
- **ANSI-safe** — handle control chars in data (agent output, pane content) with `stripAnsi()` or escape as needed
- **Mtime tracking** — logs.ts watches file modification times; stale entries auto-removed from cache
- **Cursor stability** — tree.ts stabilizes cursor by node ID across renders (see `state.ts` for pattern)

## Common Dependencies

- `render.ts` — Frame-buffer helpers, `RenderedCache`, ANSI primitives, `displayWidthFast()`, `stripAnsi()`
- `state.ts` — `AppState`, cursor stabilization helpers
- `lib/` — Tree building, formatting utilities
