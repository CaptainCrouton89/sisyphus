# src/daemon/segments/

## Rendering: both sides are per-session, fully pre-resolved

`compositor.render()` iterates every tmux session. For each one it writes `@sisyphus_left` and `@sisyphus_right` as session options, with the active-session highlight baked in against `ctx.currentSession`. `status-left` and `status-right` globally point at `#{E:@sisyphus_left}` / `#{E:@sisyphus_right}`, so tmux never evaluates a `#{==:#{session_name},X}` conditional — it just expands the option for whichever session it's displaying. Segments read `ctx.currentSession` to decide active vs. inactive styling; do not emit `#{?#{==:#{session_name},...}}` conditionals in new segments.

## `SegmentOutput.trailingName` — cross-band arrow color

When a segment renders a list of sessions, it must return `trailingName` set to the name of the last session in the list. The compositor passes this to `renderSectionBoundary()` for the *next* band's entry arrow, enabling the active-session highlight to span band boundaries correctly. Missing `trailingName` silently breaks the highlight transition when that session is the active one.

## `SegmentOutput.includesArrows: true` — opt-out of compositor wrapping

Segments returning this flag handle their own entry and exit arrows. Required when arrow colors must embed `#{active_window_index}` or other tmux conditionals that can't be resolved at compositor compose-time. These segments must read `ctx.prevBg` directly to match the preceding band. (`windows` segment uses this.)

## `Compositor.renderSessionBand` — first intra-band arrow suppression

Both `sessions` and `sisyphus-sessions` pass `sectionBg` (not actual prevBg) as the `prevBg` argument to `renderSessionBand()`. This suppresses the arrow before the first session in the band — the compositor already drew the cross-band entry arrow, so a second arrow would double-render. Passing actual prevBg here produces a duplicate arrow.

## Companion segment — field set switches on active sisyphus sessions

When `ctx.sisyphusPhases.size > 0`, `companion` renders `['face', 'boulder', 'verb']`; otherwise `['face', 'boulder', 'hobby']`. Companion state is read fresh via `loadCompanion()` on every compositor render — no module-level cache.

Boulder size uses `ctx.companion.recentActiveAgents ?? 0`. If pane-monitor hasn't run yet (`recentActiveAgents` is absent), boulder renders at size 0. The pane-monitor filters out zombie sessions (active status but no 2h activity) before computing this — see `hasRecentSessionActivity` in `pane-monitor.ts`.

`spinnerVerbIndex` is read from companion state and passed as `verbIndex` to `renderCompanion` — the segment does not rotate it. Whatever last wrote `spinnerVerbIndex` to companion state determines which verb displays.

`renderCompanion` errors are caught and return `{ content: '' }` — the segment silently disappears rather than surfacing the error. A blank companion requires debugging `renderCompanion` directly, not the segment.

## Session order

`~/.config/tmux/session-order` (one name per line) controls display order in `sessions` and `sisyphus-sessions`. Read fresh on every compositor render — no cache. Sessions not listed sort alphabetically after listed ones.

## `windows` segment — `#{@sisyphus_dots}` injection

The windows segment appends `#{@sisyphus_dots}` inline without computing it — this tmux session option is written by `status-dots.ts` (not by any segment). If the option is absent, the injection is a no-op.

## Segment ordering

`getOrderedSegments()` uses config array position first, then `priority` for segments absent from config. Priority only breaks ties among unregistered segments — a segment in `config.left`/`config.right` always appears in that order regardless of its `priority` field.
