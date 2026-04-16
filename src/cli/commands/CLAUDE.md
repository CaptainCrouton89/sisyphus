# CLI Commands

## setup.ts

**`daemonOk` fallback misrepresents failure:** If `ensureDaemonInstalled()` throws, `daemonOk` falls back to `isInstalled()` (plist file existence only). "✓ Daemon: Running" can appear when the daemon failed to start — as long as the plist exists. The output line does not distinguish "started successfully" from "plist present, start failed."

**Keybindings always shows ✓:** `printResults` hardcodes `✓` before the keybindings line regardless of `setupTmuxKeybind()` status. Error messages from non-installed/non-already-installed statuses appear as the ✓ detail text, not as a ✗ failure.

**Execution order:** `runOnboarding()` → `ensureDaemonInstalled()` → `setupTmuxKeybind()`. Daemon install happens before keybinding setup; a daemon install failure does not abort keybind setup.

## dashboard.ts

`openDashboardWindow(tmuxSession, cwd)` and `registerDashboard` (the `sisyphus dashboard` command) launch the same TUI binary but through different mechanisms:
- `registerDashboard` runs `node tui.js` inline, blocking the current terminal (`stdio: 'inherit'`)
- `openDashboardWindow` creates a new tmux window and sends the command via `send-keys`

**Deduplication:** `openDashboardWindow` reads `@sisyphus_dashboard` (tmux session option storing window ID). If the stored ID is stale (window gone), it falls through and creates a fresh window, updating the option. Returns `true` if created, `false` if existing window was focused — `start.ts` ignores the return value.

**`; exit` suffix:** The command sent to the new window is `node tui.js ...; exit`. Without this, the window would stay open with a shell prompt after the TUI process exits.

## scratch.ts

**No deduplication:** `sisyphus scratch` always creates a new tmux window named `"scratch"`. Unlike `openDashboardWindow`, there is no `@sisyphus_scratch` tracking — repeated calls stack up multiple windows.

**`--dangerously-skip-permissions` is hardcoded:** The claude invocation always includes it. There is no flag to omit it.

**No `; exit` suffix:** The window persists as a shell after claude exits (contrast with dashboard). Intentional — scratch sessions are exploratory.

**`--cwd` flag takes precedence over `SISYPHUS_CWD`:** CWD resolution order is `-c/--cwd` flag → `SISYPHUS_CWD` env → `process.cwd()`. Unlike `start.ts` (which has no `--cwd` flag and reads only `SISYPHUS_CWD`), scratch accepts per-invocation overrides without touching the environment.

**Home session lookup via live tmux option, not manifest:** `findHomeSession` reads `@sisyphus_cwd` from each non-`ssyph_*` session at call time. Falls back silently to the current tmux session if no match found — no warning is printed. CWD trailing slashes are stripped before matching, so `@sisyphus_cwd` must be stored without trailing slash (which `start.ts` ensures).

**Prompt is positional args joined with a space:** `sisyphus scratch foo bar` becomes `-p "foo bar"`. No prompt omits the flag entirely (non-interactive claude session).

## companion.ts

**Daemon boundary:** `sisyphus companion` (bare) contacts the daemon via socket; `sisyphus companion memory` never contacts the daemon — it reads `loadMemoryStrict()` directly from the memory store file. A dead daemon blocks bare `companion` but not `companion memory`.

**`MemoryStoreParseError` vs other errors:** `runCompanionMemory` catches `MemoryStoreParseError` specifically, prints to stderr, and exits with code 1. All other errors propagate uncaught. This distinction matters: parse errors are expected (corrupted file); other errors are not.

**`--repo` is an exact path match:** `obs.repo === repo` — full path string, not basename. Passing a basename like `myapp` matches nothing; pass the full path that was recorded. Display trims to `basename(rec.repo)` regardless.

