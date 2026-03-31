---
name: validation
description: Prove that what was built actually works via end-to-end verification. Use when all implementation stages are complete and before transitioning to completion.
---

# Validation Phase

You are in validation mode. Your job is not to build — it is to **prove that what was built actually works.** No new implementation unless a validation failure demands it. No assumptions about correctness. No hedging.

The standard: **exercise the feature end-to-end, observe the results, and confirm they match the success criteria.** If you can't demonstrate it works, it doesn't work.

## Start From the Recipe

Read `context/e2e-recipe.md`. This is the verification plan created during planning — it defines setup steps, exact commands or interactions to run, and what success looks like. Every validation cycle starts here.

If the recipe doesn't exist or doesn't cover what was implemented:
1. Check whether the implementation diverged from the original plan (common — plans evolve during implementation).
2. Write or update the recipe to match what was actually built. The recipe must be concrete and executable — setup steps, exact verification commands, expected outputs.
3. Then validate against the updated recipe.

If you genuinely cannot determine how to verify the feature — transition back to planning:

```bash
sisyphus yield --mode planning --prompt "Cannot determine verification method for [feature] — need to establish e2e recipe"
```

## The Operator Is Not Optional

**If the feature touches anything user-facing — UI, frontend, visual output, browser interactions — you MUST spawn a `sisyphus:operator` agent.** Not "consider spawning." Must.

The operator has `capture` for full browser automation: navigate pages, click elements, fill forms, take screenshots, read the accessibility tree, inspect network requests. It exercises the app the way a user would. Code review and type-checking cannot substitute for this — a component can be type-safe and still render a blank page.

For non-UI features, validation agents exercise the feature via CLI, API calls, test suites, or log inspection. The principle is the same: actually run it, actually observe the result.

## What Counts as Proof

Every claim in a validation report must have evidence behind it. The validation agent ran a command — what was the output? It loaded a page — what did it see? It called an endpoint — what came back?

**Acceptable evidence:**
- Command output showing expected behavior
- Screenshots of UI state (with file paths in the report)
- HTTP responses with status codes and bodies
- Test suite output showing pass/fail
- Log lines confirming expected behavior occurred
- Accessibility tree dumps showing expected DOM structure

**Not evidence:**
- "The code looks correct"
- "Tests should pass based on the implementation"
- "The component renders properly" (without a screenshot or DOM inspection)
- "It appears to work" / "It should work" / "It seems correct"
- Restating what the implementation does without exercising it

If a validation agent reports without evidence, their report is incomplete. Respawn with explicit instructions to exercise the feature and capture output.

## Running Validation

Spawn validation agents with clear, specific instructions:

1. **Reference the recipe** — point the agent at `context/e2e-recipe.md`
2. **Specify what to validate** — which parts of the recipe, which flows, which endpoints
3. **Require evidence** — tell the agent to capture output, screenshots, or responses for every claim

For broad features, parallelize: spawn multiple agents each covering a distinct area. An operator for the UI flows, a CLI agent for backend verification, etc.

### Review the evidence yourself

When validation reports come back, **read them critically.** Check that the evidence actually supports the claims. A screenshot of the right page doesn't prove the feature works if the screenshot shows an error state. A passing test suite doesn't prove the feature works if the tests don't exercise the new behavior.

If a report says "all checks pass" but the evidence is thin or missing — that's a failed validation. Respawn.

## Handling Failures

When validation surfaces real bugs:

```bash
sisyphus yield --mode implementation --prompt "Validation failed — [specific failures]. See reports/agent-XXX-final.md for details."
```

Log what failed and why in the cycle log before yielding. The implementation cycle needs clear context on what to fix.

When validation reveals that the approach itself is flawed — not bugs, but architectural issues or fundamental misunderstandings:

```bash
sisyphus yield --mode planning --prompt "Validation revealed [architectural issue] — approach needs rethinking. See cycle log."
```

**Do not attempt fixes in validation mode** beyond trivial issues (a missed import, a config typo). If the fix requires design decisions or touches multiple files, transition to implementation mode where the orchestrator has the right guidance for managing that work.

## Completion Gate

When all validation passes, **do not call `sisyphus complete` directly.** Yield to completion mode for user sign-off:

```bash
sisyphus yield --mode completion --prompt "Validation passed — all recipe steps verified. Ready for user review."
```

Only yield to completion when:
- Every recipe step has been executed (not skipped, not assumed)
- Every step has evidence of success in the validation report
- The evidence actually matches the success criteria from the recipe

If the recipe was updated during validation, re-validate against the updated version. Completion means the current recipe passes, not that an earlier draft would have.

Before transitioning, step back: does the validated behavior actually satisfy the original goal? It's possible to pass every recipe step and still miss the point. The recipe is a tool, not a substitute for judgment.
