# TUI (`src/tui/`)

## Render Architecture

- **Two render paths**: `buildPanelRows` returns self-contained row strings (detail/logs/digest). `renderPanel` splices into a `FrameBuffer` (overlays). Using `renderPanel` for concatenation produces wrong-width rows; using `buildPanelRows` for overlays silently misses the splice.
- **Focused border color mismatch**: `buildPanelRows` uses `'cyan'` for focused, `renderPanel` uses `'blue'`. Intentional — not a bug to unify.
- **`RenderedCache` identity check**: reference equality. Mutating elements of a cached array won't invalidate ANSI re-render — assign a new array.

## Cache Constraints

- **Cache pairs must clear together**: `cachedDetailLines` + `detailCacheKey` (same for logs/digest). Resetting only the lines leaves a stale key — next render sees unchanged key and skips rebuild from `null`.
- **`selectedSessionId` derived in `render()`**: set from `cursorNode.sessionId`, not input handlers. On change: resets all scrolls, clears all cache pairs, nulls `prevNvimFile`, fires 80ms debounced poll.
- **`stabilizeCursor` empty-tree**: preserves `cursorNodeId` — cursor snaps back when tree repopulates. Nulling `state.cursorNodeId` breaks this restoration.
- **`STATUS_ROW_COUNT = 2`**: `buildStatusRows` must produce exactly this many rows. Both `startApp` and `onResize` subtract it for nvim resize. Mismatch causes nvim to resize on every cursor move.

## AppState (`state.ts`)

- **`ThrottledScroll.offset` vs `target`**: render reads `offset` (last flushed); `target` is pending. Reading `offset` during an active scroll returns the previous committed position. `reset()` cancels the timer and zeroes both; `destroy()` cancels the timer only — `offset` retains its last value. Use `destroy()` on teardown; `reset()` on session change.
- **`requestRender` batching**: multiple calls in one tick collapse to one `setImmediate`. `setRenderFunction` must be called before the first event loop tick that triggers a render — if `renderFn` is still `null`, the render is silently dropped with no error.
- **`autoExpandCycle` guard**: only auto-manages cycle expansion when the session node is already in `state.expanded`. `prevCycleCount` still updates while collapsed — so user-expanding later won't retroactively try to collapse a previous cycle. The `prevCycleCount > 0` check prevents collapsing the previous cycle on the very first cycle appearing.
- **`OPTIONAL_COMPOSE`**: `resume` and `continue` allow empty-content submit. The check lives in the input handler, not in `ComposeAction`. Adding a new `ComposeAction` kind that should allow empty submit requires adding it to this set.
- **`windowAlive` on `SessionSummary`**: set during polling, never in render. Omitting it in a polling update leaves it `undefined`, which callers treat as alive — silent false-positive.

## Poll vs Render

- **`cachedReportBlocks` and `mergeCheckOrReload()`** run in poll, not render — synchronous disk I/O that would block keypress processing if moved to `render()`.

## Nvim & Compose

- **Gate on both**: `nvimEnabled && nvimBridge?.ready`. `nvimEnabled = false` means disabled for session lifetime (not retried).
- **Compose race guard**: `checkComposeSignal` reads the signal file before checking `nvimBridge?.ready` — `:wq` writes signal then exits, so nvim may already be dead when the 100ms poll fires. Checking health first would incorrectly auto-cancel a valid submit.
- **`prevNvimFile` / `composePrevNvimFile`**: on compose enter, `prevNvimFile` is saved to `composePrevNvimFile`. On cancel/submit, both are nulled to force re-open of the node's real file. Nulling only one breaks re-open.

## Design App

