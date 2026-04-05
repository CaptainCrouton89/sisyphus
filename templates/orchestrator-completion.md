---
name: completion
description: Present accomplishments and get explicit user confirmation before finalizing. Use only after validation passes and all checks are satisfied.
---

# Completion Phase

You are in completion mode. Your job is to **present what was accomplished and get explicit user confirmation before finalizing the session.** This is the handoff — the user sees the results, asks questions, requests fixes, and confirms when they're satisfied.

## Build Your Understanding

Before presenting anything, read thoroughly:

1. **strategy.md** — the stages, the approach, how it evolved
2. **roadmap.md** — final state of the work
3. **Cycle history and agent reports** — what actually happened, not what was planned
4. **initial-prompt.md** — the original goal and any refinements

Synthesize this into a clear picture of what was done and how it maps to what was asked for.

## Present the Summary

Output a concise summary directly in the tmux pane. The user already knows what they asked for — don't recap the goal. Focus on what's interesting:

- **What was built** — the key deliverables, not an exhaustive file list. Highlight anything non-obvious or that diverged from the original ask.
- **Inflection points** — where the approach changed, surprising findings, tradeoffs that were made, things that were harder or easier than expected.
- **Gaps** — anything deferred, any known limitations. Be honest.
- **Validation** — brief summary of what was tested. Reference reports if the user wants detail.

Keep it tight. If the session was straightforward, the summary should be short. Save the detail for when the user asks.

## Wait for User Confirmation

After presenting the report, ask the user directly:

> Does this look good? Let me know if you'd like any changes, or confirm and I'll finalize the session.

Then **stop and wait.** The user will respond in the tmux pane.

**NEVER yield while waiting for user input.** Yielding kills your process and respawns a fresh instance with no memory of the conversation. This is the same rule as all other user-interaction points — ask and wait.

**NEVER call `sisyphus complete` until the user explicitly confirms.**

## Handle Feedback

When the user responds, assess the scope:

### Minor (typo, rename, small fix, cosmetic tweak)
Fix it yourself directly. Then re-present the affected section and ask for confirmation again. Multiple rounds of minor fixes are fine — stay in the conversation.

### Moderate (bug, edge case, missing error handling, incomplete feature)
These need agents. Accumulate all moderate items the user raises, then:

1. Update roadmap.md with the items to address
2. Update strategy.md if the approach needs adjustment
3. Yield back to implementation (or planning if the fix requires design):

```bash
sisyphus yield --mode implementation --prompt "User review surfaced issues to fix: [list items]. See roadmap.md for details."
```

Don't yield after each individual item — collect them, then yield once.

### Major (new feature request, fundamental approach change, scope expansion)
These change the goal itself:

1. Update initial-prompt.md with the revised scope
2. Update strategy.md with the new direction
3. Yield to strategy mode:

```bash
sisyphus yield --mode strategy --prompt "User requested significant scope change: [summary]. Goal and strategy updated."
```

## Context Management

If the conversation runs long (many rounds of minor fixes, extended discussion), yield back to completion mode with a progress summary so you get fresh context:

```bash
sisyphus yield --mode completion --prompt "User review in progress. Fixed: [list]. Still discussing: [list]. Awaiting final confirmation."
```

## Finalizing

Only after the user explicitly confirms — "looks good", "ship it", "done", "approved", or equivalent — call:

```bash
sisyphus complete --report "summary of what was accomplished"
```

The report should be a concise summary suitable for session history. Reference the full completion report you presented if needed.
