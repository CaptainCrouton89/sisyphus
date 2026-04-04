# src/tui/lib

## Key Patterns

### Text Formatting (format.ts)
- `stripMarkdown()` is lossy (collapses whitespace); use `cleanMarkdown()` for structure-preserving inline cleanup
- Both `truncate()` and `cleanMarkdown()` normalize wide emoji → single-width (✅→✓) to prevent terminal wrapping; callers must not double-normalize
- `wrapText(text, width)` calls `cleanMarkdown` internally — callers must not pre-clean or emoji normalization doubles
- `extractFirstSentence(text, maxLen)` — skips structural lines (headers, fences, tables, `|`-prefixed, length < 5), finds sentence break at `. ` between cols 10–maxLen, falls back to `truncate(stripMarkdown(text), maxLen)`; use over `truncate()` for summary displays
- `durationColor(startOrMs, endIso?)` — first arg is either ms `number` or ISO start string; thresholds: `''` < 10m, `'yellow'` < 30m, `'red'` ≥ 30m
- `Seg` / `DetailLine = Seg[]` — multi-segment styled lines; use `seg(text, opts)` / `singleLine()` builders, not raw objects. `Seg.bg` is raw ANSI format (`'48;2;R;G;B'`), not a color name
- `agentDisplayName(agent)` — returns `agentType` when `name === id` (name defaults to id when unset; this is the "no display name" path, not literally absent)
- `messageSourceLabel(source, agentId?)` — throws if `source === 'agent'` and `agentId` is undefined

### Tree Building (tree.ts)
- Sessions sorted: active+open → active+closed → paused+open → paused+closed → completed (by recency within groups)
- `buildTree(sessions, selectedSession, expanded, cwd, polledContextFiles)` — expands only selected session to avoid rendering all hierarchies
- Node IDs prefixed: `session:`, `cycle:`, `agent:`, `report:`, `messages:`, `message:`, `context:`, `context-file:`
- **`SessionTreeNode.expanded = isExpanded && isSelected`** — a session in `expanded` set only renders children when it's also the selected session; expanding a non-selected session is silently deferred until selection
- **`SessionTreeNode.cycleCount` and `completedAt` are only populated for `isSelected`** — non-selected sessions emit `cycleCount: 0` and `completedAt: undefined` regardless of actual state. **`runningAgentCount` is not gated** — always populated from `SessionSummary` for all sessions (drives companion spinner rate; see parent CLAUDE.md).
- **`AgentTreeNode.expanded = agentExpanded && hasReports`** — same gate as session: an agent in `expanded` set with no reports renders as non-expanded; `expandable` is also false, so the `expanded` flag is permanently deferred until a report arrives
- **Unassigned agents bucketed into latest cycle**: agents whose IDs don't appear in any cycle's `agentsSpawned` are appended to `cycles[0]` (most recent). Handles agents spawned outside the orchestrator flow — they appear in the latest cycle, not as orphans.
- **`messages` group only emitted when messages exist** — unlike `context`, no empty placeholder. `selectedSession.messages ?? []` guards against field absence on older session objects. Content: `msg.summary || msg.content`. `messageSourceLabel()` called here — throws if source is `'agent'` and `agentId` undefined (see format.ts).
- **`context` node always emitted** even with 0 files. `expanded` additionally gated on `contextFiles.length > 0` — toggling expanded on empty context silently defers until files appear. `polledContextFiles` is `[]` for non-selected sessions — context-file children never render except for selected session.
- `findParentIndex(nodes, index)` — walks backward to first node with `depth ≤ targetDepth`; returns `index` (not -1) for depth-0 nodes, `0` as ultimate fallback — callers cannot distinguish "already at root" from "parent is node 0"

### Claude Companion Context (context.ts)
- XML format: `buildCompanionContext()` aggregates recent sessions (≤7 days) with task, status, agent counts, goal (first line), roadmap todos
- `buildSessionContext()` provides full context for session management: agent details, reports, completion status
- `escapeXml()` handles safe embedding of user-provided content

### Tmux Integration (tmux.ts)
- `openCompanionPane(cwd)` — Splits pane horizontally (33%), runs Claude with `--dangerously-skip-permissions` and companion plugin, sets `SISYPHUS_COMPANION_CWD` env var; if pane is alive, **focuses it** (select-pane) rather than returning silently — pressing `c` always moves terminal focus to the companion pane
- Companion plugin auto-copies from `src/tui/lib/templates/companion-plugin` to global dir on first use
- Dashboard prompt rendered from `dashboard-claude.md` (with `{{CWD}}`) and written to `globalDir()/dashboard-companion-prompt.md` — persists and overwrites on each open, not a temp file
- `openEditorPopup(cwd, editor, filePath, size?)` — Terminal editors use `tmux display-popup`, GUI editors run directly; extracts basename from editor path to handle full paths and args (e.g. `"/usr/bin/nvim -u NONE"` still matches). Terminal editor detection uses the hardcoded `TERMINAL_EDITORS` set (`nvim vim vi nano emacs micro helix hx joe ne kak`) — adding a new terminal editor requires updating that set or it will launch directly without a popup
- `editInPopup(cwd, editor, opts?)` — Creates temp file, opens in editor, returns trimmed content or `null` (not `""`) if empty. `opts.content` pre-populates the file (for edit-existing workflows); `opts.size` overrides popup dimensions (default `90%×90%`)
- `promptInPopup(prompt, opts?)` — single-line bash `read` popup; returns `null` for both empty input **and** Ctrl-C/Escape cancel (out file absent on cancel, so both collapse to `null`). Default size `50%×3` — `h: '3'` is intentional (bare read line); overriding to a larger height is fine but unnecessary. Use this over `editInPopup` for single-line input; `editInPopup` blocks on a full editor and is the correct choice for multi-line content.
- Utility popups: `openLogPopup()` (tail daemon logs), `openShellPopup(cwd, cmd)` (appends "Press enter to close" pause after cmd exits), `openInFileManager(path)`, `openClaudeResumePopup(cwd, sessionId, resumeEnv?, resumeArgs?)` (resume Claude session in popup)
- `openClaudeResumeSession(cwd, claudeSessionId, sessionLabel, resumeEnv?, resumeArgs?)` — Creates a full new tmux **session** (not popup) for Claude resume; **idempotent** via exact `list-sessions` name match — renaming the session externally causes a new session to spawn instead of reattaching. Mirrors `configureSessionDefaults` from daemon's `tmux.ts` (pane-border-status top, rename disabled), sets `@sisyphus_cwd` on session, names pane `ssph:orch {label}`. Returns session name. Session name via `tmuxSessionName(cwd, sessionLabel)` — the caller is responsible for any `-resume` suffix in the label. Underscores as separators because tmux reserves `.` for `window.pane` targeting and `/` for target resolution. Window option flags (`-w`) target `${sessionName}:` (colon suffix) — bare session name doesn't resolve as a window target in tmux and silently fails.
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