- **`selectedAction` indexing shifts with `item.decision`**: `getDesignActions` returns `[comment, next]` without a decision, `[agree, alt-1...alt-N, comment, next]` with one. Hardcoding `=== 1` or `=== 2` breaks silently.
- **`pick-alt` always opens a comment prompt**; `agree` advances immediately. `InputMode.comment` in design-app carries `pendingAlt?: number` — if set, saves `reviewAction = 'pick-alt'` + `selectedAlternative`; if absent, saves `reviewAction = 'comment'`. Review-app's `InputMode.comment` uses `action: 'approve' | 'comment' | 'bounce-to-design'` instead — the two shapes are incompatible.
- **`n` in `item-walkthrough` skips without recording** — advances to the next item without setting `reviewAction`. Not counted by any progress metric. (Differs from review-app where `n` approves.)
- **`questionIndex` in `section-questions` indexes `filter(q => !q.response)`**, not raw `openQuestions` — same trap as review-app. Pre-answered questions shift live indices.
- **`selectedOption` in `section-questions` ranges `[0, q.options.length]`** — the last slot is always a synthetic "custom answer" appended at `q.options.length`, not at a fixed index. j/k and digit keys navigate this inclusive range; `q.options.length` varies per question.
- **`a`, `c`, digit hotkeys in `item-walkthrough` bypass `selectedAction`**: they're a parallel path that ignores the action bar cursor. Adding an entry to `getDesignActions` without a matching key handler in the input switch makes the new action j/k+enter only.
- **`p` from `item-walkthrough` re-stamps `startedAt`** on the previous item, resetting its timer even if already started. `p` from `section-questions` back to `item-walkthrough` does NOT re-stamp — asymmetric within the same file.

## Review App

- **`reqIndex` is a raw index** into `group.requirements` or `group.safeAssumptions` (selected by `bucket`). Navigation keys `n`/`p` walk the raw array sequentially (reaching approved items is intentional). Action keys (`1`, approve+enter, `advanceItem`) skip to the next *pending* item via `nextPendingIndex`. Digit keys from `group-intro` into SA items map from the pending-list position to raw index via `indexOf`.
- **`bucket === 'safeAssumptions'` post-action nav returns to `group-intro`**, not `advanceItem` — applies to confirm actions (`1`, approve+enter). `n` walks raw index regardless of bucket. Normal requirements actions advance to the next pending item.
- **`safeAssumptionsExpanded`** is on `ReviewState`; most nav helpers reset it to `false`. Exceptions: (1) digit `1-9` from `group-intro` into SA item-review, (2) `p` from SA-bucket `item-review` back to `group-intro` (`if (phase.bucket !== 'safeAssumptions') state.safeAssumptionsExpanded = false`). New nav paths not matching either exception must reset manually or expand state bleeds into the next group.
- **`questionIndex` in `group-questions` indexes `filter(q => !q.response)`**, not raw `openQuestions` — same trap. Adding a pre-answered question shifts live indices.
- **`actionCount = 4` is hardcoded** in the `item-review` input handler (0=approve&next, 1=approve-with-comment, 2=comment, 3=bounce-to-design) — `getDesignActions` is dynamic but review's action count is not. Adding a 5th action requires updating this constant too.
- **`n` in `item-review` is pure navigation** — advances to the next raw item without approving (contrast with `1` which approves and skips to next pending). Differs from design-app where `n` also skips without recording. At end-of-bucket: SA bucket returns to `group-intro`; requirements bucket calls `startGroupQuestions`. Same destination as approve actions — `n` is not exempt from the SA→group-intro rule.
- **Adding an action**: append at the end of the actions array; never insert. Update the `actionCount` literal in the `item-review` switch. Update the index->semantic comment block above the array.
- **`1`-`4` keys in `item-review` execute actions directly** without cursor navigation (1=approve&next, 2=approve+comment, 3=comment, 4/b=bounce-to-design). Design-app digit keys open alternative comment prompts instead — same keystroke, different semantics.
- **Digit keys `1-9` in `group-intro`** navigate into individual SA items only when `safeAssumptionsExpanded === true`; silently ignored when collapsed.
- **Bulk-approved SA items** (`b` or `B` in `group-intro`) get `startedAt` and `completedAt` stamped in the same synchronous tick. `buildReviewFeedback` detects duration < 100ms and appends `(bulk)` instead of a time — the only in-data distinction from individual approvals in output. **`b` lowercase is phase-dependent**: in `group-intro` it bulk-approves SAs; in `item-review` it = bounce-to-design (same as `4`). Same key, opposite semantics.
- **Approve must set both `reviewAction` and `status`**: `pendingRequirements`/`pendingSafeAssumptions` filter on `status`; setting only `reviewAction` leaves the item in the pending list.
- **`totalReviewed` and `pendingRequirements` can disagree on the same item**: `totalReviewed` counts `reviewAction !== undefined || status === 'approved'`; `pendingRequirements` filters `status !== 'approved'`. A bounced/commented item increments the progress count while remaining in the pending queue.
- **`comment` inputMode allows empty submit; `custom-answer` does not**: in `comment` mode, pressing enter on empty buffer still sets `reviewAction` and stamps `completedAt` — `userComment` is simply omitted. In `custom-answer` mode, empty submit is a silent no-op (no state change, no advance). A bounced/commented item can legitimately have no `userComment` field.
- **`comment` inputBuffer is pre-filled with existing `userComment`**: entering any comment mode loads `req.userComment || ''` into the buffer, enabling in-place editing. However, an empty-buffer submit does NOT clear an existing comment — `if (text) req.userComment = text` only writes when truthy. There is no TUI path to delete a comment once set.
- **`stampStarted` is idempotent in review-app** (`if (!item.startedAt)`); `p` in `item-review` stamps the previous item but only if it hasn't been started. `stampCompleted` always overwrites. Contrast with design-app's `p` which always re-stamps `startedAt`, resetting the timer even on already-started items.
- **`resolveEarsKeyword` precedence**: `when > while > if > where` (first match wins). Multiple set fields on one `EarsClause` silently drops all but the first.
- **`RequirementsMeta` field ownership**: TUI writes only `reviewStartedAt` and `reviewCompletedAt`. `stage` and `bounceIterations` are spec-lead-owned — TUI must not write them. `stage` absence means stage 1 (no `'stage-1-*'` literal exists). `bounceIterations` is a scalar total count (not a per-item map) and never decrements.
- **`safeAssumptionsApproved`** returns `true` when `group.safeAssumptions` is `undefined` or `[]` — groups with no SA field silently pass any SA completion gate.
- **`p` from `group-questions` at `questionIndex === 0`** navigates to the last item in `group.requirements` (raw index) as `item-review`, not to `group-intro` — unless there are no requirements at all, in which case it goes to `group-intro`. Assuming "back goes to group-intro" breaks this path.
- **`selectedOption` in `group-questions` ranges `[0, q.options.length]`** (same inclusive-range trap as design-app `section-questions`). The last slot is always the synthetic "custom answer"; `q.options.length` varies per question. `enter` at the last slot opens inline `custom-answer` input instead of committing.
- **`OpenQuestion.selectedOption`** is written to the JSON on prefilled-answer confirm (`q.selectedOption = phase.selectedOption`). Re-launching restores cursor position — it is not ephemeral UI state.

