# Sisyphus UX Redesign — Spec

Reframes the TUI around the actual supervision problem: one human, N long-running coding agents, a finite attention budget. Replaces the dashboard-only model with two distinct modes (observe / resolve), formalizes the five intervention types, and removes the embedded-nvim machinery in favor of `$EDITOR`-style popups.

## Goals

- **Attention allocation as the primary UX problem.** The default landing surface answers "who needs me?" not "what's the latest cycle on session X?"
- **Dashboard and resolution are different postures.** Observing is wide-attention; resolving is full-focus. They should feel different, not be jammed into one screen.
- **Every type of agent→human communication has a tuned UI.** The five intervention types (notify / validation / decision / context / error) each get their own resolution surface inside a unified queue.
- **Cross-platform, opinionated-but-non-conflicting editor.** Compose runs `nvim` with `NVIM_APPNAME=sisyphus` so user plugins don't clash but power users can still customize sisyphus's nvim independently.
- **Drop the embedded-nvim PTY tower.** No `node-pty` headless xterm, no Lua signal-file polling, no "nvim or nothing" detail panel.
- **Stay a stateless orchestrator.** No new persistent UI state beyond what already exists per-session.

## Mental Model

Two modes, switchable freely.

**Dashboard (observing):** three persistent zones. Tree (left) | stacked goal/strategy/roadmap (middle) | digest (right). Cursor on a session shows that session's state. Cursor on the virtual `Needs You` node shows a flat cross-session inbox.

**Resolution (answering):** full-screen takeover. Header (queue position + source + blocked-time), body (full-bleed visual or markdown), footer (type-specific actions). The dashboard is hidden while resolving; `esc` returns.

The two modes share no layout. Resolution is *not* a panel inside the dashboard. The walkthrough owns the screen so the user is focused.

## Layout — Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ~/Code/sisyphus · 11 sessions · 2 asks · 1 error                        │
├──────────────┬─────────────────────────────────────┬────────────────────┤
│ ▼ Needs You  │ Goal                                │ Recent Work        │
│   ask-cli  3 │ ─────────                           │ ─────────          │
│   forge    1 │ ...                                 │ ...                │
│              │                                     │ Now                │
│ ▼ Running    │ Strategy                            │ ─────────          │
│   north    ● │ ─────────                           │ ...                │
│   k8s      ● │ ...                                 │ Up Next            │
│   tools    ● │                                     │ ─────────          │
│              │ Roadmap                             │ ...                │
│ ▼ Done (3) ▾ │ ─────────                           │ Unusual            │
│              │ ...                                 │ ─────────          │
│              │                                     │ ...                │
│              │                                     │ Cycle Flow         │
│              │                                     │ ...                │
├──────────────┴─────────────────────────────────────┴────────────────────┤
│ [enter] resolve  [m]essage  [n]ew  [w] tmux  [q]uit                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sessions tree (left, ~28 cols)

Sectioned by state, not chronological:

1. **Needs You** — sessions with pending asks/errors. Sort by oldest blocked-time within the section.
2. **Running** — active sessions making progress. Sort by recent activity.
3. **Done** — completed/killed. Collapsed by default, expand with `enter` on the section header.

Row format: status icon · name · single signal (ask count for Needs You, status dot for Running, idle time for Done).

A virtual fleet-level node `Needs You` aggregates asks across all sessions. Cursor on it shows a flat cross-session inbox in the detail zone.

### Detail zone (middle, fluid)

**Default mode** when cursor is on a session: stacked goal/strategy/roadmap.

- Read `goal.md`, `strategy.md`, `roadmap.md` directly from `.sisyphus/sessions/<id>/`.
- Render as three vertically stacked strips with separators.
- Heights weighted by content: goal small, strategy medium, roadmap large. Recompute when files change.
- Each strip independently scrollable (j/k inside the strip when focused).
- No nvim. Pure rendering.

**Cycle log mode** (`l` key): swap detail to render the most recent cycle log file (`.sisyphus/sessions/<id>/logs/cycle-NNN.md`). `l` again returns to stacked g/s/r.

**Inbox mode** (cursor on `Needs You` virtual node): flat list of pending asks across all sessions, sorted by blocked-time. Each row: source session · type icon · title · blocked-time. `enter` opens the item in resolution mode.

### Digest (right, ~32 cols)

Persistent. Renders `.sisyphus/sessions/<id>/digest.json` content: Recent Work / Now / Up Next / Unusual / Cycle Flow. No `t` toggle anymore — always visible.

