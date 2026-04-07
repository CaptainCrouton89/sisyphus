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
- **`pick-alt` always opens a comment prompt**; `agree` advances immediately. `InputMode.comment` in design-app carries `pendingAlt?: number` — if set, saves `reviewAction = 'pick-alt'` + `selectedAlternative`; if absent, saves `reviewAction = 'comment'`. Review-app's `InputMode.comment` uses `action: 'approve' | 'comment' | 'bounce-to-design'` instead — the two shapes are incompatible.
- **`n` in `item-walkthrough` skips without recording** — same silent non-count as review-app.

## Review App

- **`reqIndex` source depends on `bucket`**: `bucket === 'requirements'` → `pendingRequirements(group)`; `bucket === 'safeAssumptions'` → `pendingSafeAssumptions(group)`. Off-by-one trap when correlating by index to `group.requirements` or `group.safeAssumptions`.
- **`bucket === 'safeAssumptions'` post-action nav returns to `group-intro`**, not `advanceItem` — applies to both confirm actions and `n` skip. Normal requirements advance to the next item.
- **`safeAssumptionsExpanded`** is on `ReviewState`; every nav helper resets it to `false`. New nav shortcuts that bypass the helpers must reset it manually or the expand state bleeds into the next group.
- **`questionIndex` in `group-questions` indexes `filter(q => !q.response)`**, not raw `openQuestions` — same trap. Adding a pre-answered question shifts live indices.
- **`actionCount = 4` is hardcoded** in the `item-review` input handler (0=approve&next, 1=approve-with-comment, 2=comment, 3=bounce-to-design) — `getDesignActions` is dynamic but review's action count is not. Adding a 5th action requires updating this constant too.
- **`n` in `item-review` skips without recording action** — not counted by `totalReviewed`.
- **Adding an action**: append at the end of the actions array; never insert. Update the `actionCount` literal in the `item-review` switch. Update the index→semantic comment block above the array.
- **Helpers live in `review-types.ts`**, not `review-app.ts`.

## Standalone App Renderer (design-app, review-app)

- **`flush` uses synchronized output** (`\x1b[?2026h`/`\x1b[?2026l`) to batch all terminal writes into one atomic update. `prevFrame` is module-level per file — two concurrent render loops in the same process would corrupt each other's line diff.

## Input

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` directly — callers inject. Add new tmux ops to the `InputActions` interface.