**Observations outside `CATEGORY_ORDER` are silently dropped:** The `grouped.get(obs.category)?.push(...)` call is a no-op for unknown categories — no "other" bucket, no warning. Only the four categories in `CATEGORY_ORDER` (`session-sentiments`, `repo-impressions`, `user-patterns`, `notable-moments`) ever render.

**`--name` is a side-effecting setter on the view command:** `--name <name>` passes the name to the daemon on every bare `companion` call. Omitting it sends `name: undefined` (no change). There is no separate set-name command — passing `--name` once sets it persistently via the same socket request that fetches the profile.

**`--badges` vs compact achievement view:** Default compact view groups all `ACHIEVEMENTS` by `def.category`; `CATEGORY_LABELS` provides display names for the four known categories (`milestone`, `session`, `time`, `behavioral`) and unknown categories fall back to their raw key (no silent drop). `--badges` delegates to `createBadgeGallery`/`renderBadgeCard` which renders all achievements including unearned ones as full cards in definition order.

## start.ts

**`SISYPHUS_CWD` env var:** Working directory comes from `process.env['SISYPHUS_CWD'] ?? process.cwd()`, not a `--cwd` flag. This is the only way to override cwd programmatically.

**Session naming collision:** `ensureTmuxSessionExists` names the session `sisyphus-{basename(cwd)}`. Two projects sharing a directory name (e.g., `/foo/app` and `/bar/app`) map to the same tmux session.

**`--no-tmux-check` misname:** Despite the flag name, it does NOT skip the tmux installation check (`isTmuxInstalled()` always runs). It skips tmux session management — no dashboard window, no attach/switch. The `tmuxSessionName` shown in the hint comes from `response.data.tmuxSessionName` (daemon-assigned), not from `ensureTmuxSessionExists` — it may be an `ssyph_`-prefixed session name.

**`@sisyphus_cwd` session tag:** `start` sets this option on the tmux session *before* calling `openDashboardWindow` — so even if the dashboard open fails (non-fatal catch), the tag is already written. `sessions-manifest.ts` uses it to discover "home sessions" — non-`ssyph_`-prefixed sessions started via `sisyphus start`. Without it, the session is invisible to the daemon manifest (which otherwise only auto-discovers `ssyph_`-prefixed agent sessions).

**`Monitor:` output timing:** When invoked outside tmux, the `console.log('Monitor: sisyphus status ...')` runs *after* `attachToTmuxSession` returns — i.e., after the user detaches, not before attach. When already inside tmux, `attachToTmuxSession` is never called (`if (!process.env['TMUX'])` guard), so Monitor prints immediately after `openDashboardWindow` returns.

## tmux-sessions.ts

`sisyphus tmux-sessions` is registered `{ hidden: true }` — designed for tmux `status-right` injection, not direct use.

**Silent no-op conditions:** Returns with no output if (1) manifest file doesn't exist, (2) current tmux session isn't listed in the manifest, or (3) only one session matches the current cwd. The status bar segment simply disappears rather than showing an error.

**Phase-to-dot mapping:** `DOT_MAP` is the complete valid set for rendering. Phases not in `DOT_MAP` produce no dot — the session still appears, just without an indicator. `type: 'S' | 'H'` in manifest entries is not used for display logic here.

**Display name stripping:** Strips `ssyph_{one-segment}_` prefix from agent session names. `sisyphus-{basename}` home session names don't match the pattern and are rendered unchanged.

## review.ts

**`--wait` consumes the feedback file:** After the TUI window closes, `--wait` reads the feedback file adjacent to the JSON into stdout then **deletes it** (`unlinkSync`). One-shot — running `--wait` twice on the same session won't surface feedback the second time. Feedback filename differs by command: `requirements --wait` reads `review-feedback.md`; `design --wait` reads `design-feedback.md`.

