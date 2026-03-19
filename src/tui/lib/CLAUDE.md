# src/tui/lib

**TUI library utilities** — formatting, rendering, tree structures, daemon communication, and Claude companion context.

## Files

- **format.ts** — Display utilities: duration/time formatting, markdown stripping/cleaning, text truncation, status indicators, styled line segments
- **tree.ts** — Session tree building and sorting
- **tree-render.ts** — ASCII rendering with box-drawing connectors
- **tmux.ts** — Tmux integration: pane/window selection, editor popups, daemon log viewer, companion pane management
- **context.ts** — XML context builders for Claude companion prompt
- **client.ts** — Daemon socket client (5s timeout, JSON requests)
- **reports.ts** — Load and handle agent report files

## Key Patterns

### Text Formatting & Colors
- **Time**: `formatDuration(start, end?)` → "1h23m", `formatTimeAgo(iso)` → "2h ago", `formatTime(iso)` → "HH:MM"
- **Truncation**: `truncate(text, max)` — word-boundary-aware with '…'
- **Markdown**: `stripMarkdown()` (all syntax), `cleanMarkdown()` (inline only), `stripFrontmatter()`, `extractFirstSentence()`
- **Wrapping**: `wrapText(text, width)` with word boundaries
- **Status colors**: `statusColor(status)`, `durationColor(startOrMs)` (yellow <30min, red ≥30min), `agentTypeColor(agentType)`
- **Status icons**: `statusIndicator(status)`, `agentStatusIcon(status)`, `divider(width, char)`

### Styled Line Rendering (format.ts)
- `Seg` — {text, color?, bold?, dim?, italic?} — single styled segment
- `DetailLine = Seg[]` — multi-segment line with mixed styling
- `seg(text, opts)` and `singleLine(text, opts)` — builders for styled output

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
- Utility popups: `openLogPopup()` (tail daemon logs), `openShellPopup(cwd, cmd)`, `openInFileManager(path)`
- Window/pane helpers: `getWindowId()`, `selectWindow()`, `selectPane()`, `windowExists()`, `switchToSession()`

## Constraints

- `stripMarkdown()` collapses all whitespace to single spaces (lossy); use `cleanMarkdown()` to preserve structure
- tmux operations fail silently via `execSafe()` — check existence before operations
- Companion pane auto-reuses if alive (keyed by `companionPaneId`); killing pane requires reset
- File reads via `readFileSafe()` must handle missing files gracefully (goal.md, roadmap.md may not exist)
- Companion context XML must escape all user-provided content via `escapeXml()`
