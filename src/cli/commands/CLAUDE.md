# CLI Commands

## dashboard.ts

`openDashboardWindow(tmuxSession, cwd)` and `registerDashboard` (the `sisyphus dashboard` command) launch the same TUI binary but through different mechanisms:
- `registerDashboard` runs `node tui.js` inline, blocking the current terminal (`stdio: 'inherit'`)
- `openDashboardWindow` creates a new tmux window and sends the command via `send-keys`

**Deduplication:** `openDashboardWindow` reads `@sisyphus_dashboard` (tmux session option storing window ID). If the stored ID is stale (window gone), it falls through and creates a fresh window, updating the option. Returns `true` if created, `false` if existing window was focused — `start.ts` ignores the return value.

**`; exit` suffix:** The command sent to the new window is `node tui.js ...; exit`. Without this, the window would stay open with a shell prompt after the TUI process exits.

## companion.ts

**Daemon boundary:** `sisyphus companion` (bare) contacts the daemon via socket; `sisyphus companion memory` never contacts the daemon — it reads `loadMemoryStrict()` directly from the memory store file. A dead daemon blocks bare `companion` but not `companion memory`.

**`MemoryStoreParseError` vs other errors:** `runCompanionMemory` catches `MemoryStoreParseError` specifically, prints to stderr, and exits with code 1. All other errors propagate uncaught. This distinction matters: parse errors are expected (corrupted file); other errors are not.

**`--repo` is an exact path match:** `obs.repo === repo` — full path string, not basename. Passing a basename like `myapp` matches nothing; pass the full path that was recorded. Display trims to `basename(rec.repo)` regardless.

**Observations outside `CATEGORY_ORDER` are silently dropped:** The `grouped.get(obs.category)?.push(...)` call is a no-op for unknown categories — no "other" bucket, no warning. Only the four categories in `CATEGORY_ORDER` (`session-sentiments`, `repo-impressions`, `user-patterns`, `notable-moments`) ever render.

**`state.prunedAt === null` shows "never":** Memory stores that have never been pruned show "never" in the footer. The footer always appears (not conditional on `prunedAt`), so agents can parse it reliably.

**`--name` is a side-effecting setter on the view command:** `--name <name>` passes the name to the daemon on every bare `companion` call. Omitting it sends `name: undefined` (no change). There is no separate set-name command — passing `--name` once sets it persistently via the same socket request that fetches the profile.

**Repos section uses full path as key, not basename:** `companion.repos` is keyed by full repo path. Display shows the full path followed by optional `"nickname"` inline; crashes count is omitted entirely when zero; top 10 by visits descending with "… and N more" for the rest. Contrast: `companion memory` output uses `basename(rec.repo)` for display.

**`--badges` vs compact achievement view:** Default compact view groups all `ACHIEVEMENTS` by `def.category`; `CATEGORY_LABELS` provides display names for the four known categories (`milestone`, `session`, `time`, `behavioral`) and unknown categories fall back to their raw key (no silent drop). `--badges` delegates to `createBadgeGallery`/`renderBadgeCard` which renders all achievements including unearned ones as full cards in definition order.

## start.ts

**`SISYPHUS_CWD` env var:** Working directory comes from `process.env['SISYPHUS_CWD'] ?? process.cwd()`, not a `--cwd` flag. This is the only way to override cwd programmatically.

**Session naming collision:** `ensureTmuxSessionExists` names the session `sisyphus-{basename(cwd)}`. Two projects sharing a directory name (e.g., `/foo/app` and `/bar/app`) map to the same tmux session.

**`--no-tmux-check` misname:** Despite the flag name, it does NOT skip the tmux installation check (`isTmuxInstalled()` always runs). It skips tmux session management — no dashboard window, no attach/switch. The `tmuxSessionName` shown in the hint comes from `response.data.tmuxSessionName` (daemon-assigned), not from `ensureTmuxSessionExists` — it may be an `ssyph_`-prefixed session name.

**Attach timing:** When invoked outside tmux, `start` opens the dashboard window first, then calls `attachToTmuxSession` — so the user lands directly on the dashboard. When already inside tmux, `switch-client` is used instead of attach; no blocking call.

**Both `@sisyphus_cwd` and `openDashboardWindow` failures emit warnings:** Both `try/catch` blocks print `Warning:` messages to stderr (`"failed to tag tmux session..."` and `"failed to open dashboard window..."` respectively) — neither silently swallows errors, neither aborts the flow.