**History events require both `--wait` and a resolved `sessionId`:** `emitReviewEvent` is only called when `opts.wait` is set *and* `sessionId` resolves from `--session-id` or `SISYPHUS_SESSION_ID`. Auto-detected sessions (no flag, no env) silently produce no history events even with `--wait`.

**Session auto-detection order:** `readdirSync(sessionsDir).reverse()` — reverse *alphabetical* order, not mtime. Since session IDs are UUIDv4 (random), this doesn't reliably pick the most recently created session when multiple sessions have `requirements.json`.

**Binary co-location constraint:** The TUI binary path is resolved via `join(import.meta.dirname, binaryName)` — adjacent to the running CLI file. Running the CLI from source with `tsx` fails because `review.js`/`design.js` don't exist in `src/cli/commands/`; always use the built `dist/` binaries.

**`--export` hand-edit guard:** Compares rendered output byte-for-byte against the existing `requirements.md`. Any difference (even whitespace) is treated as a hand-edit and blocks the write. `--force` renames the existing file to `.bak` first, then does an atomic tmp+rename write.

**`meta.bounceIterations` is a global integer, not a per-section map (requirements only):** Previously `Record<sectionId, integer>`; writing a keyed object is now a schema violation. `meta.nextSectionId` was also removed — spec lead agents must not write this field. The design schema has no `bounceIterations` or `stage` fields — writing them signals a logic error.

**`safeAssumptions` constraints:** Cap is 9 per group (TUI 1-9 key affordance; exceeding 9 silently truncates keyboard access). IDs must be unique across **all** groups and `safeAssumptions` arrays in the file — not just within one group. `--export` renders them under `### Safe Assumptions` per group; the hand-edit guard checks the full rendered output including these sections.

**`openQuestions` `selectedOption` type differs by artifact:** Requirements stores an **integer index** into `options[]`; design stores the **title string** of the chosen option. Both are `null` for custom responses. Don't pre-fill the "Custom answer" option — the TUI adds it automatically.

**`reviewAction: 'bounce-to-design'`** (requirements only): Design items use `agree | pick-alt | comment` — writing `bounce-to-design` into a design item is a schema violation.

## yield.ts

**No orchestrator identity check:** The parent CLAUDE.md states `yield` checks `SISYPHUS_AGENT_ID === 'orchestrator'` — it does not. The only guard is `assertTmux()` (checks `$TMUX` env, not agent identity). Any agent inside tmux can call `sisyphus yield`; `agentId: 'orchestrator'` is hardcoded in the request payload unconditionally.

**stdin consumed only when `--prompt` absent:** `opts.prompt ?? await readStdin() ?? undefined` — stdin is not read if `--prompt` is provided. Piping to a call that includes `-p` silently discards stdin.

**`--mode` has no CLI validation:** The five modes (`discovery`, `planning`, `implementation`, `validation`, `completion`) are documented in help text but not enforced here — any string is forwarded to the daemon as-is. Validation (or silent ignore) happens daemon-side.

## history.ts

**`INTERACTIVE_AGENT_TYPES` is a hardcoded set:** `sisyphus:requirements`, `sisyphus:design`, `sisyphus:spec` have their `activeMs` bucketed as interactive (TUI wait time), not compute, in both the detail view and `--stats`. New TUI-based agent types must be added here or their time inflates compute averages.

**`findSession` resolution order:** exact UUID → `startsWith` prefix → exact name match → name `includes` substring. The final step can match ambiguously — first result in newest-first sort wins. Passing a short substring that appears in multiple session names is unpredictable.

**`--events` + `--json` outputs the event array, not the summary object:** `--json` alone outputs the summary; `--events` alone renders formatted timeline; both together outputs the events array as JSON. `--events` is silently ignored in list mode (no session argument).

**`listSessions` calls `loadAllSummaries()` twice:** Once to build the filtered display list, a second time for the "Showing X of Y" footer. The footer total always reflects unfiltered history regardless of `--cwd`/`--status`/`--since`/`--search`.
