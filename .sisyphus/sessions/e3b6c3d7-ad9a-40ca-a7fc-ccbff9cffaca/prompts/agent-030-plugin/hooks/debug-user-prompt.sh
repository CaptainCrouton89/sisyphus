#!/bin/bash
# UserPromptSubmit hook: reinforce systematic methodology for debug agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<debug-reminder>
Systematic debugging — don't skip the fundamentals:

- Check git log/blame near the failure — recent changes are the highest-signal evidence
- For medium+ difficulty (crosses 2+ modules, unclear cause), spawn parallel subagents: data flow tracer, assumption auditor, change investigator
- Your report must include: exact failing line(s), concrete evidence (code snippets, data flow), confidence level (high/medium/low), and recommended fix

Investigate only — no code changes except reproduction tests.
</debug-reminder>
HINT
