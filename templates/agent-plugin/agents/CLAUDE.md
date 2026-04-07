# agents/

## Non-Obvious Agent Constraints

- `explore.md` — Never spawned directly by orchestrator; only `problem.md` can spawn it
- `operator.md` — Spawns sub-agents via **Task tool** (not Agent tool) — the only parent agent that does this
- `debug.md` — May write reproduction tests despite "no code changes" stance; explicit carve-out, not inconsistency
- `problem.md` — Save to `context/problem.md` is gated on explicit user sign-off; agent must wait, not save on completion. Uses `systemPrompt: replace` (not `append`) — base system prompt is dropped entirely; this is the only interactive agent that does this
- `implementor.md` — Bail via `sisyphus report` when the task makes false assumptions; never "make it work". Build failure split: unrelated → note and continue; related-but-unexpected → STOP and report, no workarounds. Designed for parallel execution — pattern/naming coherence with co-running implementors takes priority over speed
- `design.md` / `requirements.md` no longer exist as standalone agents — both are now `spec/` subagents (`engineer` and `requirements-writer`)

## problem.md Perspective Agents

`problem/` subdirectory contains 8 sub-agents (adversarial, contrarian, first-principles, precedent, simplifier, systems-thinker, time-traveler, user-empathy). All 8 are spawned simultaneously with `run_in_background: true`.

Timing constraint: spawn after the conversation has real substance but before conclusions harden — too early means no framing to react to; too late means the perspective agents can't affect the outcome.

**Pre-spawn problem statement is required** — a shared 2-3 sentence framing written before spawning makes outputs comparable. Without it, the 8 results are incommensurable. Form your own take on the problem before spawning; the agents challenge your convergence, they don't substitute for your analysis.

`context/visual.md` — scratch file written by `problem.md` for `termrender --tmux` display. Transient; not read by downstream agents (not in the context chain).

## Context Chain

Artifacts flow through `$SISYPHUS_SESSION_DIR/context/`. Ordering dependency:

```
problem.md       →  context/problem.md  +  context/explore-{area}.md
spec.md          →  context/design.json + context/design.md + context/requirements.json + context/requirements.md  (single interactive session; runs requirements.json → requirements.md via sisyphus requirements --export, no LLM tokens)
plan.md          →  context/plan-{topic}.md        (reads all of context/ for prior findings)
                    large plans also produce context/plan-{topic}-{slice}.md sub-plans linked from master
test-spec.md     →  context/test-spec-{topic}.md   (reads requirements + plan at provided paths)
research-lead.md →  context/research-{topic}.md    (standalone; spawnable at any phase)
```

`explore.md` depth: `quick` / `standard` (default, 2-3 layers) / `deep` (exhaustive + git history). Absent signal → `standard`.

## plan.md Constraints

- **Master plan hard limit: 200 lines.** Exceeding it means stage detail has leaked into the master — move it to a sub-plan file, not an exception.
- **No code in plans.** No type definitions, function stubs, schema blocks, or inline implementations. Use pattern references: "Follow the pattern in `src/jobs/index.ts`."
- **File overlap between sub-planners is expected**, not a blocker — it surfaces integration points. Resolve ownership during synthesis; don't avoid delegation to prevent it.
- **Adversarial review agents spawn after synthesis**, before delivery — code smell, edge case, ambiguity. Scale reviewer count to plan complexity (1 for 5-file plans, 2-3 for 30-file plans). Findings must be fixed or explicitly dismissed.
- Delegation threshold: 6+ files, or a solo plan that would exceed 300 lines. Synthesis (editing sub-plans for coherence, naming, seams) is where the plan lead adds value — rubber-stamping sub-plans into a master doc is not synthesis.

## Review Actions

- `reviewAction: "approve"` → set `status` to `"approved"` — approved items are permanently skipped on re-entry
- Design uses `"agree"` not `"approve"` to approve; `"pick-alt"` → read `selectedAlternative` and revise
- Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields

## TUI-Owned Fields

- `startedAt`/`completedAt` on items and `meta.reviewStartedAt`/`meta.reviewCompletedAt` are set by the TUI — never write them

## spec.md Non-Obvious Behavior

`spec/` subagents: `engineer` (writes/revises `design.json`+`design.md`) and `requirements-writer` (isolated — receives exactly 4 fields: section name/ID, path to `design-rendered.txt`, chunk output path, atomic-write requirement. **Nothing else.** No user goal, no prior conversation, no other sections.)

Orphan chunk reconciliation (`context/requirements-{sectionId}.attempt-N.json`) runs on **every startup**, not just resume. Safe to repeat — never modifies `requirements.json` itself, only deletes chunk files.

`meta.bounceIterations[sectionId]` **never decrements** — cumulative across daemon restarts. `> 3` per section → bail. Treating it as transient defeats the structural-conflict tripwire.

Section IDs from `design.json` are validated against `^[a-z0-9-]+$` before any chunk path is constructed — path-traversal guard. Offending ID → bail immediately.

## Sub-Agent Subdirectory Pattern

Subdirectories (e.g., `review/`, `review-plan/`, `spec/`) contain sub-agent files copied into the plugin's `agents/` dir at spawn time via `createAgentPlugin()` in `src/daemon/agent.ts`. Sub-agents are invisible to the orchestrator — only the parent can spawn them.
