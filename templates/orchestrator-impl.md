# Implementation Phase

## Stage-by-Stage Execution

### Maximize parallelism

Before starting each cycle, ask: **which stages or tasks are independent right now?** If two stages touch different subsystems (e.g., backend vs frontend, separate services, unrelated modules), spawn them concurrently — don't serialize work that doesn't need to be serialized. Use `--worktree` when parallel agents might touch overlapping files.

Sequential execution is the default trap. Fight it actively. At every yield, look for work that can run alongside the next stage — review agents while the next implementation starts, frontend and backend stages in parallel, independent fix agents concurrently. A cycle with one agent running is a wasted cycle if other work was ready.

If the plan has stages that share no file dependencies, **run them in parallel from the start.** Each stage is multiple cycles:

1. **Detail-plan it** — expand the high-level outline into specific file changes, informed by previous stages. If complex enough, spawn a spec agent first.
2. **Implement it** — spawn agents with self-contained instructions (see Agent Instructions below). May itself take multiple cycles if the stage has enough work.
3. **Critique and refine it** — spawn parallel review agents, fix what they find, repeat until clean (see below).
4. **Validate it end-to-end** — spawn a validation agent with the e2e recipe. Don't advance until it passes.
5. **Update roadmap.md** — mark the stage done in the implementation phase, refine future stage outlines if what you learned changes the approach.

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

After implementation agents report, **do not advance to the next stage.** The code needs to be reviewed and refined first. This is not optional.

### Critique cycle

Spawn three review agents in parallel, each attacking a different dimension:

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

After the critique/refine loop produces clean code, **validate end-to-end before advancing.** This is also not optional. The implementing agent is the worst validator of its own work — same blind spots, same assumptions.

Spawn a validation agent with the e2e recipe from `context/e2e-recipe.md`. The agent should:
- Follow the setup steps exactly (build, start servers, seed data)
- Run every verification step in the recipe
- Report exactly what passed and what failed — not "it looks good"

If the recipe involves UI, the validation agent should use `capture` to screenshot and interact with the actual running app. If it involves an API, it should curl the actual endpoints. If it involves CLI behavior, it should exercise it in the terminal.

If the project lacks validation tooling, **create it**. A smoke-test script, a seed command, a health-check endpoint — these pay for themselves immediately and every future validation agent reuses them.

**Only advance to the next stage when validation passes.** If it fails, log the failures, spawn fix agents, and re-validate.

## Worktree Preference

When spawning two or more implementation agents in the same cycle, prefer `--worktree` for each. Worktree isolation eliminates file conflict risk — agents can't clobber each other's changes, each gets a clean branch, and they can commit incrementally. The daemon merges branches back when agents complete and surfaces conflicts in your next cycle's state.

```bash
sisyphus spawn --name "impl-auth" --agent-type sisyphus:implement --worktree "Add session middleware — see context/conventions.md"
sisyphus spawn --name "impl-routes" --agent-type sisyphus:implement --worktree "Add login routes — see context/conventions.md and context/explore-architecture.md"
```

## Returning to Planning

If you discover mid-implementation that the approach is wrong — the architecture is different than expected, a dependency changes the approach, or agents keep hitting the same wall — don't keep pushing. Return to planning:

```bash
sisyphus yield --mode planning --prompt "Re-evaluate: discovered X changes the approach — see logs.md"
```

Document what you found in logs.md before yielding so the planning cycle starts informed. Update roadmap.md to reflect that you're back in an earlier phase.
