# agents/

## Non-Obvious Agent Constraints

- `explore.md` — Never spawned directly by orchestrator; only `problem.md` and `design.md` can spawn it
- `operator.md` — Spawns sub-agents via **Task tool** (not Agent tool) — the only parent agent that does this
- `design.md` — `context/requirements.md` is a hard prerequisite; no graceful fallback, it fails without it
- `debug.md` — May write reproduction tests despite "no code changes" stance; explicit carve-out, not inconsistency

## Context Chain

Artifacts flow through `$SISYPHUS_SESSION_DIR/context/`. Ordering dependency:

```
problem.md       →  context/problem.md  +  context/explore-{area}.md
requirements.md  →  context/requirements.json + context/requirements.md   (reads problem.md if present; falls back to instruction)
design.md        →  context/design.json + context/design.md  (context/requirements.md is *required*)
plan.md          →  context/plan-{topic}.md        (reads all of context/ for prior findings)
test-spec.md     →  context/test-spec-{topic}.md   (reads requirements + plan at provided paths)
research-lead.md →  context/research-{topic}.md    (standalone; spawnable at any phase)
```

`explore.md` depth: `quick` / `standard` (default, 2-3 layers) / `deep` (exhaustive + git history). Absent signal → `standard`.

## Review Actions

- `reviewAction: "approve"` → set `status` to `"approved"` — approved items are permanently skipped on re-entry
- Design uses `"agree"` not `"approve"` to approve; `"pick-alt"` → read `selectedAlternative` and revise
- Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields

## TUI-Owned Fields

- `startedAt`/`completedAt` on items and `meta.reviewStartedAt`/`meta.reviewCompletedAt` are set by the TUI — never write them

## Sub-Agent Subdirectory Pattern

Subdirectories (e.g., `review/`, `review-plan/`) contain sub-agent files copied into the plugin's `agents/` dir at spawn time via `createAgentPlugin()` in `src/daemon/agent.ts`. Sub-agents are invisible to the orchestrator — only the parent can spawn them.
