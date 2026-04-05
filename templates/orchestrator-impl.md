---
name: implementation
description: Execute the plan — spawn agents, maximize parallelism, review results. Use when planning is complete and the roadmap is ready for execution.
---

# Implementation Phase

<stage-execution>

## Maximize Parallelism

Before each cycle, ask: **which stages or tasks are independent right now?** If two stages touch different subsystems, spawn them concurrently.

Maximize parallelism **within your development cycle, not by skipping parts of it.** Running a review alongside the next stage's implementation is good parallelism. Skipping review because the next stage is ready is cutting corners.

If the plan has stages that share no file dependencies, run them in parallel from the start. The development cycle for each stage:

1. **Detail-plan it** — expand the outline into specific file changes. If complex, spawn a requirements or design agent first.
2. **Implement it** — spawn agents with self-contained instructions.
3. **Critique and refine it** — spawn review agents, fix what they find.
4. **Validate it** — verify the stage actually works end-to-end.

Not every stage needs every step:
- Types/interfaces → implementation only (consumers surface type errors)
- Core business logic → implementation + critique minimum
- Integration/critical path → full loop including validation

**When multiple stages have completed without any critique or validation, stop implementing and catch up on verification.** Don't let unverified work compound.

Don't detail-plan all stages up front. What you learn implementing earlier stages should inform later ones.

</stage-execution>

<agent-instructions>

Implementation agent prompts must be **fully self-contained** — include everything the agent needs so it doesn't have to re-explore or guess:

- The overall session goal (one sentence)
- This agent's specific task (files to create/modify, what the change does, done condition)
- References to relevant context files (`conventions.md`, `explore-architecture.md`, etc.)
- The e2e recipe reference (`context/e2e-recipe.md`) for self-verification

Tell every implementation agent to report clearly when done: what they built, what files they changed, and any issues or uncertainties.

<delegate-outcomes>

### Delegate outcomes, not implementations

Define **what needs to happen and why**, not the code to write. If you're writing exact code snippets or line-by-line fix instructions in agent prompts, you're doing the agent's job.

<example>
<bad>
"Change line 45 from `x === y` to `crypto.timingSafeEqual(Buffer.from(x), Buffer.from(y))`, handle length mismatch..."
</bad>
<good>
"Fix the timing-safe comparison issue in authMiddleware.ts — see report at reports/agent-002-final.md, Major #3"
</good>
</example>

For fix agents: **pass the review report path and tell the agent to action the items.** The agent reads the report, understands the codebase, and figures out the right fix. Writing the code for them defeats the purpose of delegation.

The exception is architectural constraints the agent wouldn't know: "use the existing `personRepository.findOrCreateOwner` method" or "the Supabase client is at `supabaseService.getClient()`". Give agents the **what** and the **landmarks**, not the **how**.

</delegate-outcomes>

<context-propagation>

### Context propagation

The planning phase produced context files — conventions, e2e recipe, architectural findings. Be selective — give each agent the context relevant to their task.

<example>
<bad>
"Implement the auth middleware. Look at how the existing middleware works."
</bad>
<rationale>Vague. The agent must re-explore the codebase to find conventions and patterns.</rationale>
<good>
"Implement auth middleware per context/requirements-auth.md and context/design-auth.md. Reference context/conventions.md for middleware patterns. E2E recipe at context/e2e-recipe.md."
</good>
</example>

</context-propagation>

</agent-instructions>

<code-smell-escalation>

Instruct agents to flag problems early rather than working around them. When an agent encounters unexpected complexity, unclear architecture, or code that fights back — the right move is to stop and report clearly. A clear problem description is more valuable than a brittle implementation.

When you see these reports, investigate before pushing forward. If the smell suggests a design issue, involve the user.

</code-smell-escalation>

<critique-refinement>

## Critique Cycle

After implementation agents report, assess whether the stage needs critique before advancing. The failure mode is not "sometimes skipping review" — it's implementing six stages in a row without any.

When a stage warrants critique, spawn review agents in parallel, each attacking a different dimension:
- **Code reuse** — existing utilities, helpers, patterns the new code duplicates
- **Code quality** — hacky patterns, redundant state, parameter sprawl, copy-paste, leaky abstractions
- **Efficiency** — redundant computations, N+1 patterns, missed concurrency, unbounded data structures

Give each reviewer the full diff and relevant context files. They report problems — they don't fix.

## Refine Cycle

Aggregate reviewer findings. Spawn fix agents and **point them at the review report** — don't rewrite findings as line-by-line instructions. You triage (skip false positives, note architectural constraints) — they implement.

```bash
sisyphus spawn --name "fix-review-issues" --agent-type sisyphus:implement \
  "Fix the issues in reports/agent-003-final.md. Skip item #5 (false positive). Run type-check after."
```

Fix agents should use `/simplify` to review their own changes before reporting.

Re-review after fixes. Stop when reviewers return only stylistic nits. If 3+ rounds are needed, the approach — not the patches — needs rethinking.

</critique-refinement>

<e2e-validation>

E2E validation confirms the implementation actually works — not just compiles or passes unit tests. Reserve full validation for stages where you're building on accumulated work or where failure would be expensive to debug later. Don't let more than 2-3 stages accumulate without one.

Spawn a validation agent with the e2e recipe from `context/e2e-recipe.md`. The agent should:
- Follow setup steps exactly (build, start servers, seed data)
- Run every verification step
- Report exactly what passed and what failed

If the recipe involves UI, use `capture` to screenshot the running app. If API, curl the endpoints. If CLI, exercise it in the terminal.

If the project lacks validation tooling, **create it** — a smoke-test script, seed command, or health-check endpoint pays for itself immediately.

**Don't advance past a validated stage until validation passes.** If it fails, log failures, spawn fix agents, re-validate.

When all implementation stages are complete, transition to validation mode for the comprehensive final pass:

```bash
sisyphus yield --mode validation --prompt "All stages implemented — validate against context/e2e-recipe.md"
```

Validation mode shifts the orchestrator's entire focus to proving the feature works. Stage-level validation during implementation catches issues early; the final validation pass proves the whole thing holds together.

</e2e-validation>

<returning-to-planning>

If the approach is wrong mid-implementation, don't keep pushing. Return to planning:

```bash
sisyphus yield --mode planning --prompt "Re-evaluate: discovered X changes the approach — write cycle log"
```

Concrete triggers:
- 2+ agents report same unexpected complexity in the same subsystem
- An agent discovers a dependency that changes the approach
- Fix agents keep patching the same area across cycles

Document what you found in the cycle log before yielding. Update roadmap.md to reflect you're back in an earlier phase.

</returning-to-planning>

<impl-cli>

## Implementation CLI

```bash
sisyphus update-task "revised goal"                      # update the session goal mid-flight
sisyphus restart-agent <agentId>                         # respawn a failed/killed agent in a new pane
sisyphus rollback <sessionId> <cycle>                    # rewind state to a prior cycle boundary
```

</impl-cli>
