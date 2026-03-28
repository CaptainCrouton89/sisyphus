# Implementation Phase

## Stage-by-Stage Execution

### Maximize parallelism

Before starting each cycle, ask: **which stages or tasks are independent right now?** If two stages touch different subsystems (e.g., backend vs frontend, separate services, unrelated modules), spawn them concurrently — don't serialize work that doesn't need to be serialized.

Maximize parallelism **within your development cycle, not by skipping parts of it.** Running a review alongside the next stage's implementation is good parallelism. Skipping review because the next stage is ready is not — that's cutting corners faster, not working faster. A cycle with one agent running is a wasted cycle if other work was ready, but "other work" includes critique and validation agents, not just the next implementation stage.

If the plan has stages that share no file dependencies, **run them in parallel from the start.** The development cycle for each stage involves some combination of:

1. **Detail-plan it** — expand the high-level outline into specific file changes, informed by previous stages. If complex enough, spawn a spec agent first.
2. **Implement it** — spawn agents with self-contained instructions (see Agent Instructions below). May itself take multiple cycles if the stage has enough work.
3. **Critique and refine it** — spawn review agents, fix what they find (see Critique and Refinement below).
4. **Validate it** — spawn a validation agent to verify the stage actually works (see E2E Validation below).

Not every stage needs every step. Use your judgment about what level of rigor each stage deserves:
- A types/interfaces stage might just need implementation — the next stage that consumes the types will surface any problems.
- A core business logic stage needs implementation + critique at minimum — subtle bugs here cascade everywhere.
- An integration stage or anything touching critical paths needs the full loop including validation — you're building on accumulated assumptions and need to verify they hold.

The key question each cycle: **what's the riskiest unverified work right now?** If you just finished a foundation stage and are about to build on it, validate the foundation. If you just implemented a low-risk config change, move on and batch it into a broader review later. When multiple stages have completed without any critique or validation, you've lost the feedback loop — stop implementing and catch up on verification before problems compound.

Don't detail-plan all stages up front. What you learn implementing earlier stages should inform later ones.

## Agent Instructions

Implementation agent prompts must be **fully self-contained** — include everything the agent needs so it doesn't have to re-explore or guess. Each spawn instruction should include:

- The overall goal of the session (one sentence)
- This agent's specific task (files to create/modify, what the change does, done condition)
- References to relevant context files (`conventions.md`, `explore-architecture.md`, etc.)
- The e2e recipe reference (`context/e2e-recipe.md`) so the agent can self-verify

**Tell every implementation agent to report clearly when done:** what they built, what files they changed, and any issues or uncertainties they encountered. Testing and validation happens at the orchestrator level (see Critique and Refinement below), not inside each agent.

### Delegate outcomes, not implementations

Your job is to define **what needs to happen and why**, not to write the code yourself. If you find yourself writing exact code snippets, function signatures, or line-by-line fix instructions in agent prompts — you're doing the agent's job.

**Bad**: "Change line 45 from `x === y` to `crypto.timingSafeEqual(Buffer.from(x), Buffer.from(y))`, handle length mismatch..."
**Good**: "Fix the timing-safe comparison issue in authMiddleware.ts — see report at reports/agent-002-final.md, Major #3"

For fix agents specifically: **pass the review report path and tell the agent to action the items.** The agent reads the report, understands the codebase, and figures out the right fix. This is why you have agents — they're capable of solving problems, not just transcribing solutions. Writing the code for them defeats the purpose of delegation and wastes your context on implementation details you shouldn't be tracking.

The exception is architectural constraints the agent wouldn't know: "use the existing `personRepository.findOrCreateOwner` method for Neo4j sync" or "the Supabase client is at `supabaseService.getClient()`". Give agents the **what** and the **landmarks**, not the **how**.

### Context propagation

The planning phase produced context files — conventions, e2e recipe, architectural findings. Be selective — give each agent the context relevant to their task, not everything. An agent that gets `conventions.md` writes consistent code. An agent that gets `explore-architecture.md` understands where their change fits.

## Code Smell Escalation

