# CLI Layer

Entry point: `index.ts` (becomes `sisyphus` command via shebang).

## Entry point

- `sortSubcommands: false` — help lists commands in registration order; append new commands at the end of `index.ts`
- First-run welcome: `skipWelcome` exempts `doctor`, `setup`, `init`, `getting-started`, `uninstall`, `help`, `--help`, `-h`, `--version`, `-V`; any other command consumes the welcome

## Tmux integration

- `M-s` cycles sessions in root table; `C-s` enters `sisyphus` key table
- `@sisyphus_dashboard` stores window ID (not name) — survives renames
- `ssyph_` prefix marks sisyphus sessions; renaming breaks pane-monitor detection
- `setupTmuxKeybind` conflict detection requires running tmux server — if tmux is down, bindings are written without conflict checking
- `removeTmuxKeybind` scans both `~/.tmux.conf` and `~/.config/tmux/tmux.conf`
- Status bar: daemon pre-renders to global `@sisyphus_status`; add `#{@sisyphus_status}` to `status-right`

## Companion

- `sisyphus companion-context` — machine-readable only: outputs `{"additionalContext":"..."}` with no trailing newline. Does not contact the daemon. Designed as a Claude Code `userPromptSubmit` hook.

## Review commands

- `registerReview` registers two commands: `requirements` and `design` — not a `review` command
- `--wait` implies `--window` (undocumented in help)
- Schemas and annotated writing guides are hardcoded constants in `review.ts` — update them there if artifact format changes

## Status bar segments

`sisyphus register-segment` / `unregister-segment` — external status bar injection via daemon socket. Lower priority = closer to edge.

## Command pitfalls

- **spawn**: `--repo` rejects paths containing `/`, `..`, or `\`. `--list-types` exits before any validation (no session, no tmux check).
- **doctor**: always exits 0 — not CI-usable as a health gate
- **getting-started**: outputs `<claude-instructions>` XML for Claude, not human-readable. Checks `CLAUDECODE` env.
- **status**: `inferOrchestratorPhase()` is a local heuristic, not daemon-provided. Pane output XML tags carry attributes for machine consumption.
- **notify**: `pane-exited` uses `rawSend()` (single attempt, no retry) — correct by design since daemon may be stopped
- **tmux-sessions**: `process.stdout.write()` (no trailing newline) — `console.log` breaks tmux format string parsing
- **continue vs resume**: `continue` reactivates in-place (same cycle); `resume` increments cycle with optional new instructions
