#!/bin/bash
# UserPromptSubmit hook: remind plan agent to delegate for large tasks.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<planning-reminder>
For particularly large or multi-domain tasks, delegate sub-plans to specialist agents rather than planning everything solo:

- Spawn parallel Plan agents, each focused on a specific domain or layer
- Each sub-planner investigates deeply and saves their work to context/plan-{topic}-{slice}.md
- Synthesize their outputs into one cohesive master plan: resolve conflicts, fill gaps between slices, stress-test cross-cutting edge cases
- Then spawn review agents to critique the assembled plan before finalizing

Default toward delegation when in doubt — a round-trip for synthesis is cheaper than a shallow plan that misses edge cases. The cost of spawning sub-planners is low; the cost of a surface-level plan across too many concerns is high.
</planning-reminder>
HINT
