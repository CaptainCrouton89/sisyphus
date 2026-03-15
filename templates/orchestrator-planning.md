# Planning Phase

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

## Delegating to Plan Agents

Point plan agents at **inputs** (spec, context docs, corrections) — not a pre-made structure. Don't pre-decide staging, ordering, or design decisions. The plan agent has `effort: max` reasoning and will produce a better plan when given room to think through the structure itself.

For cross-domain tasks, consider spawning parallel plan agents scoped to independent domains (e.g., one for backend, one for frontend, one for IPC). Each produces a focused sub-plan. This is faster and produces better domain-specific plans than one agent trying to plan everything.

## Progressive Development

Not all tasks need the same process depth. A 2-file bug fix can go straight to implementation. A cross-repo feature with multiple domains needs full phased development.

### Decision heuristic

- **Small task** (1-3 files, single domain): Skip phases — roadmap is just a short task checklist (diagnose, fix, validate). Single plan agent, single implement agent.
- **Large task** (3+ stages, multiple domains or repos): Full phased development. The roadmap tracks development phases, and each phase produces artifacts in `context/`.

Signs you need phased development: the task touches multiple unfamiliar subsystems, the task description spans different concerns (backend, frontend, IPC, etc.), or a spec exists with more than 3 distinct work areas.

### How phased development works

The roadmap tracks **development phases**, not implementation stages. A large feature's roadmap looks like:

```markdown
## Goal: Implement Worker System

### Phases
1. Research — explore architecture, conventions, constraints [current]
2. Spec — validate/refine spec, align with user [outlined]
3. Plan — break into implementation stages [outlined]
4. Implement — execute stage-by-stage with review cycles [outlined]
5. Validate — e2e verification [outlined]
```

Each phase expands when you enter it. Implementation stages only appear once Phase 3 (Plan) produces them — and they live in `context/`, not the roadmap itself.

### Phase expansion

When entering a new phase, expand it in the roadmap with concrete items:

```markdown
### Phase 1: Research (current)
- [x] Core architecture exploration (scheduler, presets, routing)
- [x] Agent IPC + runtime patterns
- [ ] Gateway patterns (RTK Query, components)

### Phase 3: Plan (current)
- Implementation plan: see context/plan-implementation.md
- [x] High-level stage outline
- [ ] Detail-plan stage 1 (types + migration)
- [ ] Review plan against spec
```

Future phases stay as one-liners until reached. What you learn in earlier phases informs how later phases get expanded.

### Implementation stages are context artifacts

When Phase 3 (Plan) runs, it produces implementation stage breakdowns saved to `context/`:
- `context/plan-implementation.md` — overall stage outline with dependencies
- `context/plan-stage-1-types.md` — detailed plan for stage 1
- `context/plan-stage-2-service.md` — detailed plan for stage 2 (written when stage 1 is underway)

The roadmap references these but doesn't contain them. During Phase 4 (Implement), the roadmap tracks which stages are done:

```markdown
### Phase 4: Implement (current)
See context/plan-implementation.md for stage breakdown.
- [x] Stage 1: Types + migration — verified
- [ ] Stage 2: Worker service — in progress (see context/plan-stage-2-service.md)
- [ ] Stage 3: Gateway UI — outlined
```

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
