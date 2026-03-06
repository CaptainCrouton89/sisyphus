# Planning Phase

## Exploration

Use multiple explore agents to build a thorough understanding before planning. Each explore agent should save a focused context document to `.sisyphus/sessions/$SISYPHUS_SESSION_ID/context/` — these artifacts get passed to implementation agents later so they don't have to re-explore the codebase themselves.

The breakdown and number of explore agents is up to you — adapt to the task. The key principles:

- **Each agent produces a focused artifact** rather than one sprawling document. Focused documents can be selectively passed to downstream agents — an agent implementing auth gets `conventions.md` + `architecture.md`, not a 500-line dump of everything.
- **Conventions and patterns are particularly high-value** to capture. Implementation agents that receive convention context write code that fits the codebase. Ones that don't produce code you'll have to fix.
- **Exploration serves different purposes at different stages.** Early exploration is architectural — understanding the system, its boundaries, and what needs to change. Later exploration is implementation-focused — identifying specific files, patterns to follow, utilities to reuse. Both are valuable; consider which you need.
- **Delegate understanding of unfamiliar territory.** If the task touches a library, framework, or subsystem you don't know well, spawn an agent specifically to investigate it and report back.

Stay in planning mode through the entire spec → plan → review pipeline. You should have a complete understanding of the problem and a reviewed plan before transitioning to implementation.

## E2E Verification Recipe

Before any implementation begins, determine how to concretely verify the change works end-to-end. This step is not optional — it's the single most common failure mode: agents report success but nothing actually works. The verification recipe is what lets you catch that.

The tooling explorer should have mapped the available infrastructure. Common patterns:

- **Browser automation**: `capture` CLI for UI changes — click through affected flows, screenshot results
- **CLI verification**: exercise changed behavior interactively in tmux
- **API testing**: dev server + curl/httpie for endpoint changes
- **Integration tests**: existing e2e or integration test suite
- **Smoke script**: create one if nothing else exists — it pays for itself immediately when validation agents can run it

If you cannot determine a concrete verification method from exploration findings, **ask the user** via the AskUserQuestion tool. Offer 2-3 specific options based on what the tooling explorer found. Do not proceed to implementation without a verification plan.

Write the recipe to `context/e2e-recipe.md` with:
- Setup steps (start dev server, build, seed data, etc.)
- Exact commands or interactions to verify
- What success looks like (expected output, visual state, response codes)

Implementation agents and validation agents both reference this file. Write it to be executable, not aspirational.

## Transitioning to Implementation

When exploration is complete, the plan is written, the plan has been reviewed, and the e2e recipe is defined — transition explicitly:

```bash
sisyphus yield --mode implementation --prompt "Begin implementation — see plan.md for work items"
```

The `--mode implementation` flag tells the next orchestrator cycle to load implementation-phase guidance. Pass a prompt that orients the next cycle to where things stand.
