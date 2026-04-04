# TUI (`src/tui/`)

Raw ANSI terminal UI. No frameworks — frame-buffer with panel dirty-tracking and caching.

## Render Architecture

- **Two render paths**: `buildPanelRows` returns self-contained row strings (detail/logs/digest via concatenation). `renderPanel` splices into a `FrameBuffer` (overlays only). Using `renderPanel` for concatenation produces wrong-width rows; using `buildPanelRows` for overlays silently misses the splice.
- **Panel dirty tracking**: Tree (`prevTreeInputs`) and bottom (`prevBottomInputs`) skip entirely when clean. Detail/logs/digest rebuild `DetailLine[]` every frame but skip ANSI re-render via `RenderedCache` reference equality. Adding a fingerprint for these must also null their `cachedDetailLines`, or the identity check always short-circuits on a stale cached array.
- **`RenderedCache` identity check**: `renderedCache.lines === lines` is a reference check. Mutating elements of a cached array won't invalidate ANSI — assign a new array.
- **`clipAnsi` vs `writeClipped`**: `clipAnsi` clips and returns a string (used inside `buildPanelRows`). `writeClipped` clips and splices into a `FrameBuffer` line (used inside `writeAt`/`drawBorder`). Calling `writeClipped` inside `buildPanelRows` throws; `clipAnsi` where `writeClipped` is needed silently skips the splice.
- **`Seg.bg` vs `Seg.color`**: `s.color` → resolved through `colorToSGR()`. `s.bg` → pushed verbatim as a pre-formatted SGR partial (e.g. `'48;2;40;35;20'` from `BG_TINTS` in `panels/cycle-flow.ts`). Passing a color name to `bg` silently emits a broken escape sequence.
- **`sliceDisplayCols(restoreState=true)`**: Suffix slices accumulate SGR state before the slice point and prepend it. Both `writeAt` and `writeClipped` pass `restoreState=true` for the suffix — without it, mid-line color splices lose preceding colors.
- **`flushFrame` synchronized output**: Wraps writes in `\x1b[?2026h/l`. Cursor-position suffix must be inside the block — writing cursor escapes outside causes flicker.
- **`prevFrame = []` forces full repaint**: Every line fails the diff check. `onResize` does this explicitly; it's the correct pattern when frame dimensions change.
- **Render scheduling**: `requestRender()` deduplicates via `setImmediate`. `renderFn` is null until `setRenderFunction` is called in `startApp`; calls before that silently no-op (including `ThrottledScroll` callbacks from `createAppState`).

## Key Constraints

- **Cache pairs must clear together**: `cachedDetailLines` + `detailCacheKey` (same for logs/digest). Resetting only the lines leaves the stale key string, so the next render sees an unchanged key and skips rebuild from `null`.
- **`selectedSessionId` derived in `render()`**: Set from `cursorNode.sessionId`, not by input handlers. On change: resets all scrolls, clears all cache pairs, nulls `prevNvimFile`, resets `flowExpanded`, fires 80ms debounced poll. Debugging "wrong session shown" starts here, not in input handling.
- **`stabilizeCursor` empty-tree**: Resets `cursorIndex=0` but **preserves `cursorNodeId`** — cursor snaps back to the tracked node when tree repopulates. Adding `state.cursorNodeId = null` to the empty-tree guard silently breaks this restoration.
- **`ThrottledScroll` `.offset` vs `.target`**: `.offset` (what render reads) only updates after the 16ms timer. Reading `.offset` in a keypress handler during a pending scroll returns the pre-scroll position. `reset()` cancels timer and zeros both; `destroy()` only cancels the timer (use on exit).
- **`treeCacheKey` uses `expanded.size`** (not set contents): Collapsing one node and expanding another of the same count won't rebuild the tree.
- **`STATUS_ROW_COUNT = 2`**: `buildStatusRows` must produce exactly this many rows; both `startApp` and `onResize` nvim resize formulas subtract it. Mismatching causes nvim to resize on every cursor move.
- **Nvim cursor position formula** (in `render()`): `absX = detailRect.x + 2 + cursor.x`; `absY = detailRect.y + 1 + STATUS_ROW_COUNT + 1 + cursor.y`. Components: detail origin + top border + status rows + separator. Off-by-one in any component misaligns the cursor.

## State Module (`state.ts`)

- **`SessionSummary` defined in `state.ts`** (not `shared/types.ts`): TUI-local type from `list` response; full `Session` comes from `status`. `runningAgentCount` drives spinner rate — using `agentCount` (total ever spawned) keeps spinner running after all agents finish.
- **`stabilizeCursor` and `autoExpandCycle`** are exported from `state.ts`, called from `app.ts`. Searching `app.ts` finds only call sites.
- **`autoExpandCycle` first-cycle path**: Requires `prevCycleCount > 0` for the collapse-previous branch — first cycle arrival only triggers ensure-latest-expanded.
- **`logsCycles` vs `logsContent`**: Logs panel reads `logsCycles` directly for cycle boundaries; `logsContent` (joined string) is for clipboard/string consumers. `logsCacheKey` keys on `logsCycles.length` + cycle numbers — content-only changes without a count change won't invalidate.

## Poll vs Render

- **`cachedReportBlocks` and `mergeCheckOrReload()`** run in poll, not render — both are synchronous disk I/O that would block keypress processing if called in `render()`.
- **`cachedLogFiles` mtime cache** (module-level, `app.ts`): Avoids re-reading cycle log files when mtime unchanged. Reset when `selectedSessionId` changes. Separate from `state.logsCycles`/`logsCacheKey` — this is a disk-I/O skip layer beneath the render cache.
- **`digestData` duck-typed validation in poll**: All four fields required with correct types. Missing/wrong-type field silently leaves `digestData = null`. Debug "digest panel empty" in the poll's `digestPath` block in `app.ts`, not the render layer.

## Nvim & Compose

- **`nvimEnabled` vs `nvimBridge`**: `nvimEnabled = false` means disabled for the session lifetime (set when respawn fails, not retried). `nvimBridge` can be null if never initialized. Gate on both: `nvimEnabled && nvimBridge?.ready`.
- **Compose race guard**: `checkComposeSignal` reads the signal file **before** checking `nvimBridge?.ready` — `:wq` writes signal then exits, so nvim may already be dead when the 100ms poll fires. Checking health first would incorrectly auto-cancel a valid submit.
- **`prevNvimFile` key**: `files.map(f => f.path).join('|')`. Not called during compose — would override the buffer mid-session.
- **`prevNvimFile` / `composePrevNvimFile`**: On compose enter, `prevNvimFile` is saved to `composePrevNvimFile`. On cancel/submit, both are nulled to force re-open of the node's real file. Nulling only one breaks re-open.

## Input

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` directly — callers inject them. Add new tmux ops to the `InputActions` interface.
- **`latestNodes` populated in render**: `getNodes`/`getCursorNode` close over the module-level `latestNodes` array, updated at the start of each `render()` call. Input handlers called before the first render get an empty array.
- **`notify` 30s timer**: Each call cancels the previous timer — only the most recent notification persists.
- **`overlayDirty` gates bottom row**: OR'd with `bottomDirty` to decide whether to re-render or copy the bottom status row. Overlays always overwrite buffer lines unconditionally after concatenation.