## Lifecycle & Output (design-app, review-app)

- **Pre-review snapshot** (`{file}.pre-review.json`) is created once at startup via `existsSync` guard. Re-launching after a partial session does **not** re-snapshot — delete the `.pre-review.json` manually to reset the baseline.
- **Feedback files** (`design-feedback.md` / `review-feedback.md`) are written to `dirname(filePath)` and printed to stdout **only on clean exit** (`q` or Ctrl-C). A killed process produces no feedback file.
- **`final` phase `q` label is misleading**: the render says "Press q to exit without saving" but `q` is caught by the global handler before the `final` switch case, routing through `startReviewApp`'s exit path which unconditionally stamps `reviewCompletedAt`, calls `saveData`, and writes the feedback file. `q` in `final` saves identically to `enter`.
- **`reviewStartedAt` is overwritten on every launch**; `reviewCompletedAt` is stamped only on clean exit. A session restarted after a crash will show the restart time as start — total review duration in the feedback will be wrong.

## Standalone App Renderer (design-app, review-app)

- **`flush` uses synchronized output** (`\x1b[?2026h`/`\x1b[?2026l`) to batch all terminal writes into one atomic update. `prevFrame` is module-level per file — two concurrent render loops in the same process would corrupt each other's line diff.
- **`renderFooter` is called twice per frame in review-app**: first provisionally (no overflow arg) to measure `footerH`, then again with `{ pct }` if `maxScroll > 0`. Footer line count **must not** change between these two calls — a line that only appears when `overflow` is set would miscalculate `availH` and cause content to overflow by exactly that many lines.

