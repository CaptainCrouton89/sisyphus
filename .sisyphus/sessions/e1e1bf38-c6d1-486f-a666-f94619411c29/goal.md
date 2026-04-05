Design and implement session branching/forking for sisyphus — the ability to spin up focused sub-sessions from a running session to handle unrelated concerns, then return to the main thread. Multiple forks should be possible concurrently from the same parent. The feature should integrate naturally with the existing session lifecycle, CLI, TUI, and companion systems.

Done looks like: a user in an active session can run a command to fork, gets a new session linked to the parent, works the tangent, completes it, and returns to the parent — all without polluting the parent's context/roadmap. The parent can optionally pause or continue running.

In scope: protocol, CLI commands, daemon lifecycle, state model, TUI display of fork relationships, companion integration (the `comeback-kid` achievement and `parentSessionId` field already exist but are unearned).

Out of scope: git worktree integration (separate feature), cross-fork state merging (forks are independent work units).