When cursor is on `Needs You` (cross-session inbox), digest shows fleet-level rollup: counts by intervention type, sessions by state.

### Status bar + footer

Top status bar: cwd, session counts, pending counts.
Bottom footer: current keybinds for current focus.

## Layout — Resolution Mode

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [esc] back   ●●●○○ 3 of 5   ask-cli/north-pr   ⏱ blocked 12m            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   [Termrender visual or markdown body — full width, full height]        │
│                                                                         │
│   Should we adopt Zod v4's enum API across the validation modules?      │
│                                                                         │
│   Context:                                                              │
│   ...                                                                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ [a] approve   [r] reject   [s] skip   [n] next                          │
└─────────────────────────────────────────────────────────────────────────┘
```

Three thin/full/thin regions. Header includes:

- `[esc] back` to dashboard
- Queue progress dots (filled = answered)
- Source: `<session-name> / <ask-title>`
- Blocked time

Body is full-bleed; the agent's termrender visual or markdown content gets the whole zone.

Footer is type-specific. See the intervention type matrix below.

Resolution mode is mounted humanloop (per ASK spec, with refactors), not a separate implementation. Sisyphus passes `mountPanel({ deck, source: { sessionName, askedBy, blockedSince } })` and humanloop renders.

## Unified Interaction Schema

The current humanloop schema has three discriminated types (`validation`, `choice`, `freetext`). The redesigned spec **collapses them into one shape**, because the differences are pure parameter values — option count, whether free input is allowed, whether comments attach to a choice.

```ts
interface Interaction {
  id: string;
  title: string;             // ≤4 words. Inbox row + walkthrough header.
  subtitle?: string;          // one-line "why this matters" (the old rationale)
  body?: string;              // markdown / termrender — the full context
  options: InteractionOption[];  // 0 to N
  allowFreetext?: boolean;    // user can type a response (alongside or instead of picking)
  freetextLabel?: string;     // prompt for the freetext field
  kind?: InteractionKind;     // display hint, opaque to humanloop
}

interface InteractionOption {
  id: string;                 // 'approve', 'reject', 'opt-3', 'retry'…
  label: string;              // shown to user
  description?: string;       // longer explanation / implication
  shortcut?: string;          // 'a', 'r', '1' — auto-assigned if absent
}

interface InteractionResponse {
  id: string;
  selectedOptionId?: string;  // omitted if user only used freetext
  freetext?: string;          // comment on the choice OR the entire response
}

type InteractionKind = 'notify' | 'validation' | 'decision' | 'context' | 'error';
```

`kind` is **display-only** — humanloop ignores it; sisyphus uses it for inbox icons, sort weighting, FYI/error coloring. Agents tag what they intend; the schema doesn't enforce different shapes.

### How the previous types map to the unified shape

| Was | Becomes |
|---|---|
| `validation` | 2 options (Approve, Reject) + `allowFreetext: true` (for comment) |
| `choice` | N options + `allowFreetext: true, freetextLabel: 'Other'` |
| `freetext` | 0 options + `allowFreetext: true` (forced) |
| `notify` | 1 option (Dismiss) + `allowFreetext: false` |
| `decision` | N options with `description` per option |
| `error` (system-generated) | N options ([Retry, Skip, Takeover]) + `allowFreetext: true` (notes) |

### Walkthrough action UX (for any interaction)

```
  ▸ [a] Approve
    [r] Reject

    [c] Add comment        ← only when allowFreetext=true and options.length>0
