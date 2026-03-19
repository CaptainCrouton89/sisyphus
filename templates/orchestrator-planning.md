# Planning Phase

## Planning Phase Flow

The natural sequence: **context → spec → roadmap refinement → detailed planning.** Context documents come first because they feed everything downstream — spec writers, planners, and implementers all benefit from not having to re-explore the codebase. After the spec is aligned, revisit the roadmap — that's when you actually understand scope well enough to flesh out phases honestly.

## Exploration

Use explore agents to build understanding before making decisions. Each agent should save a focused context document to `.sisyphus/sessions/$SISYPHUS_SESSION_ID/context/` — these artifacts get passed to downstream agents so they don't have to re-explore the codebase themselves.

Adapt the number and focus of explore agents to the task. Key principles:

- **Each agent produces a focused artifact** — not one sprawling document. Focused documents can be selectively passed to downstream agents. An agent implementing auth gets `conventions.md` + `architecture.md`, not a 500-line dump.
- **Conventions and patterns are high-value** to capture. Implementation agents that receive convention context write consistent code. Ones that don't produce code you'll have to fix.
- **Exploration serves different purposes at different stages.** Early exploration is architectural — understanding the system and what needs to change. Later exploration before a specific stage is tactical — identifying files, patterns to follow, utilities to reuse. Both are valuable.
- **Delegate understanding of unfamiliar territory.** If the task touches a library or subsystem you don't know, spawn an agent to investigate and report.

## Spec Alignment

Before investing in a detailed spec, make sure the goal itself is well-defined. If you're making assumptions about scope, requirements, or constraints — surface them to the user. A spec built on wrong assumptions wastes every cycle downstream.

For significant features, spec refinement is iterative:
- Draft the spec based on exploration findings
- Have agents review for feasibility and code smells (can this actually work given the codebase?)
- Seek user alignment on the high-level approach and any decisions that set direction
- **Apply corrections back to the spec itself** — the spec is the single source of truth. Don't create a separate corrections file and pass both downstream; update the spec and delete the corrections. Plan agents should read one authoritative document, not reconcile two contradictory ones.

Not every stage needs a standalone spec document — a well-defined stage might just be a detailed section in the implementation plan. Use judgment about how much formality each stage warrants.

## Roadmap Refinement

Once you have context docs and an aligned spec, revisit the roadmap. This is the first point where you understand real scope — adjust phase boundaries, add phases you didn't anticipate, reorder for dependencies. Keep future phases at outline level; just make sure the shape is honest.

## Delegating to the Plan Lead

Spawn **one plan lead** per feature. Point it at **inputs** (spec, context docs, corrections) — not a pre-made structure. Don't pre-decide staging, ordering, or design decisions. The plan lead has `effort: max` reasoning and handles its own decomposition: it will assess scope, delegate sub-plans to specialist agents if the feature is large enough, run adversarial reviews on the result, and deliver a synthesized master plan.

**Don't split the planning yourself.** The plan lead decides whether to plan solo or delegate sub-plans to domain-specific agents. If the orchestrator pre-splits into "backend plan agent" and "frontend plan agent," the plan lead's synthesis step — where it resolves cross-domain conflicts, finds gaps, and stress-tests edge cases — never happens. One plan lead per feature, and trust it to decompose internally.

**When to spawn multiple plan leads:** Only for genuinely independent features with no shared files or integration points. If two features touch the same codebase area, one plan lead should own both — otherwise you'll get conflicting plans with no one responsible for reconciling them.

## Progressive Development

Not all tasks need the same process depth. A 2-file bug fix can go straight to implementation. A cross-repo feature with multiple domains needs full phased development.

### Decision heuristic

- **Small task** (1-3 files, single domain): Skip phases — roadmap is just a short task checklist (diagnose, fix, validate). Single plan agent, single implement agent.
- **Large task** (3+ stages, multiple domains or repos): Full phased development. The roadmap tracks development phases, and each phase produces artifacts in `context/`.

Signs you need phased development: the task touches multiple unfamiliar subsystems, the task description spans different concerns (backend, frontend, IPC, etc.), or a spec exists with more than 3 distinct work areas.

### Implementation stages are context artifacts

When Phase 3 (Plan) runs, it produces implementation stage breakdowns saved to `context/`:
- `context/plan-implementation.md` — overall stage outline with dependencies
- `context/plan-stage-1-types.md` — detailed plan for stage 1
- `context/plan-stage-2-service.md` — detailed plan for stage 2 (written when stage 1 is underway)

### Don't front-load phases

Detail-plan one stage at a time. What you learn implementing stage N informs stage N+1's detail plan. The stage outline evolves — stages get added, removed, reordered, or split as understanding grows. That's the system working correctly.

Detailed plans for stages 4-7 written before stage 1 is implemented are fiction. Defer detail until you're about to execute.

## E2E Verification Recipe

Before implementation begins, determine how to concretely verify the change works end-to-end. This is the single most common failure mode: agents report success but nothing actually works.

The tooling explorer should have mapped the available infrastructure. Common patterns:

- **Browser automation**: `capture` CLI for UI changes — click through affected flows, screenshot results
- **CLI verification**: exercise changed behavior interactively in tmux
- **API testing**: dev server + curl/httpie for endpoint changes
- **Integration tests**: existing e2e or integration test suite
- **Smoke script**: create one if nothing else exists

If you cannot determine a concrete verification method, **ask the user**. Offer 2-3 specific options. Do not proceed to implementation without a verification plan.

Write the recipe to `context/e2e-recipe.md` with:
- Setup steps (start dev server, build, seed data, etc.)
- Exact commands or interactions to verify
- What success looks like (expected output, visual state, response codes)

Implementation agents and validation agents both reference this file. Write it to be executable, not aspirational.

## Transitioning to Implementation

When you have enough understanding, a reviewed plan, and a verification recipe — transition explicitly:

```bash
sisyphus yield --mode implementation --prompt "Begin implementation — see roadmap.md and context/plan-implementation.md"
```

The `--mode implementation` flag loads implementation-phase guidance for the next cycle. Pass a prompt that orients the next cycle to where things stand.
