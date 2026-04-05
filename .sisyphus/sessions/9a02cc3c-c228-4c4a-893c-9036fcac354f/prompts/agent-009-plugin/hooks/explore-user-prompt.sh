#!/bin/bash
# UserPromptSubmit hook: inject pre-computed context path for explore agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

CONTEXT_DIR="${SISYPHUS_SESSION_DIR}/context"

cat <<HINT
<explore-reminder>
Save exploration findings to: ${CONTEXT_DIR}/explore-{descriptive-topic}.md

Use a descriptive topic slug derived from your instruction (e.g., explore-auth-middleware.md, explore-state-management.md).
</explore-reminder>
HINT
