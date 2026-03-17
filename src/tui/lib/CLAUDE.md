# src/tui/lib

**TUI library utilities** — formatting, rendering, tree structures, daemon communication, and Claude companion context.

## Organization

- **format.ts** — Display utilities: duration/time formatting, markdown stripping/cleaning, text truncation, status indicators, text wrapping, frontmatter removal
- **tree.ts** — Session tree building: sorts sessions (active+open → completed), expands cycles/agents/reports on demand
- **tree-render.ts** — ASCII rendering: box-drawing connectors (│, ├─, └─), expand indicators (▸, ▼)
- **tmux.ts** — tmux wrappers: window/pane selection, editor/companion popups, terminal editor detection, companion context building
- **context.ts** — XML context builders: generates session/agent/report context for Claude companion prompt (filters, escapes, aggregates state)
- **client.ts** — Daemon socket client: sends JSON requests, 5s timeout, line-delimited response
- **reports.ts** — Agent reports: loads report files, handles missing files gracefully

## Key Patterns

### Text Formatting
- **Duration/time**:
  - `formatDuration(start, end?)` — Human format (1h23m, 45s)
  - `formatTimeAgo(iso)` — Relative time (2h ago, just now)
  - `formatTime(iso)` — HH:MM format
- **Truncation**:
  - `truncate(text, max)` — Word-boundary-aware with '…' ellipsis (falls back to 0.6x threshold if no space found)
- **Markdown**:
  - `stripMarkdown()` — Removes all markdown syntax (headers, bold, links, code blocks, lists); collapses whitespace
  - `cleanMarkdown()` — Inline only (bold, italic, strikethrough, code, links); preserves structure
  - `stripFrontmatter()` — Removes YAML frontmatter (--- ... ---)
  - `extractFirstSentence()` — Finds first meaningful line, respects sentence boundaries, strips headers/code blocks
- **Text wrapping**:
  - `wrapText(text, width)` — Line-wrapping with word-boundary awareness
- **Status**:
  - `statusColor(status)` — Maps to terminal color (active/running→green, completed→cyan, paused→yellow, killed/crashed→red, lost→gray)
  - `statusIndicator(status)` — Status glyph (▶, ✓, ⏸, ·)
  - `agentStatusIcon(status)` — Agent-specific icons (▶, ✓, ✕, !, ?, ·)
- **Misc**:
  - `divider(width, char)` — Repeating character line (default '─')

### Tree Structure
- Sessions sorted by: active+open (0) → active+closed (1) → paused+open (2) → paused+closed (3) → completed (4)
- Within groups: most recent first (by createdAt)
- Children only expanded for selected session + expanded state combo (prevents rendering all hierarchies)
- Node IDs use prefixes: `session:`, `cycle:`, `agent:`, `report:`, `messages:`, `message:`

### Tree Rendering
- Prefix building happens per-node: builds ancestor chain (│ or space per depth), then connector (├─ or └─), then expand indicator (▸ or ▼)
- Last-sibling detection scans forward for same depth (no following sibling = last)

### Claude Companion Context (context.ts)
- **XML format**: `<sessions>`, `<session>`, `<agents>`, `<agent>`, `<reports>`, `<completion-report>`
- **buildCompanionContext()** — Aggregates all recent sessions (completed sessions filtered: 7 days)
  - Per session: task, status, created time, cycle count, agent counts by status, goal (first meaningful line), roadmap unchecked todos (up to 5)
  - Used in dashboard companion popup for high-level context
- **buildSessionContext()** — Full context for an active session
  - Per agent: id, name, agentType, status, instruction, all report blocks (chronological), completion report
  - Per cycle: cycle number, mode, agents spawned
  - Includes goal + roadmap as raw markdown
  - Used in companion popup for detailed session management
- **escapeXml()** — Escapes `&`, `<`, `>`, `"` for safe XML embedding
- **readFileSafe()** — Reads files gracefully, returns null on any error (missing files, permission errors)

### Tmux Integration
- Custom ENV augments PATH to include Homebrew bins (`/opt/homebrew/bin:/usr/local/bin`)
- **execSafe()** suppresses stderr (stdio: ['pipe', 'pipe', 'pipe']) for non-critical checks like `windowExists()`
- **openCompanionPopup()** — Loads `dist/templates/dashboard-claude.md`, renders `{{CWD}}` + `{{SESSIONS_CONTEXT}}`, spawns Claude companion with `-E` flag (close on exit)
- **openEditorPopup()** detects terminal editors (vim, nvim, nano, etc.) and uses tmux popup; GUI editors run directly
- **shellQuote()** — Single-quote escaping for safe tmux send-keys

### Daemon Client
- Connects to Unix socket (`socketPath()`), writes JSON request + newline, reads single-line JSON response
- 5s timeout (hardcoded); destroy socket on timeout or successful read
- Expects first complete line as response (stops reading after `\n`)

## Constraints

- Markdown stripping is lossy — use for display only, not data transformation
- Tree rendering assumes depth hierarchy is well-formed (no skipped depths)
- tmux commands fail silently (execSafe) in most cases — check window existence before operations
- Truncation always aims for word boundaries, falls back to hard limit if none found in reasonable range (0.6x of max)
- `stripMarkdown()` collapses all whitespace to single spaces (lossy); `cleanMarkdown()` preserves line structure
- Companion context XML must escape all user-provided content — use `escapeXml()` for all agent.name, session.task, report content, etc.
- Completed sessions in companion context filtered to 7-day window (prevents huge context on old projects)
- File reads via `readFileSafe()` must handle missing files gracefully (goal.md, roadmap.md may not exist yet in new sessions)
