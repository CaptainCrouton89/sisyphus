## Goal

Implement 'sisyphus present' — a new CLI command that lets agents present rendered output to users for inline feedback. Flow: (1) Agent writes termrender-flavored markdown to a file, (2) agent calls 'sisyphus present <file.md>', (3) sisyphus runs termrender to produce full ANSI-colored Unicode output, writes it to a temp file, opens it in a new lazyvim pane in the same tmux window, (4) command blocks until user saves and closes (:wq), (5) on close, strip ANSI from original and edited versions, diff the plain text, wrap user insertions in <!-- --> comment tags, return the annotated version as stdout to the agent. The command should work like 'sisyphus requirements --wait' — blocking semantics for agent use.

## Context

termrender is an external Python package at /Users/silasrhyneer/Code/claude-tools/termrender — DO NOT edit or work in that repo. Treat it as a dependency (pip install or pipx). It takes directive-flavored markdown (:::panel, :::columns, :::tree, :::callout, :::code, :::quote, :::divider, plus mermaid code blocks) and outputs ANSI-styled Unicode terminal text. CLI: 'termrender file.md' renders to stdout. Python API: 'from termrender import render'. The rendered output file opened in lazyvim should have ANSI escape codes (user has an ANSI color plugin like baleia.nvim). Key files in sisyphus: src/cli/commands/ for the new command, src/cli/index.ts to register it, src/shared/protocol.ts for protocol types, src/daemon/server.ts for the handler. The daemon needs a file watcher that detects when the lazyvim buffer closes (file written + pane closed). Pattern to follow: look at how 'sisyphus requirements --wait' works for blocking semantics.

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/logs/cycle-001.md

## Strategy

(empty)

## Roadmap

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/roadmap.md

## Digest

(not yet created)


## Continuation Instructions

Review the current session and delegate the next cycle of work.