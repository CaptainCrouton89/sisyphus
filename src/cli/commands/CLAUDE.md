# CLI Commands

## dashboard.ts

`openDashboardWindow(tmuxSession, cwd)` and `registerDashboard` (the `sisyphus dashboard` command) launch the same TUI binary but through different mechanisms:
- `registerDashboard` runs `node tui.js` inline, blocking the current terminal (`stdio: 'inherit'`)
- `openDashboardWindow` creates a new tmux window and sends the command via `send-keys`

**Deduplication:** `openDashboardWindow` reads `@sisyphus_dashboard` (tmux session option storing window ID). If the stored ID is stale (window gone), it falls through and creates a fresh window, updating the option. Returns `true` if created, `false` if existing window was focused — `start.ts` ignores the return value.

**`; exit` suffix:** The command sent to the new window is `node tui.js ...; exit`. Without this, the window would stay open with a shell prompt after the TUI process exits.

## start.ts

**`SISYPHUS_CWD` env var:** Working directory comes from `process.env['SISYPHUS_CWD'] ?? process.cwd()`, not a `--cwd` flag. This is the only way to override cwd programmatically.

**Session naming collision:** `ensureTmuxSessionExists` names the session `sisyphus-{basename(cwd)}`. Two projects sharing a directory name (e.g., `/foo/app` and `/bar/app`) map to the same tmux session.

**`--no-tmux-check` misname:** Despite the flag name, it does NOT skip the tmux installation check (`isTmuxInstalled()` always runs). It skips tmux session management — no dashboard window, no attach/switch.

**Attach timing:** When invoked outside tmux, `start` opens the dashboard window first, then calls `attachToTmuxSession` — so the user lands directly on the dashboard. When already inside tmux, `switch-client` is used instead of attach; no blocking call.

**`openDashboardWindow` failure is non-fatal:** Wrapped in `try/catch` with no error output. A broken tmux state won't abort the start flow.

**`@sisyphus_cwd` session tag:** `start` sets this option on the tmux session *before* calling `openDashboardWindow` — so even if the dashboard open fails (non-fatal catch), the tag is already written. `sessions-manifest.ts` uses it to discover "home sessions" — non-`ssyph_`-prefixed sessions started via `sisyphus start`. Without it, the session is invisible to the daemon manifest (which otherwise only auto-discovers `ssyph_`-prefixed agent sessions).

**`Monitor:` output timing:** The `console.log('Monitor: sisyphus status ...')` at the end of the action runs *after* `attachToTmuxSession` returns — i.e., after the user detaches from tmux, not before attach. It's a post-session message, not a pre-attach hint.

**tmux session selection when already inside tmux:** `start` uses the *current* tmux session (`getTmuxSession()`) rather than creating a new one. The new dashboard window opens inside the session the user is already in — no new session is created.

## review.ts

**`--wait` consumes the feedback file:** After the TUI window closes, `--wait` reads the feedback file adjacent to the JSON into stdout then **deletes it** (`unlinkSync`). One-shot — running `--wait` twice on the same session won't surface feedback the second time. Feedback filename differs by command: `requirements --wait` reads `review-feedback.md`; `design --wait` reads `design-feedback.md`.

**`feedbackPath` follows `targetPath`, not cwd:** Feedback is written adjacent to the JSON file. If you pass a custom file path outside the session dir, the feedback lands next to that file, not in the session context dir.

**`review-completed` re-reads the JSON after TUI exits:** Timing fields (`meta.reviewStartedAt`, `meta.reviewCompletedAt`) are read from the artifact *after* the window closes — the TUI must write these back into the JSON during the session for accurate history events.

**History events require both `--wait` and a resolved `sessionId`:** `emitReviewEvent` is only called when `opts.wait` is set *and* `sessionId` resolves from `--session-id` or `SISYPHUS_SESSION_ID`. Auto-detected sessions (no flag, no env) silently produce no history events even with `--wait`. `--pane`-only invocations also produce no history entries.

**Session auto-detection order:** `readdirSync(sessionsDir).reverse()` — reverse *alphabetical* order, not mtime. Since session IDs are UUIDv4 (random), this doesn't reliably pick the most recently created session when multiple sessions have `requirements.json`.

**Binary name split:** `requirements` command runs `review.js`; `design` command runs `design.js`. These are separate TUI entry points in `dist/`. `design` has `--wait` (same behavior as `requirements`) but no `--export` option.

**`--export` stdout is the output path:** On success, `process.stdout.write(resolve(outPath) + '\n')` — agents parsing output get the absolute path, not a human-readable confirmation message.

**`--export` hand-edit guard:** Compares rendered output byte-for-byte against the existing `requirements.md`. Any difference (even whitespace) is treated as a hand-edit and blocks the write. `--force` renames the existing file to `.bak` first, then does an atomic tmp+rename write. The `.bak` is unconditionally overwritten if it already exists.

**`review-completed` "reviewed" count:** Counts items where `reviewAction` is truthy (any action) **or** `status === 'approved'` — a union, not intersection. An item with `reviewAction: 'bounce-to-design'` counts as reviewed even if status is still `draft`. Item traversal differs by type: requirements flattens `groups[].requirements[]`; design flattens `sections[].items[]`. History event consumers must use the correct path per `data.type`.
