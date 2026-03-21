# TUI (`src/tui/`)

Raw ANSI terminal UI for real-time session monitoring and control. No frameworks (no React/Ink) — pure cursor-addressed rendering with frame-buffer diffing.

## Architecture

- **Frame-buffer pattern**: Maintains in-memory screen state, diffs against previous frame, writes only changed cells to terminal
- **Cursor addressing**: Uses ANSI escape sequences (`\x1b[{row};{col}H`) to position and render
- **Real-time updates**: Communicates with daemon via Unix socket (same protocol as CLI) to fetch session state, pane output, agent reports
- **Event loop**: Single-threaded; polls socket for daemon updates, processes input events, renders frame each cycle

## Directory Structure

- **`App.tsx`** — Main TUI controller; coordinates socket communication, state management, input handling, and render loop
- **`input.ts`** — Event handlers for keyboard and mouse input (ANSI mouse protocol `\x1b[?1000h`)
- **`state.ts`** — Local UI state: focused pane, scroll position, etc. (distinct from daemon session state)
- **`index.tsx`** — Entry point
- **`lib/`** — Utilities: frame-buffer management, ANSI color/cursor helpers, socket client
- **`panels/`** — UI components (rendered to frame-buffer): session info, agent panes, logs, controls
- **`types/`** — Local types for render context and panel state

## Key Constraints

- **No frameworks** — no curses, no React, no Ink. Raw ANSI only.
- **Synchronous rendering** — single event loop; no async I/O during render phase
- **Mouse support** — optional; ANSI mouse protocol enabled via term config

## Socket Communication

Identical protocol to CLI: sends JSON-line requests to daemon socket (`~/.sisyphus/daemon.sock`), awaits responses. See `src/shared/protocol.ts` for message types.

## Rendering Flow

1. Poll daemon for session state + pane output (async, non-blocking)
2. Process keyboard/mouse events (input.ts)
3. Update local UI state (scroll position, focus, etc.)
4. Compute panel layouts (rows, cols, pane positions)
5. Render each panel into frame-buffer
6. Diff against previous frame
7. Write deltas to terminal
