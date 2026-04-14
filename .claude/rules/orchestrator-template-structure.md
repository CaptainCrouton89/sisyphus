---
paths:
  - "templates/orchestrator-*.md"
---

`orchestrator-base.md` is always prepended; mode templates are appended. The agent sees one continuous prompt — it has no concept of "base" vs "mode template." Never reference "the base prompt" in a mode template; use "above" if you must refer back.

## What belongs in orchestrator-base.md

- Identity, cycle workflow, tool usage
- User interaction model and yield rules (including the "never yield when waiting" example)
- State management: goal.md, strategy.md, roadmap.md, cycle logs, digest.json, context directory, session directory
- Development heuristics and rigor calibration
- Spawning reference and CLI reference
- Pre-completion gate checklist

## What belongs in mode templates

- **Process specific to that mode** — the steps, decision points, and exit criteria unique to that phase
- **Mode-specific CLI** — commands only relevant during that phase
- **Transition guidance** — how to leave this mode and which mode to enter next

## Deduplication rules

- If orchestrator-base.md already defines a concept (roadmap structure, goal.md format, strategy evolution triggers), mode templates don't redefine it. Say "initialize roadmap.md" — don't repeat the four-section spec.
- Mode templates may *extend* with mode-specific procedure. A brief heuristic in base + detailed procedure in a mode template is not duplication. Two descriptions of the same thing is.
- When adding content to a mode template, check orchestrator-base.md first. If it already says it, don't say it again.
