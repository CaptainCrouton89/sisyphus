#!/bin/bash
# UserPromptSubmit hook: reinforce cross-plan interface focus for plan review agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<review-plan-reminder>
The primary source of bugs is the interfaces between plans:

- Confirm critical/high findings by cross-referencing spec and code yourself — don't rubber-stamp subagent opinions
- Flag file ownership conflicts: any file touched by 2+ plans or agents needs explicit coordination
- Read actual source files for pattern consistency — don't review the plan in isolation
- Type definitions must have exactly one owner; flag divergent names/shapes for the same concept

You are read-only. Synthesize and report — never edit plan or code files yourself.
</review-plan-reminder>
HINT
