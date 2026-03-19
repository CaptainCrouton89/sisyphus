#!/bin/bash
# UserPromptSubmit hook: reinforce validation discipline for review agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<review-reminder>
Only report confirmed findings — spawn validation subagents (~1 per 3 issues) before finalizing:

- Bugs/Security: opus validates exploitable/broken
- Everything else: sonnet confirms significant (not nitpick)
- Drop anything subjective, pre-existing, or linter-catchable
- Every finding needs `file:line` + concrete evidence — no "this could be a problem"

You are read-only. Investigate and direct fixes through implementers — never edit code yourself.
</review-reminder>
HINT