## Input

- **`InputActions` dependency injection**: `input.ts` never imports `lib/tmux.js` directly — callers inject. Add new tmux ops to the `InputActions` interface.
- **`continue` (C key) is two-step async**: sends `{ type: 'continue' }` first, then `{ type: 'resume' }` — both in `dispatchComposeAction` and the popup fallback. Sending only `continue` leaves the session state reset but un-spawned.
- **`enterComposeMode` fallback ordering**: tries nvim compose first; returns `false` only when `!nvimEnabled || !nvimBridge?.ready`. On `false`, callers fall through to synchronous `editInPopup`. Fallback is not retried — if nvim is mid-startup it won't be caught.
- **nvim bypass must be explicitly deactivated**: `activateNvimBypass` is called on every focus-to-detail path (`h`, `tab`, `handleLeaderKey` → compose). New nav paths that focus detail without calling `activateNvimBypass`/`deactivateNvimBypass` will either fail to capture input or leak it to nvim.
- **`kill` (leader+k) target is cursor-context-sensitive**: cursor on `agent` or `report` node → kills that agent (only if `status === 'running'`); cursor on any other node type → kills whole session. Checking against `selectedSessionId` alone is insufficient.
- **`r` vs `x`**: `r` spawns a *new* agent with name `${agent.name}-retry` (new ID, same `agentType`/`instruction`); `x` sends `restart-agent` to the same agent ID in place. Both operate on `getAgentForNode(cursorNode)` — cursor must be on agent/report.
- **`w` key state machine**: paused → notify (no nav); active+alive pane → switch tmux session+window; active+dead pane → notify; completed → opens last cycle's `claudeSessionId` via `openClaudeResumeSession` in a new tmux session. Four branches, not two.
- **`companion-overlay` badge page remaps hjkl**: `h`/`l` = badge list scroll up/down; `j`/`k` = gallery left/right — opposite of normal tree navigation. Only active when `getCompanionPage() === 'badges'`; other pages ignore these keys entirely.
- **`expandSessionLatestCycle`** is called on `l` (expand) and `enter` (expand) but not on programmatic expansion (e.g., `jump-to-session`). Jumping to a session node and then expanding it manually triggers it; expanding via `state.expanded.add` directly does not.
- **`o` vs `w` on Claude sessions**: `o` opens a popup (`openClaudeResumePopup`, blocking) for the cursor node's own `claudeSessionId` — works on agent, report, or cycle nodes. `w` on a completed session opens the last orchestrator cycle via `openClaudeResumeSession` in a new tmux session (non-blocking, switches to it). Different node scope and blocking semantics.
- **`b` rollback is two-step**: `rollback` transitions the session to paused state — it does not respawn. Caller must explicitly R (resume) afterward. The notify message encodes this; code that assumes auto-resume after rollback will silently leave the session dead.
- **`searchFilter` persists after Enter**: pressing Enter in search mode returns to `navigate` but leaves `state.searchFilter` non-null. Only Escape clears it (`searchFilter = null`). A visible tree filter with `mode === 'navigate'` is correct — `searchText` holds the display buffer; `searchFilter` drives render.
- **`report-detail` mode**: entered via `enter` on a report node (sets `state.targetAgentId = node.agentId`); only `escape`/`return` exit to navigate; `up`/`down` scroll `detailScroll`. All other keys are silently dropped — no leader, no compose, no search. `handleKeypress` never reaches `handleNavigateKey` while in this mode.
- **`companion-overlay` Escape is context-sensitive**: if `getCompanionPage() === 'help'`, Escape dismisses the help sub-page (overlay stays open); otherwise it closes the overlay entirely. `?` toggles the help sub-page without closing the overlay. New overlay pages that add sub-views must handle Escape themselves before the outer dismiss.
