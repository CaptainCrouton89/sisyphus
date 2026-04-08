---
name: planning
description: Deep exploration, spec alignment and detailed roadmap creation. Use after strategy is established and before implementation begins.
---

# Planning Phase

<planning-workflow>

The natural sequence: **context → spec → roadmap refinement → detailed planning.** Context documents come first because they feed everything downstream — spec leads, planners, and implementers all benefit from not having to re-explore the codebase. After the spec is aligned, revisit the roadmap — that's when you actually understand scope well enough to flesh out phases honestly.

</planning-workflow>

<exploration>

Use explore agents to build understanding before making decisions. Each agent saves a focused context document to `$SISYPHUS_SESSION_DIR/context/`.

- **Each agent produces a focused artifact** — not one sprawling document. Focused documents can be selectively passed to downstream agents.
- **Conventions and patterns are high-value** to capture. Implementation agents that receive convention context write consistent code.
- **Exploration serves different purposes at different stages.** Early exploration is architectural. Later exploration before a specific stage is tactical — files, patterns, utilities to reuse.
- **Delegate understanding of unfamiliar territory.** If the task touches an unfamiliar library or subsystem, spawn an agent to investigate and report.

</exploration>

<spec-alignment>

Spec is the combined product discovery + technical design stage. Spawning a spec agent hands off both to a specialist that collaborates with the user directly: exploring the codebase, asking informed questions, drafting a design, writing EARS requirements with TUI review, and deepening the design with what was learned.

**When to spawn a spec agent:**
- Any feature that adds or changes user-visible behavior
- Any task where you're making assumptions about what "done" looks like
- When exploration revealed ambiguity, trade-offs, or multiple valid interpretations

**When you can skip spec:**
- Pure bug fixes with clear reproduction steps
- Mechanical refactors with no behavioral change (rename, extract, move)
- Tasks where the user has already provided explicit, detailed acceptance criteria in their starting prompt

If you're unsure, spawn the spec agent. The cost of a short spec conversation is low. The cost of building the wrong thing is an entire wasted implementation cycle.

**Spec refinement is iterative.** The spec agent works with the user, but the process doesn't end when documents are saved:
- Have agents review requirements for feasibility (can this actually work given the codebase?)
- **Fold new knowledge into authoritative documents.** When reviews, exploration, or user feedback resolve questions or change the understanding, update requirements and design documents directly — they are the single source of truth. Delete resolved questions from their listing sections, then update the topical sections where those answers belong so the document reads as settled fact. Don't create correction files, addendum files, or decision logs alongside them.

</spec-alignment>

<plan-delegation>

Once you have context docs and aligned spec outputs (requirements + design), revisit the roadmap — this is the first point where you understand real scope. Roadmap refinement means updating the four canonical sections: current stage, exit criteria, active context references, and next steps. Decisions from exploration and spec work fold into context documents — not the roadmap.

Spawn **one plan lead** per feature. Point it at inputs (requirements, design, context docs) — not a pre-made structure. The plan lead handles its own decomposition: it assesses scope, delegates sub-plans if needed, runs adversarial reviews, and delivers a synthesized master plan. **Delegate outcomes, not implementations** — tell the plan lead what needs planning and why, not how to structure the plan.

**Don't split planning yourself.** If the orchestrator pre-splits into "backend plan agent" and "frontend plan agent," the plan lead's synthesis step — resolving cross-domain conflicts, finding gaps, stress-testing edge cases — never happens.

**When to spawn multiple plan leads:** Only for genuinely independent features with no shared files or integration points.

</plan-delegation>

<progressive-development>

Not all tasks need the same process depth.

- **Small task** (1-3 files, single domain): Skip phases — roadmap is a short checklist (diagnose, fix, validate). Single plan agent, single implement agent.
- **Large task** (3+ stages, multiple domains): Full phased development. The roadmap tracks phases, each producing artifacts in `context/`.

Signs you need phased development: multiple unfamiliar subsystems, the task spans different concerns (backend, frontend, IPC), or the spec has more than 3 distinct work areas.

Implementation stages are context artifacts — saved to `context/plan-stage-N-*.md`. Detail-plan one stage at a time; what you learn implementing stage N informs stage N+1.

</progressive-development>

<verification-planning>

Before implementation begins, determine how to concretely verify the change works end-to-end. This is the single most common failure mode: agents report success but nothing actually works.

If you cannot determine a concrete verification method, **ask the user**. Do not proceed to implementation without a verification plan.

Write the recipe to `context/e2e-recipe.md` with setup steps, exact commands or interactions to verify, and what success looks like. Make it executable, not aspirational. Implementation agents and validation agents both reference this file.

</verification-planning>

<planning-cli>

## Planning CLI

```bash
sisyphus requirements <file> --wait    # launch requirements review TUI, block until user finishes, print feedback
sisyphus design <file> --wait          # launch design review TUI, block until user finishes, print feedback
sisyphus requirements --export --session-id <id>  # render requirements.json → requirements.md (no LLM tokens)
```

These are review TUIs the spec agent invokes — also usable standalone for inspecting any `requirements.json` / `design.json`. `--wait` blocks your pane until the user completes the review and returns their feedback to stdout. Use `--pane` (implied by `--wait`) to open in a side tmux pane so your pane stays visible.

</planning-cli>

<transition>

When you have enough understanding, a reviewed plan, and a verification recipe — transition explicitly:

```bash
sisyphus yield --mode implementation --prompt "Begin implementation — see roadmap.md and context/plan-implementation.md"
```

The `--mode implementation` flag loads implementation-phase guidance for the next cycle.

After implementation is complete, transition to validation mode to prove the feature works:

```bash
sisyphus yield --mode validation --prompt "Implementation complete — validate against context/e2e-recipe.md"
```

</transition>
