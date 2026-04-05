## Goal

Design and implement session branching/forking for sisyphus — the ability to spin up focused sub-sessions from a running session to handle unrelated concerns, then return to the main thread. Multiple forks should be possible concurrently from the same parent. The feature should integrate naturally with the existing session lifecycle, CLI, TUI, and companion systems.

Done looks like: a user in an active session can run a command to fork, gets a new session linked to the parent, works the tangent, completes it, and returns to the parent — all without polluting the parent's context/roadmap. The parent can optionally pause or continue running.

In scope: protocol, CLI commands, daemon lifecycle, state model, TUI display of fork relationships, companion integration (the `comeback-kid` achievement and `parentSessionId` field already exist but are unearned).

Out of scope: git worktree integration (separate feature), cross-fork state merging (forks are independent work units).

## Context

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/logs/cycle-004.md

### Most Recent Cycle

- **agent-004** (design-clone) [completed]: @.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/reports/agent-004-final.md

## Strategy

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/strategy.md

## Roadmap

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/roadmap.md

## Digest

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/digest.json


## Continuation Instructions

Design agent (agent-004) producing technical architecture. Review design-clone.md output for completeness against all 20 requirements, feasibility, and pattern consistency. If solid, spawn plan agent. If issues found, iterate.