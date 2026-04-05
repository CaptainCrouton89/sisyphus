## Goal

Implement `sisyphus present <file.md>` — a CLI command that renders termrender markdown to ANSI-styled output, opens it in a neovim tmux pane for user editing, blocks until `:wq`, then diffs the ANSI-stripped original vs edited text, wraps user insertions in `<!-- -->` comment tags, and returns the annotated version to stdout. Purely CLI-side (no daemon protocol needed) using the `tmux wait-for` blocking pattern from `review.ts`. The command is designed for agent use — agents call it to present rich visual output and receive inline user feedback.

## Context

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/context

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/logs/cycle-005.md

## Strategy

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/strategy.md

## Roadmap

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/roadmap.md

## Digest

@.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/digest.json


## Continuation Instructions

All review issues fixed (critical: --no-wait cleanup, high: exec PATH, medium: redundant regex + temp file ordering). Build passes. Validate: 1) non-tmux path (unset TMUX, run sisyphus present test-mermaid.mmd, verify stdout output), 2) check the code one final time for any remaining issues before completion.