# Cycle 1 — Strategy

## Decisions
- `sisyphus present` is a pure CLI command — no daemon protocol, no server handler needed
- Follows `review.ts` pattern: `tmux new-window` + `tmux wait-for` for blocking semantics
- termrender invoked as external CLI (`termrender <file.md>` → stdout capture)
- ANSI stripping via regex, diff via line comparison, insertions wrapped in `<!-- -->`

## Key Findings
- `review.ts` (`runReviewTui()`) is the exact blocking pattern: creates tmux window, sends command, blocks on `tmux wait-for <channel>`, reads result file on unblock
- termrender is installed (`/opt/homebrew/bin/termrender`), takes markdown, outputs ANSI+Unicode
- No protocol types or daemon changes needed — the command is self-contained in CLI layer
- The initial context mentioned "daemon file watcher" but tmux wait-for is cleaner and proven

## Agents Spawned
- Planning agent to write `context/plan-present.md`
