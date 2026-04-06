# TUI (`src/tui/`)

Raw ANSI terminal UI. No frameworks — frame-buffer with panel dirty-tracking and caching.

## Render Architecture

- **Two render paths**: `buildPanelRows` returns self-contained row strings (detail/logs/digest). `renderPanel` splices into a `FrameBuffer` (overlays). Using `renderPanel` for concatenation produces wrong-width rows; using `buildPanelRows` for overlays silently misses the splice.
- **Focused border color mismatch**: `buildPanelRows` uses `'cyan'` for focused, `renderPanel` uses `'blue'`. Intentional — not a bug to unify.
- **`RenderedCache` identity check**: reference equality. Mutating elements of a cached array won't invalidate ANSI re-render — assign a new array.

## Cache Constraints

- **Cache pairs must clear together**: `cachedDetailLines` + `detailCacheKey` (same for logs/digest). Resetting only the lines leaves a stale key — next render sees unchanged key and skips rebuild from `null`.
- **`selectedSessionId` derived in `render()`**: set from `cursorNode.sessionId`, not input handlers. On change: resets all scrolls, clears all cache pairs, nulls `prevNvimFile`, fires 80ms debounced poll.
- **`stabilizeCursor` empty-tree**: preserves `cursorNodeId` — cursor snaps back when tree repopulates. Nulling `state.cursorNodeId` breaks this restoration.
- **`STATUS_ROW_COUNT = 2`**: `buildStatusRows` must produce exactly this many rows. Both `startApp` and `onResize` subtract it for nvim resize. Mismatch causes nvim to resize on every cursor move.
- **`treeCacheKey` uses `expanded.size`** not set contents: collapsing one node and expanding another of equal count won't rebuild the tree.

## State

- **`runningAgentCount` drives spinner rate** — using `agentCount` (total ever spawned) keeps spinner running after all agents finish.

## Poll vs Render

- **`cachedReportBlocks` and `mergeCheckOrReload()`** run in poll, not render — synchronous disk I/O that would block keypress processing if moved to `render()`.

## Nvim & Compose

- **Gate on both**: `nvimEnabled && nvimBridge?.ready`. `nvimEnabled = false` means disabled for session lifetime (not retried).
- **Compose race guard**: `checkComposeSignal` reads the signal file before checking `nvimBridge?.ready` — `:wq` writes signal then exits, so nvim may already be dead when the 100ms poll fires. Checking health first would incorrectly auto-cancel a valid submit.
- **`prevNvimFile` / `composePrevNvimFile`**: on compose enter, `prevNvimFile` is saved to `composePrevNvimFile`. On cancel/submit, both are nulled to force re-open of the node's real file. Nulling only one breaks re-open.

## Design App

- **`selectedAction` indexing shifts with `item.decision`**: `getDesignActions` returns `[comment, next]` without a decision, `[agree, alt-1…alt-N, comment, next]` with one. Hardcoding `=== 1` or `=== 2` breaks silently.
- **`pick-alt` always opens a comment prompt**; `agree` advances immediately.

## Review App

- **`reqIndex` indexes `pendingRequirements(group)`**, not `group.requirements` — pre-approved items excluded. Off-by-one trap when correlating by index.
- **`n` in `item-review` skips without recording action** — not counted by `totalReviewed`.
- **Helpers live in `review-types.ts`**, not `review-app.ts`.

## Input

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` directly — callers inject. Add new tmux ops to the `InputActions` interface.
