# src/tui/lib

## Text Formatting

- `wrapText()` calls `cleanMarkdown` internally — don't pre-clean or emoji normalization doubles
- `Seg.bg` is raw ANSI format (`'48;2;R;G;B'`), not a color name — passing a name silently emits a broken escape sequence
- `messageSourceLabel(source, agentId?)` throws if `source === 'agent'` and `agentId` is undefined

## Tree Building

- **`SessionTreeNode.expanded = isExpanded && isSelected`** — expanding a non-selected session is silently deferred until selection
- **`windowAlive` must be populated before `buildTree`** or all non-completed sessions sort as "closed"
- **Unassigned agents bucketed into latest cycle** (`cycles[0]`) — not orphaned

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
