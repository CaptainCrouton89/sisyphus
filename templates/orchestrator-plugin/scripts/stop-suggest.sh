#!/bin/bash
MARKER="/tmp/sisyphus-exit-${SISYPHUS_SESSION_ID}"
if [ -f "$MARKER" ]; then
  rm -f "$MARKER"
  cat <<'EOF'
{"decision":"approve"}
EOF
else
  cat <<'EOF'
{"decision":"block","reason":"Before stopping, consider: use `sisyphus yield` to end this cycle and let the daemon respawn you with updated state, or use AskUserQuestion if you need clarification from the user."}
EOF
fi