**`@sisyphus_cwd` session tag:** `start` sets this option on the tmux session *before* calling `openDashboardWindow` — so even if the dashboard open fails (non-fatal catch), the tag is already written. `sessions-manifest.ts` uses it to discover "home sessions" — non-`ssyph_`-prefixed sessions started via `sisyphus start`. Without it, the session is invisible to the daemon manifest (which otherwise only auto-discovers `ssyph_`-prefixed agent sessions).

**`Monitor:` output timing:** When invoked outside tmux, the `console.log('Monitor: sisyphus status ...')` runs *after* `attachToTmuxSession` returns — i.e., after the user detaches, not before attach. When already inside tmux, `attachToTmuxSession` is never called (`if (!process.env['TMUX'])` guard), so Monitor prints immediately after `openDashboardWindow` returns.

**tmux session selection when already inside tmux:** `start` uses the *current* tmux session (`getTmuxSession()`) rather than creating a new one. The new dashboard window opens inside the session the user is already in — no new session is created.

## tmux-sessions.ts

`sisyphus tmux-sessions` is registered `{ hidden: true }` — designed for tmux `status-right` injection, not direct use.

**CWD-scoped output:** Finds the current tmux session in the manifest, extracts its `cwd`, then filters all manifest sessions to those with the same `cwd`. Sessions from other projects are never shown. If the current session has no manifest entry, or only one session matches, the command produces no output at all (no separators, no placeholder).

**Silent no-op conditions:** Returns with no output if (1) manifest file doesn't exist, (2) current tmux session isn't listed in the manifest, or (3) only one session matches the current cwd. The status bar segment simply disappears rather than showing an error.

**Phase-to-dot mapping:** `DOT_MAP` is the complete valid set for rendering. Phases not in `DOT_MAP` produce no dot — the session still appears, just without an indicator. `type: 'S' | 'H'` in manifest entries is not used for display logic here.

**Display name stripping:** Strips `ssyph_{one-segment}_` prefix from agent session names. `sisyphus-{basename}` home session names don't match the pattern and are rendered unchanged.

## review.ts

**`--wait` consumes the feedback file:** After the TUI window closes, `--wait` reads the feedback file adjacent to the JSON into stdout then **deletes it** (`unlinkSync`). One-shot — running `--wait` twice on the same session won't surface feedback the second time. Feedback filename differs by command: `requirements --wait` reads `review-feedback.md`; `design --wait` reads `design-feedback.md`.

**`feedbackPath` follows `targetPath`, not cwd:** Feedback is written adjacent to the JSON file. If you pass a custom file path outside the session dir, the feedback lands next to that file, not in the session context dir.

**`review-completed` re-reads the JSON after TUI exits:** Timing fields (`meta.reviewStartedAt`, `meta.reviewCompletedAt`) are read from the artifact *after* the window closes — the TUI must write these back into the JSON during the session for accurate history events.

**History events require both `--wait` and a resolved `sessionId`:** `emitReviewEvent` is only called when `opts.wait` is set *and* `sessionId` resolves from `--session-id` or `SISYPHUS_SESSION_ID`. Auto-detected sessions (no flag, no env) silently produce no history events even with `--wait`. `--pane`-only invocations also produce no history entries.

**`review-started` fires before user interaction:** Emitted immediately after `openTmuxPane`, before `waitForTmuxPane` blocks. A `review-started` with no matching `review-completed` is possible (pane killed mid-session). `review-started` carries only `type` and `filePath`; `review-completed` carries full timing and item counts. Both events share `sessionId` for correlation.

**Session auto-detection order:** `readdirSync(sessionsDir).reverse()` — reverse *alphabetical* order, not mtime. Since session IDs are UUIDv4 (random), this doesn't reliably pick the most recently created session when multiple sessions have `requirements.json`.

**Binary name split:** `requirements` command runs `review.js`; `design` command runs `design.js`. These are separate TUI entry points in `dist/`. `design` has `--wait` (same behavior as `requirements`) but no `--export` option.

**Binary co-location constraint:** The TUI binary path is resolved via `join(import.meta.dirname, binaryName)` — adjacent to the running CLI file. Running the CLI from source with `tsx` fails because `review.js`/`design.js` don't exist in `src/cli/commands/`; always use the built `dist/` binaries.

