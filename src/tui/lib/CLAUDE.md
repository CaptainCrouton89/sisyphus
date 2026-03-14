# src/tui/lib

**TUI library utilities** — formatting, rendering, tree structures, and daemon communication.

## Organization

- **format.ts** — Display utilities: duration/time formatting, markdown stripping, text truncation, status indicators, text wrapping
- **tree.ts** — Session tree building: sorts sessions (active+open → completed), expands cycles/agents/reports on demand
- **tree-render.ts** — ASCII rendering: box-drawing connectors (│, ├─, └─), expand indicators (▸, ▼)
- **tmux.ts** — tmux wrappers: window/pane selection, editor/companion popups, terminal editor detection
- **client.ts** — Daemon socket client: sends JSON requests, 5s timeout, line-delimited response
- **reports.ts** — Agent reports: loads report files, handles missing files gracefully

## Key Patterns

### Text Formatting
- **stripMarkdown()** — Removes all markdown syntax; used before truncation
- **extractFirstSentence()** — Finds first meaningful content line, respects sentence boundaries
- **Status colors/icons** — `statusColor()` maps status → [green|cyan|yellow|red|gray|white]; `agentStatusIcon()` for agent-specific glyphs

### Tree Structure
- Sessions sorted by: active+open (0) → active+closed (1) → paused+open (2) → paused+closed (3) → completed (4)
- Within groups: most recent first (by createdAt)
- Children only expanded for selected session + expanded state combo (prevents rendering all hierarchies)
- Node IDs use prefixes: `session:`, `cycle:`, `agent:`, `report:`, `messages:`, `message:`

### Tree Rendering
- Prefix building happens per-node: builds ancestor chain (│ or space per depth), then connector (├─ or └─), then expand indicator (▸ or ▼)
- Last-sibling detection scans forward for same depth (no following sibling = last)

### Tmux Integration
- Custom ENV augments PATH to include Homebrew bins (`/opt/homebrew/bin:/usr/local/bin`)
- **execSafe()** suppresses stderr (stdio: ['pipe', 'pipe', 'pipe']) for non-critical checks like `windowExists()`
- **openEditorPopup()** detects terminal editors (vim, nvim, nano, etc.) and uses tmux popup; GUI editors run directly
- **openCompanionPopup()** loads dashboard template from `dist/templates/dashboard-claude.md`, renders {{CWD}}, spawns Claude in popup

### Daemon Client
- Connects to Unix socket (`socketPath()`), writes JSON request + newline, reads single-line JSON response
- 5s timeout (hardcoded); destroy socket on timeout or successful read
- Expects first complete line as response (stops reading after `\n`)

## Constraints

- Markdown stripping is lossy — use for display only, not data transformation
- Tree rendering assumes depth hierarchy is well-formed (no skipped depths)
- tmux commands fail silently (execSafe) in most cases — check window existence before operations
- Truncation always aims for word boundaries, falls back to hard limit if none found in reasonable range (0.6x of max)
