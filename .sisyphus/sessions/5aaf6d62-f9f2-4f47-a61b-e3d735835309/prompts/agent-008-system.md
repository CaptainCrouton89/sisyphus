# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Integrate the companion into the TUI: pin to bottom of tree panel, add companion overlay on leader+c.

## Context Files
- Read `context/plan-companion.md` section "WP6: TUI Integration" for requirements
- Read `context/explore-companion-integration.md` sections 4-6 for exact line numbers and patterns
- Read `src/tui/CLAUDE.md` and `src/tui/panels/CLAUDE.md` for TUI conventions

## Overall Session Goal
Implement a persistent ASCII companion character inside sisyphus that renders in tmux status bar, TUI, and CLI.

## Your Task: TUI companion integration in 3 files

### 1. `src/tui/panels/tree.ts` — Pin companion to bottom of tree panel

Import `loadCompanion` from `../../daemon/companion.js` and `renderCompanion` from `../../shared/companion-render.js`.

In `renderTreePanel()`:
- Reduce `maxVisible` by 2 (1 blank line + 1 companion line) so the companion always has space at the bottom
- After the bottom scroll indicator rendering, render the companion at `y + h - 2` (last inner row before bottom border):

```typescript
// Companion pinned to bottom
try {
  const companion = loadCompanion();
  const companionStr = renderCompanion(companion, ['face', 'boulder', 'commentary'], { maxWidth: innerW, color: true });
  writeClipped(buf, innerX, y + h - 2, companionStr, innerW);
} catch { /* companion load failure is non-fatal */ }
```

This should be wrapped in try/catch — companion load failures must never break the TUI render.

### 2. `src/tui/panels/overlays.ts` — Companion detail overlay

Add a new export function `renderCompanionOverlay(buf, rows, cols, companion)`.

Follow the exact pattern of `renderHelpOverlay` (centered overlay with border):
- Import `CompanionState`, `AchievementDef` from `../../shared/companion-types.js`
- Import `renderCompanion`, `getBaseForm`, `getMoodFace` from `../../shared/companion-render.js`
- Import `ACHIEVEMENTS` from `../../daemon/companion.js`

Content layout (multi-line, centered overlay):
```
┌─ Companion ──────────────────────┐
│  (^.^) . "my-project"           │
│                                  │
│  Level 5 — Slope Familiar        │
│  Mood: happy   XP: 812          │
│                                  │
│  STR: 8    END: 12h              │
│  WIS: 3    LCK: 87%             │
│  PAT: 5h                        │
│                                  │
│  Achievements (4/35):           │
│  ✓ First Blood                  │
│  ✓ Flawless                     │
│  · Centurion                    │
│  ...                            │
│                                  │
│  "The boulder grows heavier..."  │
└──────────────────────────────────┘
```

Use `drawBorder` and `writeClipped` like other overlays. Set overlay width to ~40 chars. Show up to 8-10 achievements (unlocked first, then a few locked). Show last commentary if available.

### 3. `src/tui/input.ts` — Leader key `c` for companion overlay

In `handleLeaderKey()` function (around line 715-737), add a case for `'c'`:

```typescript
if (input === 'c') { handleLeaderAction({ type: 'companion-overlay' }, state, actions); return; }
```

You'll need to:
1. Add `'companion-overlay'` to the `LeaderAction` type union (find it in input.ts)
2. Add handling in `handleLeaderAction()` — set `state.mode = 'companion-overlay'` (or a suitable mode name)
3. Add dismissal: ESC or any key in the companion-overlay mode returns to navigate

In the render path, check for this mode and call `renderCompanionOverlay()`. Look at how `help` overlay mode works — companion overlay should follow the same pattern exactly.

**Important**: The `'c'` key is currently mapped as a TOP-LEVEL key (not leader) at line ~991 to `actions.openCompanionPane()`. The leader+c binding is separate — it opens the companion OVERLAY (stats view), while bare `c` opens the companion PANE (Claude session). Both should coexist.

## Important Constraints
- All companion operations wrapped in try/catch — failures never break TUI
- The TUI renders synchronously — `loadCompanion()` is a sync file read, which is fine
- Use `writeClipped` for all text output to respect buffer bounds
- Follow existing TUI overlay patterns exactly (drawBorder, centered positioning, etc.)
- Don't change existing keybinding behavior — only add new companion overlay to leader menu

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