**`--cwd` flag on review commands:** `resolveContextArtifact` resolves the project directory as `opts.cwd || process.env.SISYPHUS_CWD || process.cwd()`. Both `requirements` and `design` accept `--cwd <path>` which takes precedence over the env var — useful for agents targeting a different project than `SISYPHUS_CWD` points to.

**`--export` stdout is the output path:** On success, `process.stdout.write(resolve(outPath) + '\n')` — agents parsing output get the absolute path, not a human-readable confirmation message.

**`--export` hand-edit guard:** Compares rendered output byte-for-byte against the existing `requirements.md`. Any difference (even whitespace) is treated as a hand-edit and blocks the write. `--force` renames the existing file to `.bak` first, then does an atomic tmp+rename write. The `.bak` is unconditionally overwritten if it already exists.

**`review-completed` "reviewed" count:** Counts items where `reviewAction` is truthy (any action) **or** `status === 'approved'` — a union, not intersection. An item with `reviewAction: 'bounce-to-design'` counts as reviewed even if status is still `draft`. Item traversal differs by type: requirements flattens `groups[].requirements[]`; design flattens `sections[].items[]`. History event consumers must use the correct path per `data.type`.

**`meta.bounceIterations` is a global integer, not a per-section map (requirements only):** As of the current schema, `bounceIterations` is `integer` — a single counter for the whole artifact. Previously it was `Record<sectionId, integer>`; writing an object keyed by section ID is now a schema violation. `meta.nextSectionId` was also removed from the schema — spec lead agents must not write this field. The design schema has no `bounceIterations` or `stage` fields at all — writing them to a design artifact is silently ignored at the schema level but signals a logic error.

**Requirements `meta` field optionality:** `meta.title`, `meta.summary`, `meta.version`, and `meta.draft` are optional in the schema. The spec agent's requirements-writer doesn't set them (it uses `meta.stage` and `meta.bounceIterations` instead). The `--export` renderer handles missing fields gracefully — no title produces no header, no draft number skips the draft line. Standalone requirements files that set these fields still render them.

**`safeAssumptions` TUI behavior and constraints:** Collapsed by default in the group-intro phase with a count badge; bulk-approvable in one keystroke; expandable for spot-check. Cap is 9 per group — matches the TUI's 1-9 number-key affordance; exceeding this silently truncates what's keyboard-accessible. Same REQ-NNN shape as `requirements[]` entries (id, ears, criteria, agentNotes required — though `ears` is optional on safeAssumptions in practice; the export renderer handles missing `ears` gracefully). IDs must be unique across **all** groups and `safeAssumptions` arrays in the file — not just within one group. Use `agentNotes` to briefly justify why each item qualifies as safe. Disqualifiers: anything novel, anything uncertain, anything that would change with a small design tweak. `--export` renders `safeAssumptions` under `### Safe Assumptions` per group — the hand-edit guard checks the full rendered output including these sections.

**`openQuestions` in groups (requirements) / sections (design):** Cross-cutting questions that don't belong to a single item. Shown after that group/section's items in the TUI. TUI adds a "Custom answer" option automatically — don't pre-fill it in the JSON. `selectedOption` type differs by artifact: requirements stores an **integer index** into `options[]` (`integer | null`); design stores the **title string** of the chosen option (`string | null`). Both are `null` when the user types a custom response. `--export` renders them under `### Open Questions` per group.

**Approved items skip on TUI re-entry:** Items with `status === 'approved'` are skipped when the TUI re-opens the same JSON file. A partial review session that sets some items to `approved` will resume from the first non-approved item — the TUI does not replay approved items.

**`reviewAction: 'bounce-to-design'`** (requirements only): Signals the user believes the requirement exposes a flaw in the underlying design and wants to revisit Stage 1 before continuing. Design items use a different action set: `agree | pick-alt | comment` — no `bounce-to-design`. Writing `bounce-to-design` into a design item's `reviewAction` is a schema violation.

**Design `decision.lenses`:** Free-form `Record<string, string>` — pick evaluation dimensions relevant to the specific decision (complexity, durability, performance, etc.), not a fixed set. The `decision` object itself is optional; omit it entirely when there's only one reasonable approach. `selectedAlternative` (TUI-owned) stores the title string of the alternative the user picked with `pick-alt`; leave it null when writing.
