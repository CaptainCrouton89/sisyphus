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

For smaller changes, a spec might just be a few sentences in plan.md — use judgment about how much formality the task warrants.

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
