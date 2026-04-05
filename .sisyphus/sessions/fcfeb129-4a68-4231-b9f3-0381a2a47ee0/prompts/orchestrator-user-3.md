## Goal

Implement `sisyphus present <file.md>` — a CLI command that renders termrender markdown to ANSI-styled output, opens it in a neovim tmux pane for user editing, blocks until `:wq`, then diffs the ANSI-stripped original vs edited text, wraps user insertions in `<!-- -->` comment tags, and returns the annotated version to stdout. Purely CLI-side (no daemon protocol needed) using the `tmux wait-for` blocking pattern from `review.ts`. The command is designed for agent use — agents call it to present rich visual output and receive inline user feedback.

## Context

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/logs/cycle-003.md

### Most Recent Cycle

- **agent-002** (impl-present) [completed]: @.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/reports/agent-002-final.md

## Strategy

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/strategy.md

## Roadmap

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/roadmap.md

## Digest

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/digest.json


## Continuation Instructions

Agent implementing present.ts. Review build result, then validate the full flow.