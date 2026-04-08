---
description: Run a full spec session — interactive product/engineering conversation that produces an aligned design and EARS requirements
argument-hint: <topic or description>
---
# Spec
**Input:** $ARGUMENTS

The user wants a full spec — design + EARS requirements — produced through a single interactive session.
Spawn a `sisyphus:spec` agent to lead this. It is interactive and runs a three-stage flow: shape (engineer drafts a high-level design), requirements (single req-writer dispatch for the full design with TUI review), deepen (engineer refines design with what was learned).
Output: `context/design.md` + `context/design.json` + `context/requirements.json` + `context/requirements.md`. The lead generates `requirements.md` via a pure-code script — no LLM tokens for formatting.
The `sisyphus:spec` agent fully replaces the old `sisyphus:requirements` and `sisyphus:design` commands. Do not spawn either of those (they no longer exist). If the strategy currently lists separate requirements/design stages, collapse them into a single spec stage before spawning.