```

Behavior:

- Press an option's shortcut (auto-assigned letter or `1..9`): submit `{ selectedOptionId }`, auto-chain.
- Press `c`: enter input mode. Type a comment.
  - Then press an option shortcut: submit `{ selectedOptionId, freetext }`, auto-chain.
  - Or press `enter`: submit `{ freetext }` (no option), auto-chain.
  - Or press `esc`: discard buffer, return to action selection.
- For freetext-only interactions (no options): `enter` (or `r` for "respond") opens the input mode directly.

This is a strict superset of the current per-type UX:

- `validation`'s 4 actions (approve / approve+comment / reject / reject+comment) all reachable via `a`, `c→a`, `r`, `c→r`.
- `choice`'s "Other (custom)" reachable via `c→enter`.
- `freetext`'s response reachable via `enter` → input → `enter`.

### Display hints from `kind`

Sisyphus uses the optional `kind` field to badge inbox rows and color the resolution mode header:

- `notify` → 📨 dim, low-priority sort
- `validation` → ✓ neutral
- `decision` → ◆ neutral
- `context` → ✎ neutral
- `error` → ⚠ red, high-priority sort

`error` items are also generated differently — by sisyphus's orphan handler / crash detection / tool-failure heuristics, not by agent CLI submission. They render through the same humanloop walkthrough but their submission pipeline is separate. Takeover (a `selectedOptionId === 'takeover'` answer) triggers a tmux pane switch in sisyphus, not in humanloop.

## Navigation

| Key | Behavior |
|---|---|
| `j` / `k` | Move within current focus (tree row, action selection, scroll within strip) |
| `Shift+J` / `Shift+K` | Move through queue items (email-style, no state change — implicit skip) |
| `enter` | Drill into selection (open ask in resolution; expand section) |
| `esc` | Back up one level (resolution → dashboard; expanded → collapsed) |
| Type actions (`a`/`r`/`d`/`1`…`N`/etc.) | Resolve current item, auto-chain to next (where applicable) |
| `m` | Compose message to currently-selected session |
| `n` | New session |
| `w` | Switch to currently-selected session's tmux pane |
| `l` | Toggle detail mode (stacked g/s/r ↔ cycle log) |
| `q` | Quit TUI (daemon keeps running) |

`Shift+J/K` works across all sections in dashboard mode (move tree cursor between Needs You and Running). In resolution mode, it walks the queue without resolving — the user can preview items, then back-arrow and act.

## Auto-chain Semantics

After resolving any item:

1. Look up next pending item across all sessions, sorted by blocked-time (oldest first).
2. If a next item exists, advance to it directly inside resolution mode.
3. If the queue is empty, return to dashboard at the `Needs You` cursor.

Auto-chain is **always on** and **fleet-level** — answering a validation in `ask-cli` advances to the next pending item (whatever its kind) in `north-pr`. This is the supervision multiplier; otherwise the user spends more time on context-switching than deciding. There is no per-item or per-kind opt-out — the unified interaction schema removed the need for that distinction. If the user wants to think before answering, they `Shift+J/K` past the item without responding.

`Shift+J` / `Shift+K` always overrides auto-chain (manual queue nav, no state change).

## Compose Flow

Replaces the embedded-nvim compose path entirely.

- `m` (message) and `n` (new session) both trigger compose.
- Compose opens a tmux popup running `nvim` with `NVIM_APPNAME=sisyphus`.
- Sisyphus ships `~/.config/sisyphus/init.lua` with: markdown filetype, no swap files, `BufWritePost` autocmd that writes the file and `:q`.
- User saves+quits → popup closes → sisyphus reads the file → submits.
- Cancel: user `:q!` without writing → popup closes → no submission.

`NVIM_APPNAME=sisyphus` means user's main nvim config is bypassed entirely, so plugins and lazyvim configs don't conflict. Power users can customize sisyphus's nvim by editing `~/.config/sisyphus/init.lua` directly.

## Removed Components

| Component | File(s) | Reason |
|---|---|---|
| Embedded nvim panel | `src/tui/lib/nvim-bridge.ts`, `src/tui/panels/nvim-detail.ts` | Replaced by direct file rendering + tmux popup compose |
| Signal-file compose polling | `src/tui/input.ts:175` (the 100ms interval) | No longer needed without embedded nvim |
| `showCombinedView` toggle | `src/tui/app.ts:430-441`, `t` key handler | Digest is now persistent; toggle is dead weight |
| `node-pty` dependency | `package.json` | Verify no other consumer; remove if unused |
| `@xterm/headless` dependency | `package.json` | Same — verify and remove |
| Tabbed nvim detail mode | `src/tui/lib/overview-writer.ts:254-265` | Replaced by stacked g/s/r |

## Humanloop Additions Required

Tracked separately in the humanloop repo. Listed here so sisyphus's spec is self-contained.

1. **Unified `Interaction` schema** — replaces the discriminated union of `validation` / `choice` / `freetext`. One type with `options[]` + `allowFreetext` covers all current and future kinds (notify, decision, error). Schema definition above.
2. **Single render path + single input handler** — collapses `renderActions` and `handleValidationAction` / `handleChoiceAction` / `handleFreetextAction` into one path that reads `options` and `allowFreetext`. Today's per-type code becomes one shared implementation.
3. **`kind` display hint** — optional, opaque to humanloop. Used by sisyphus for inbox badges and sort weighting; humanloop ignores it.
4. **`mountPanel` API** — already in ASK spec. Two refinements:
   - `mountedPanel.loadDeck(deck)` for seamless deck-to-deck chaining without unmount/remount.
   - `source: { sessionName, askedBy, blockedSince }` opt rendered in resolution header.
5. **Header source display** — render the source info passed via `mountPanel` opts.

The schema collapse is the load-bearing change. Everything else falls out of it.

## ASK Spec Adjustments

The current `specs/ask.md` mounts the walkthrough as a panel alongside `detail | logs | digest`. Three changes:

1. **Walkthrough is full-screen takeover, not panel-mounted.** Cleaner architecturally and necessary for focus. The "inbox-list panel" alongside detail/logs/digest is removed in favor of dashboard's `Needs You` tree section + cross-session inbox view.
2. **Schema becomes the unified `Interaction` shape** (above). The discriminated union `validation` / `choice` / `freetext` collapses to one type. Agent prompts updated to teach the unified shape; `kind` field carries the display intent.
3. **Aggregate fleet inbox query.** Per-session enumeration is fine for per-session inbox (still kept as a tree node), but dashboard's `Needs You` section needs cheap cross-session aggregation. Add `~/.sisyphus/inbox.json` aggregate index updated on submit/resolve, or daemon-side query API.

## Implementation Phases

1. **Compose flow first** (low risk, narrow scope).
   - Implement tmux popup with `NVIM_APPNAME=sisyphus`.
   - Ship the minimal `init.lua`.
   - Wire `m` and `n` to popup path. Keep embedded nvim path running in parallel for now.

2. **Stacked g/s/r detail rendering** (replaces nvim-detail).
   - Build the rendering path for three markdown files in one pane with weighted heights and per-strip scroll.
   - Cursor-based scroll focus per strip.
   - Land alongside compose; embedded nvim still running.

3. **Drop embedded nvim** (now safe).
   - Remove `nvim-bridge.ts`, `nvim-detail.ts`, signal-file polling.
   - Remove `node-pty` and `@xterm/headless` if unused.
   - Remove `showCombinedView` and `t` key.

4. **Attention-sorted tree + virtual `Needs You` node.**
   - Re-section the tree by state.
   - Add aggregate inbox query (file or daemon API).
   - Add cross-session inbox detail-mode view.

5. **Humanloop type extensions** (parallel track in humanloop repo).
   - Add `notify`, `error`, `decision` types.
   - Add `mountPanel.loadDeck` and source context.

6. **Resolution mode takeover.**
   - Mount humanloop full-screen instead of as panel.
   - Wire auto-chain across sessions (cross-session next-item query).
   - `Shift+J/K` queue navigation in resolution mode.

7. **Error generation.**
   - Orphan handler emits `error`-type asks.
   - Crash detection emits `error`-type asks.
   - Tool-failure heuristics emit `error`-type asks.
   - Takeover disposition triggers tmux pane switch.

## Out of Scope

- Project layer (multiple repos in one sisyphus instance)
- Fork / compare (run two strategies in parallel, compare outputs)
- Notifications redesign (current iTerm/macOS path stays — works for now)
- Cross-platform notifications (Linux, Windows)
- Live agent stream rendering inside the TUI (stays in tmux panes)
- Configuration of layout proportions (everything still hardcoded; revisit if real demand)
- Search across cycle logs / asks / digests
- Mobile / web rendering of the dashboard

## Open Questions

1. **Choice vs decision migration.** Two parallel types or replace `choice` with `decision`-with-empty-descriptions? The latter is cleaner long-term but requires updating every existing agent prompt.
2. **Notify queueing vs toast-only.** Should notifications hit the queue at all, or only show as a toast + log? Current spec says queue with FYI badge. If agents abuse notify for too many FYIs, may need to revisit.
3. **Bulk-dismiss UX.** From overview, `Shift+D` to dismiss all notifies from a session? From all sessions? Probably only same-session — global dismiss is footgun-prone.
4. **Skip persistence.** Today, navigating away from an item with `Shift+J` doesn't change its state. Should there be an explicit "snooze 1h" / "snooze until session updates"? Defer until pain is real.
5. **`l` key behavior.** Toggle detail to cycle log: which cycle? Most recent? User-selectable cycle? Probably most recent with `]` / `[` to navigate cycles. Defer the navigation UI.
6. **Resolution mode visual sizing.** Termrender visuals can be wide. Full-bleed body lets them breathe, but very wide visuals might still need horizontal scroll. Defer to ASK implementation.
