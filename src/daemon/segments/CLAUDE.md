# src/daemon/segments/

## Rendering split: left is per-session, right is global

`compositor.render()` writes `status-right` once (global, with tmux format conditionals evaluated at display time), but writes `@sisyphus_left` as a per-session tmux option for each session, with `status-left` set to `#{E:@sisyphus_left}` globally. Left segments receive a filtered `RenderContext` containing only the target session — `ctx.allSessions[0]` is the session being rendered.

## `SegmentOutput.trailingName` — cross-band arrow color

When a segment renders a list of sessions, it must return `trailingName` set to the name of the last session in the list. The compositor passes this to `renderSectionBoundary()` for the *next* band's entry arrow, enabling the active-session highlight to span band boundaries correctly. Missing `trailingName` silently breaks the highlight transition when that session is the active one.

## `SegmentOutput.includesArrows: true` — opt-out of compositor wrapping

Segments returning this flag handle their own entry and exit arrows. Required when arrow colors must embed `#{active_window_index}` or other tmux conditionals that can't be resolved at compositor compose-time. These segments must read `ctx.prevBg` directly to match the preceding band. (`windows` segment uses this.)

## `Compositor.renderSessionBand` — first intra-band arrow suppression

Both `sessions` and `sisyphus-sessions` pass `sectionBg` (not actual prevBg) as the `prevBg` argument to `renderSessionBand()`. This suppresses the arrow before the first session in the band — the compositor already drew the cross-band entry arrow, so a second arrow would double-render. Passing actual prevBg here produces a duplicate arrow.

## Companion segment — field set switches on active sisyphus sessions

When `ctx.sisyphusPhases.size > 0`, `companion` renders `['face', 'boulder', 'verb']`; otherwise `['face', 'boulder', 'hobby']`. Companion state is cached at module level in `compositor.ts` with a 10s TTL — status bar changes lag up to 10s after companion state updates.

Boulder size uses `ctx.companion.recentActiveAgents ?? 0`. If pane-monitor hasn't run yet (`recentActiveAgents` is absent), boulder renders at size 0. The pane-monitor filters out zombie sessions (active status but no 2h activity) before computing this — see `hasRecentSessionActivity` in `pane-monitor.ts`.

`spinnerVerbIndex` is read from companion state and passed as `verbIndex` to `renderCompanion` — the segment does not rotate it. Whatever last wrote `spinnerVerbIndex` to companion state determines which verb displays.

`renderCompanion` errors are caught and return `{ content: '' }` — the segment silently disappears rather than surfacing the error. A blank companion requires debugging `renderCompanion` directly, not the segment.

## Session order

`~/.config/tmux/session-order` (one name per line) controls display order in `sessions` and `sisyphus-sessions`. Cached 30s at module level in `compositor.ts`. Sessions not listed sort alphabetically after listed ones.

## `windows` segment — `#{@sisyphus_dots}` injection

The windows segment appends `#{@sisyphus_dots}` inline without computing it — this tmux session option is written by `status-dots.ts` (not by any segment). If the option is absent, the injection is a no-op.

## Segment ordering

`getOrderedSegments()` uses config array position first, then `priority` for segments absent from config. Priority only breaks ties among unregistered segments — a segment in `config.left`/`config.right` always appears in that order regardless of its `priority` field.
