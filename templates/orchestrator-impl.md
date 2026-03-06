# Implementation Phase

## Context Propagation

The planning phase produced context files — conventions, e2e recipe, architectural findings. This is what makes planning pay off: don't leave those files sitting in the context dir. When spawning implementation agents, include references to the relevant context files in their instructions.

An agent that gets `conventions.md` writes consistent code. An agent that gets `e2e-recipe.md` can self-verify before submitting. An agent that gets `explore-architecture.md` understands where their change fits without re-exploring. Agents that don't get these files will make the same mistakes the planning phase was designed to prevent.

Be selective — give each agent the context files relevant to their specific task, not everything.

## Code Smell Escalation

Instruct agents to flag problems early rather than working around them. When an agent encounters unexpected complexity, unclear architecture, patterns that seem wrong, or code that fights back — the right move is to stop and report it clearly. A clear description of the problem is more valuable than a brittle implementation built on top of a bad foundation.

When you see these reports, investigate before pushing forward. Don't spawn another agent to work around what the first one flagged — understand it first. If the smell suggests a design issue, involve the user.

## Verification

After agents report, spawn a separate validation agent to run the e2e recipe from `context/e2e-recipe.md`. The implementing agent is the worst validator of its own work — same blind spots, same assumptions, same test cases they already thought to try.

Prefer validation that exercises actual behavior:
- Run the e2e recipe steps
- A reviewer agent that reads the diff and tries to break it
- Integration tests that run the real code path

If the project lacks validation tooling, **create it**. A smoke-test script pays for itself immediately.

## Don't Trust Agent Reports

Agents are optimistic — they'll report success even when the work is sloppy. Passing tests and type checks are table stakes. **Spawn review agents to audit the actual code** and look for these patterns:

- Mock/placeholder data left in production code
- Dead code and unused imports
- Duplicate logic instead of reusing what exists
- Overengineered abstractions
- Hacky unidiomatic solutions (hand-rolling what a library already does)

## Worktree Preference

When spawning two or more implementation agents in the same cycle, prefer `--worktree` for each. Worktree isolation eliminates file conflict risk — agents can't clobber each other's changes, each gets a clean branch, and they can commit incrementally. The daemon merges branches back when agents complete and surfaces conflicts in your next cycle's state.

```bash
sisyphus spawn --name "impl-auth" --agent-type sisyphus:implement --worktree "Add session middleware — see context/conventions.md"
sisyphus spawn --name "impl-routes" --agent-type sisyphus:implement --worktree "Add login routes — see context/conventions.md and context/explore-architecture.md"
```

## Returning to Planning

If you discover mid-implementation that the plan is wrong or incomplete — the architecture is different than expected, a dependency changed the approach, or agents keep hitting the same unexpected wall — don't keep pushing. Return to planning explicitly:

```bash
sisyphus yield --mode planning --prompt "Re-evaluate: discovered X changes the approach — see logs.md"
```

Document what you found in logs.md before yielding so the planning cycle starts informed.
