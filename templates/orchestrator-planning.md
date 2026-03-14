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
- Refine based on feedback before planning

Not every stage needs a standalone spec document — a well-defined stage might just be a detailed section in plan.md. Use judgment about how much formality each stage warrants.

## Progressive Planning

Not all tasks need the same planning depth upfront. A 2-file bug fix needs a single plan agent. A cross-repo feature with 7+ stages needs planning that is itself decomposed.

### Decision heuristic

- **Small task** (1-3 stages, single domain): Single plan agent produces the full plan. Skip progressive planning.
- **Large task** (3+ stages, multiple domains or repos): The planning itself needs decomposition. Use progressive planning below.

Signs you need progressive planning: the plan agent would need to explore multiple unfamiliar subsystems, the task description mentions "phases" or "stages" spanning different concerns, or the spec has more than 3 distinct work areas.

### How progressive planning works

1. **High-level outline first.** The first planning cycle produces only a stage outline in plan.md — phases, dependencies, one-sentence descriptions, estimated cycle counts. No file-level detail for any stage. This is the skeleton.

2. **Detail-plan one stage at a time.** When you're ready to start a stage, spawn a narrowly-scoped plan agent for just that stage. It gets the high-level outline for context but only detail-plans the immediate stage. Output goes to `context/plan-stage-N-{name}.md`.

3. **Planning is iterative.** What you learn implementing stage N informs stage N+1's detail plan. The high-level outline evolves — stages get added, removed, reordered, or split as understanding grows. That's the system working correctly.

4. **Don't front-load detail.** Detailed plans for stages 4-7 written before stage 1 is implemented are fiction. They're based on assumptions that will change. Defer detail until you're about to execute.

### plan.md in high-level-only state

When using progressive planning, plan.md initially looks like this:

```markdown
## Goal: Implement Worker System across 3 repos

### Stage Outline
1. Core worker types + interfaces — no deps — ~2 cycles
2. Worker registry + lifecycle management — depends on 1 — ~4 cycles
3. Job queue integration — depends on 2 — ~3 cycles
4. REST API endpoints — depends on 2 — ~4 cycles
5. CLI commands — depends on 4 — ~2 cycles
6. Monitoring + health checks — depends on 2,3 — ~3 cycles
7. Integration tests — depends on all — ~3 cycles

### Stage 1: Core Worker Types (current)
See context/plan-stage-1-worker-types.md for detail plan.
- [ ] Define Worker interface and lifecycle states
- [ ] Create WorkerConfig types
- [ ] Add shared error types
```

Future stages stay as one-liners until reached. The current stage has full detail from its dedicated plan agent.

### Failure mode

If a detail-plan agent can't produce quality output for a single stage, the stage is still too large — break it into sub-stages in the outline and detail-plan each sub-stage individually.

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
sisyphus yield --mode implementation --prompt "Begin implementation — see plan.md for work items"
```

The `--mode implementation` flag loads implementation-phase guidance for the next cycle. Pass a prompt that orients the next cycle to where things stand.
