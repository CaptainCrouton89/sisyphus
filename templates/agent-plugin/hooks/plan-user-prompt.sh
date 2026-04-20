#!/bin/bash
# UserPromptSubmit hook: reinforce plan agent's scope + split rules.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<planning-reminder>
Scope decision:
- ≤5 files single domain → single plan file, ≤200 lines
- 6+ files or multi-domain → master plan (≤200 lines) + sub-plans

The master (file with a "## Sub-Plans" heading) carries sub-plan links, phase skeletons, task table, and architectural decisions. Per-domain detail, long env-var tables, and deployment blocks go in sub-plans.

If $SISYPHUS_SESSION_DIR/strategy.md has more than one implementation phase, plan only the next phase. The orchestrator re-enters planning mode after each phase lands.

Use inline types, schemas, or small snippets where they describe a new shape more tightly than prose. For existing code, use a pattern reference ("Follow `src/jobs/index.ts`").
</planning-reminder>
HINT
