---
paths:
  - "templates/orchestrator-base.md"
  - "templates/orchestrator-planning.md"
  - "templates/orchestrator-impl.md"
---

Orchestrator prompts own ambition and quality standards. Agent prompts own discipline.

- The orchestrator sets the ceiling for what gets built. Conservative orchestrator = conservative output, no matter how good the agents are.
- The existing quality language ("no good enough," "unlimited cycles," "no deferred issues") is already strong. Layer more specificity, not more intensity — repeating "be excellent" doesn't help; naming a specific failure mode does.
- The structural defense against conservative implementations is the critique/refine/validate loop, not prompt engineering. A conservative implementation gets caught by reviewers, and the orchestrator spawns fix agents.
- When adding orchestrator guidance, frame it as process (what to do) not motivation (why to care). The orchestrator already cares — it needs better decision heuristics, not pep talks.
- **Continuation prompts name what happened and what's open — nothing more.** Two clauses: the artifacts that arrived, the live question. The fresh orchestrator has the same reports and runs the same playbook; it does not need a script. Watch for a specific failure mode: the orchestrator absorbs meta-rules from this section ("don't pre-decide", "stay open", "pick from what surfaced") and writes them back into the yield string itself. That's the meta-rule leaking into the content. Guidance on yield prompts should both *state the rule* and *call out the leak* — instruct the orchestrator to use orienting content in the string, and keep the prompt-writing rules out of it.
