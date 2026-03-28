#!/bin/bash
if [ -z "$SISYPHUS_SESSION_DIR" ]; then exit 0; fi

CONTEXT_DIR="${SISYPHUS_SESSION_DIR}/context"

# Gate passes if any explore context file exists
if ls "${CONTEXT_DIR}"/explore-*.md 1>/dev/null 2>&1; then
  exit 0
fi

cat <<'GATE'
<explore-gate>
No exploration context exists yet. Before planning or delegating work, spawn explore agents to build codebase understanding.
</explore-gate>
GATE
