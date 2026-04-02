# src/tui/lib

## Key Patterns

### Text Formatting (format.ts)
- `stripMarkdown()` is lossy (collapses whitespace); use `cleanMarkdown()` for structure-preserving inline cleanup
- Both `truncate()` and `cleanMarkdown()` normalize wide emoji → single-width (✅→✓) to prevent terminal wrapping; callers must not double-normalize
- `Seg` / `DetailLine = Seg[]` — multi-segment styled lines; use `seg(text, opts)` / `singleLine()` builders, not raw objects
- `agentDisplayName(agent)` — returns `agentType` as fallback when `name` is absent

### Tree Building (tree.ts)
- Sessions sorted: active+open → active+closed → paused+open → paused+closed → completed (by recency within groups)
- `buildTree(sessions, selectedSession, expanded, cwd, polledContextFiles)` — expands only selected session to avoid rendering all hierarchies
- Node IDs prefixed: `session:`, `cycle:`, `agent:`, `report:`, `messages:`, `message:`, `context:`, `context-file:`
- `findParentIndex(nodes, index)` — locate ancestor in node list

### Claude Companion Context (context.ts)
- XML format: `buildCompanionContext()` aggregates recent sessions (≤7 days) with task, status, agent counts, goal (first line), roadmap todos
- `buildSessionContext()` provides full context for session management: agent details, reports, completion status
- `escapeXml()` handles safe embedding of user-provided content

### Tmux Integration (tmux.ts)
- `openCompanionPane(cwd)` — Splits pane horizontally (33%), runs Claude with `--dangerously-skip-permissions` and companion plugin, sets `SISYPHUS_COMPANION_CWD` env var; caches `companionPaneId` for reuse
- Companion plugin auto-copies from `src/tui/lib/templates/companion-plugin` to global dir on first use
- Dashboard prompt rendered from `dashboard-claude.md` (with `{{CWD}}`) and written to `globalDir()/dashboard-companion-prompt.md` — persists and overwrites on each open, not a temp file
- `openEditorPopup(cwd, editor, filePath, size?)` — Terminal editors use `tmux display-popup`, GUI editors run directly; extracts basename from editor path to handle full paths and args (e.g. `"/usr/bin/nvim -u NONE"` still matches)
- `editInPopup(cwd, editor, opts?)` — Creates temp file, opens in editor, returns trimmed content or `null` (not `""`) if empty. `opts.content` pre-populates the file (for edit-existing workflows); `opts.size` overrides popup dimensions (default `90%×90%`)
- Utility popups: `openLogPopup()` (tail daemon logs), `openShellPopup(cwd, cmd)` (appends "Press enter to close" pause after cmd exits), `openInFileManager(path)`, `openClaudeResumePopup(cwd, sessionId, resumeEnv?, resumeArgs?)` (resume Claude session in popup)
- `openClaudeResumeSession(cwd, claudeSessionId, sessionLabel, resumeEnv?, resumeArgs?)` — Creates a full new tmux **session** (not popup) for Claude resume; **idempotent** — if a session with the same name already exists, returns it without re-spawning. Mirrors `configureSessionDefaults` from daemon's `tmux.ts` (pane-border-status top, rename disabled), sets `@sisyphus_cwd` on session, names pane `ssph:orch {label}`. Returns session name. Session name via `tmuxSessionName(cwd, sessionLabel)` — the caller is responsible for any `-resume` suffix in the label. Underscores as separators because tmux reserves `.` for `window.pane` targeting and `/` for target resolution.
- `resumeEnv` (on both resume functions) is a raw shell command fragment prepended as `${resumeEnv} && claude ...` — pass full shell expressions (e.g. `"export FOO=bar"`), not bare variable names
- `registerDashboardWindow()` — Stores current window ID as `@sisyphus_dashboard` tmux option; called at TUI startup so the M-S (sisyphus-home) keybinding can locate the dashboard window across sessions
- `listAllWindowIds()` — Returns window IDs across all tmux sessions (`list-windows -a`); use for global existence checks where `windowExists()` (current session only) is insufficient
- Window/pane helpers: `getWindowId()`, `selectWindow()`, `selectPane()`, `windowExists()`, `switchToSession()`

### Neovim Bridge (nvim-bridge.ts)
- `NvimBridge(cols, rows, onRender)` — Spawns Neovim in a PTY, xterm buffer, auto-detects nvim via `which nvim`, ready after 500ms
- **State**: `available` (nvim found), `ready` (spawned and settled), `dirty` (buffer changed), `cursorStyle` (DECSCUSR), `respawning` (respawn in progress), `wasReady` (prevents respawn during startup)
- **Lifecycle**: `respawn()` — cleanup and re-spawn nvim (e.g., after user quit); `resize(cols, rows)`, `destroy()` — cleanup PTY, xterm, timers
- **File ops**: `openFile(path, readonly)`, `openTabFiles(files[])` (150ms debounce), `openTabFile(path, readonly)` (direct terminal), `openComposeFile(tempPath, signalPath)` (compose mode: signal-based submit/cancel), `closeAllTabs()`
- **File tracking**: `trackEditableFiles()` snapshots editable files on disk for merge base; stored in `/tmp/sisyphus-nvim/base-*.md`
- **Lua execution**: `execLua()` writes to temp file (`/tmp/sisyphus-nvim/cmd-{pid}.lua`), libuv timer polls every 50ms (100ms initial)
- **3-way merge**: `mergeCheckOrReload()` — detects external file changes on disk, performs 3-way merge (git merge-file --union) for dirty buffers, reloads clean buffers via checktime, returns 'clean'/'union' if merge completed
- **Rendering**: `getRows()` — returns ANSI-escaped row strings with full color/attribute handling (cached until dirty); `getCursorPos()` → {x, y}; `checktime()` — reload changed files
- **Nvim settings**: Pre-init disables swap/backup, post-init hides UI elements (status line, line numbers, ruler), LSP suppressed, shortmess+=F

## Constraints

- **tmux operations** fail silently via `execSafe()` — check existence before operating; `listAllWindowIds()` spans all sessions while `windowExists()` is current-session only
- **Companion pane** auto-reuses if alive; killing the pane externally requires resetting module-level `companionPaneId = null` — there's no auto-detection of external kills
- **`openClaudeResumeSession`** must stay in sync with `configureSessionDefaults` in daemon's `tmux.ts` — if daemon session defaults change, update both
- **Context XML** must escape all user-provided content via `escapeXml()` before embedding
- **File reads** via `readFileSafe()` must handle missing files (`goal.md`, `roadmap.md` may not exist)
- **Neovim PTY**: `destroy()` must clean up all `/tmp/sisyphus-nvim/` files (cmd, merge status, snapshots). Compose mode signals submit/cancel via BufWritePost/QuitPre autocmds writing a temp file — not stdin. Escape Lua strings via `.replace(/\\/g, '\\\\').replace(/'/g, "\\'")`. Merge status from the previous cycle is consumed once per `mergeCheckOrReload()` call.
