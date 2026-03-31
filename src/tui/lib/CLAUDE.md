# src/tui/lib

**TUI library utilities** — formatting, rendering, tree structures, daemon communication, and Claude companion context.

## Files

- **format.ts** — Display utilities: duration/time formatting, markdown stripping/cleaning, text truncation, status indicators, styled line segments
- **tree.ts** — Session tree building and sorting
- **tree-render.ts** — ASCII rendering with box-drawing connectors
- **tmux.ts** — Tmux integration: pane/window selection, editor popups, daemon log viewer, companion pane management
- **nvim-bridge.ts** — Neovim PTY with xterm rendering, file/tab management, Lua execution (100ms polling), 3-way merge for dirty buffers
- **context.ts** — XML context builders for Claude companion prompt
- **client.ts** — Daemon socket client (5s timeout, JSON requests)
- **reports.ts** — Load and handle agent report files

## Key Patterns

### Text Formatting & Colors
- **Time**: `formatDuration()`, `formatTimeAgo(iso)` → "2h ago", `formatTime(iso)` → "HH:MM"
- **Truncation**: `truncate(text, max)` — word-boundary-aware with '…', normalizes emoji width (✅→✓, ❌→✗)
- **Markdown**: `stripMarkdown()` (all syntax, lossy), `cleanMarkdown()` (inline, preserves structure, handles emoji), `stripFrontmatter()`, `extractFirstSentence(text, maxLen)`
- **Wrapping**: `wrapText(text, width)` — word-boundary aware with display-width calculation
- **Status/Duration**: `statusColor()`, `statusIndicator(status)` → ▶/✓/⏸/·; `durationColor(startOrMs, end?)` → yellow <30min, red ≥30min
- **Agent colors**: `agentTypeColor(type)` → blue/green/magenta/yellow; `agentStatusIcon(status)` → ▶/✓/✕/!/?
- **Mode**: `modeColor(mode)` → blue/green/cyan for planning/implementation/default; `abbreviateMode(mode)` → "impl"/"plan"
- **Message display**: `messageSourceLabel(source, agentId?)` → "You"/"agent-001"/"system"; `messageSourceColor(source)` → yellow/cyan/gray
- **Report**: `reportBadge(type)` → {label: "FINAL"|"UPDATE", color: "cyan"|"yellow"}
- **Agent**: `agentDisplayName(agent)` — returns name or agentType if unavailable
- **ANSI**: `ansiBold(text)`, `ansiDim(text)`, `ansiColor(text, color, bold?)`, `divider(width, char?)`

### Styled Line Rendering (format.ts)
- `Seg` — {text, color?, bold?, dim?, italic?, inverse?} — single styled segment
- `DetailLine = Seg[]` — multi-segment line with mixed styling
- `seg(text, opts)`, `singleLine(text, opts)` — builders for styled output

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
- `openCompanionPane(cwd)` — Splits pane horizontally (33%), runs Claude with companion plugin, caches `companionPaneId` for reuse
- Companion plugin auto-copies from `src/tui/lib/templates/companion-plugin` to global dir on first use
- Dashboard template (`dashboard-claude.md`) rendered with `{{CWD}}` only
- `openEditorPopup(cwd, editor, filePath, size?)` — Terminal editors use `tmux display-popup`, GUI editors run directly
- `editInPopup()` — Creates temp file, opens in editor, returns edited content
- Utility popups: `openLogPopup()` (tail daemon logs), `openShellPopup(cwd, cmd)`, `openInFileManager(path)`, `openClaudeResumePopup(cwd, sessionId)` (resume Claude session)
- Window/pane helpers: `getWindowId()`, `selectWindow()`, `selectPane()`, `windowExists()`, `switchToSession()`

### Neovim Bridge (nvim-bridge.ts)
- `NvimBridge(cols, rows, onRender)` — Spawns Neovim in a PTY, xterm buffer, auto-detects nvim via `which nvim`, ready after 500ms
- **State**: `available` (nvim found), `ready` (spawned and settled), `dirty` (buffer changed), `cursorStyle` (DECSCUSR tracking)
- **File ops**: `openFile(path, readonly)`, `openTabFiles(files[])` (150ms debounce), `openTabFile()` (direct terminal), `closeAllTabs()`
- **File tracking**: `trackEditableFiles()` snapshots editable files on disk for merge base; stored in `/tmp/sisyphus-nvim/base-*.md` with mtime tracking
- **Lua execution**: `execLua()` writes to temp file (`/tmp/sisyphus-nvim/cmd-{pid}.lua`), libuv timer polls every 50ms (100ms initial)
- **3-way merge**: `mergeCheckOrReload()` — detects external file changes on disk, performs 3-way merge (git merge-file --union) for dirty buffers, reloads clean buffers via checktime, returns 'clean'/'union' if merge completed, updates merge base after merge succeeds
- **Rendering**: `getRows()` — returns ANSI-escaped row strings with full color/attribute handling (cached until dirty); `getCursorPos()` → {x, y}; `checktime()` — reload changed files
- **Nvim settings**: Pre-init disables swap/backup, post-init hides UI elements (status line, line numbers, ruler), LSP suppressed, shortmess+=F
- **Lifecycle**: `resize(cols, rows)`, `destroy()` — cleanup PTY, xterm, timers, merge status file, all file snapshots

## Constraints

- **Markdown loss**: `stripMarkdown()` is lossy (collapses whitespace); use `cleanMarkdown()` for structure-preserving inline cleanup
- **Emoji width**: Both `truncate()` and `cleanMarkdown()` normalize wide emoji → single-width to prevent terminal wrapping
- **tmux operations** fail silently via `execSafe()` — always check existence before operations
- **Companion pane** auto-reuses if alive; killing requires resetting `companionPaneId`
- **File reads** via `readFileSafe()` must handle missing files (goal.md, roadmap.md may not exist)
- **Context XML** must escape all user-provided content via `escapeXml()`
- **Neovim PTY**: Temp files in `/tmp/sisyphus-nvim/` must be cleaned up by `destroy()` — includes cmd file, merge status file, and file snapshots (base-*.md). Tab debouncing (150ms) prevents LSP churn. Merge snapshots auto-cleared on new `openTabFiles()`. Escape Lua strings via `replace(/\\/g, '\\\\').replace(/'/g, "\\'")`. Merge status from previous cycle polled once per `mergeCheckOrReload()` call
