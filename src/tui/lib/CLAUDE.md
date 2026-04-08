# src/tui/lib

## Text Formatting

- `wrapText()` calls `cleanMarkdown` internally — don't pre-clean or emoji normalization doubles
- `Seg.bg` is raw ANSI format (`'48;2;R;G;B'`), not a color name — passing a name silently emits a broken escape sequence
- `messageSourceLabel(source, agentId?)` throws if `source === 'agent'` and `agentId` is undefined

## Tree Building

- **`SessionTreeNode.expanded = isExpanded && isSelected`** — expanding a non-selected session is silently deferred until selection
- **`windowAlive` must be populated before `buildTree`** or all non-completed sessions sort as "closed"
- **`orchestratorCycles` is reversed before iteration** — `cycles[0]` is the most recent cycle; unassigned agents attach there, not to the chronologically first
- **`allSpawnedIds` aggregates across all cycles** — an agent ID in any historical cycle is excluded from the "unassigned" list even if the latest cycle didn't explicitly claim it
- **`cycleCount`, `completedAt`, and `activeMs` in `SessionTreeNode` are only accurate for the selected session** — non-selected nodes always have `cycleCount: 0` and `completedAt: undefined`; `activeMs` falls back to the list snapshot
- **`messages` node is only emitted when `messages.length > 0`** (unlike `context`, which is always emitted). `MessageTreeNode.source` is already a pre-resolved label string — not a raw `source.type`. `summary || content` fallback means zero-summary messages render full content inline.
- **Context node is emitted for every session**, but `polledContextFiles` is only injected for the selected one — non-selected sessions always render with `fileCount: 0` / non-expandable even if context files exist on disk
- **`AgentTreeNode.expanded` guards on `hasReports`** — toggling expand on a reportless agent is silently ignored (same deferred-expand pattern as sessions, different condition)
- **`findParentIndex` returns `index` when `depth === 0`, and `0` (not `index`) when the loop exhausts without a match** — callers must check `node.depth === 0` to distinguish "no parent" from "root fallback"
- **`findParentIndex` depth-gap early exit**: `nodes[i].depth < targetDepth` returns `i` immediately — nearest shallower ancestor, not necessarily `depth - 1`. The `return 0` fallback only fires when every preceding node is deeper than the target.
- **`CycleTreeNode.expandable` is `allCycleAgents.length > 0`**, where `allCycleAgents` includes unassigned agents on the latest cycle. A cycle with empty `agentsSpawned` is still expandable if unassigned agents exist — checking `cycle.agentsSpawned.length` directly disagrees with the rendered tree.
- **Session sort priority**: `active+open=0`, `active+closed=1`, `paused+open=2`, `paused+closed=3`, `completed=4`. Within a bucket, most-recent `createdAt` first. `windowAlive ?? false` drives open/closed — unpolled sessions (`undefined`) sort as closed within their status group.

## Companion Context

- `buildCompanionContext()` excludes sessions >7 days old regardless of status
- All user-provided content must go through `escapeXml()` before embedding — callers responsible

## Tmux

- `openCompanionPane` **focuses** existing pane rather than returning silently — pressing `c` always moves terminal focus to the companion pane
- Terminal editor detection uses hardcoded `TERMINAL_EDITORS` set — adding a new terminal editor requires updating it
- `resumeEnv` is a raw shell command fragment (`"export FOO=bar"`), not a variable name
- `openClaudeResumeSession` idempotent via exact name match — external rename causes a new session instead of reattach
- Window option flags target `${sessionName}:` (colon suffix) — bare session name silently fails

## Neovim Bridge

- Compose mode signals submit/cancel via BufWritePost/QuitPre autocmds writing a temp file — not stdin
- `destroy()` must clean up all `/tmp/sisyphus-nvim/` files
