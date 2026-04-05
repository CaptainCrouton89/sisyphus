## Goal

Design and implement session branching/forking for sisyphus — the ability to spin up focused sub-sessions from a running session to handle unrelated concerns, then return to the main thread. Multiple forks should be possible concurrently from the same parent. The feature should integrate naturally with the existing session lifecycle, CLI, TUI, and companion systems.

Done looks like: a user in an active session can run a command to fork, gets a new session linked to the parent, works the tangent, completes it, and returns to the parent — all without polluting the parent's context/roadmap. The parent can optionally pause or continue running.

In scope: protocol, CLI commands, daemon lifecycle, state model, TUI display of fork relationships, companion integration (the `comeback-kid` achievement and `parentSessionId` field already exist but are unearned).

Out of scope: git worktree integration (separate feature), cross-fork state merging (forks are independent work units).

## Context

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/logs/cycle-002.md

### Most Recent Cycle

- **agent-001** (problem-branching) [completed]: @.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/reports/agent-001-final.md
- **agent-002** (explore-integration) [completed]: @.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/reports/agent-002-final.md

## Strategy

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/strategy.md

## Roadmap

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/roadmap.md

## Digest

@.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/digest.json


## Continuation Instructions

Problem and explore agents are running. Review their reports in context/problem-session-branching.md and context/explore-integration-points.md. Synthesize findings, identify the interaction model, and seek user alignment on key decisions before drafting requirements. Key questions: (1) should parent pause or continue during fork? (2) does fork completion inject a summary back? (3) can orchestrators fork programmatically?