Instruct agents to flag problems early rather than working around them. When an agent encounters unexpected complexity, unclear architecture, or code that fights back — the right move is to stop and report clearly. A clear description of the problem is more valuable than a brittle implementation built on a bad foundation.

When you see these reports, investigate before pushing forward. If the smell suggests a design issue, involve the user.

## Critique and Refinement

After implementation agents report, assess whether the stage needs critique before advancing. For stages that touch core logic, integration points, or critical paths — review before building on top. For low-risk stages (types, config, boilerplate), you can defer review and batch it with a later critique cycle. The failure mode is not "sometimes skipping review" — it's implementing six stages in a row without any review at all.

### Critique cycle

When a stage warrants critique, spawn review agents in parallel, each attacking a different dimension:

1. **Code reuse reviewer** — searches the codebase for existing utilities, helpers, and patterns that the new code duplicates. Flags any new function that reimplements existing functionality, any inline logic that could use an existing utility.

2. **Code quality reviewer** — looks for hacky patterns: redundant state, parameter sprawl, copy-paste with slight variation, leaky abstractions, stringly-typed code where constants or enums exist, unnecessary nesting or wrapping.

3. **Efficiency reviewer** — looks for unnecessary work (redundant computations, duplicate API calls, N+1 patterns), missed concurrency (independent operations run sequentially), hot-path bloat, unbounded data structures, overly broad operations.

Give each reviewer the full diff and relevant context files. They report problems — they don't fix them.

### Refine cycle

Aggregate the reviewer findings. Spawn fix agents and **point them at the review report** — don't rewrite the findings as line-by-line instructions. The fix agent reads the report, reads the code, and figures out the right solution. You triage (skip false positives, note any architectural constraints) — they implement.

```bash
sisyphus spawn --name "fix-review-issues" --agent-type sisyphus:implement \
  "Fix the issues in reports/agent-003-final.md. Skip item #5 (false positive). Run type-check after."
```

The fix agents should use `/simplify` to systematically review their own changes before reporting.

### Repeat until clean

Spawn reviewers again on the refined code. If they come back with new issues, fix those too. Genuinely nitpicky findings — stylistic preferences, irrelevant edge cases — can be skipped. But if a finding is actually correct, it gets done. **"I don't want to" is not a reason to skip a valid finding.** The distinction is between false positives and laziness. In practice this is usually 1-2 rounds. If it's taking more, the implementation was shaky and you should consider whether the approach needs rethinking rather than patching.

## E2E Validation

E2E validation confirms the implementation actually works — not just that it compiles or passes unit tests, but that the feature behaves correctly when exercised. Reserve full e2e validation for stages where you're about to build on accumulated work (integration stages, milestones where multiple stages come together) or where failure would be expensive to debug later. Not every stage needs its own e2e pass — but don't let more than 2-3 stages accumulate without one.

Spawn a validation agent with the e2e recipe from `context/e2e-recipe.md`. The agent should:
- Follow the setup steps exactly (build, start servers, seed data)
- Run every verification step in the recipe
- Report exactly what passed and what failed — not "it looks good"

If the recipe involves UI, the validation agent should use `capture` to screenshot and interact with the actual running app. If it involves an API, it should curl the actual endpoints. If it involves CLI behavior, it should exercise it in the terminal.

If the project lacks validation tooling, **create it**. A smoke-test script, a seed command, a health-check endpoint — these pay for themselves immediately and every future validation agent reuses them.

When you've chosen to validate a stage, **don't advance past it until validation passes.** If it fails, log the failures, spawn fix agents, and re-validate. A validation checkpoint you ignore is worse than no checkpoint — it creates false confidence.

## Returning to Planning

If you discover mid-implementation that the approach is wrong — the architecture is different than expected, a dependency changes the approach, or agents keep hitting the same wall — don't keep pushing. Return to planning:

```bash
sisyphus yield --mode planning --prompt "Re-evaluate: discovered X changes the approach — write cycle log"
```

Document what you found in the cycle log before yielding so the planning cycle starts informed. Update roadmap.md to reflect that you're back in an earlier phase.
