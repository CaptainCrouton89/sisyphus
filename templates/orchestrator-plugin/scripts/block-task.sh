#!/bin/bash
# Block Task tool — orchestrator should use sisyphus spawn CLI directly.
# Passthrough (exit 0) if not in a sisyphus session.

if [ -z "$SISYPHUS_SESSION_ID" ]; then
  exit 0
fi

cat <<'EOF'
{"decision":"block","reason":"Do not use the Task tool. Use the sisyphus CLI to spawn agents:\n- sisyphus spawn --name \"agent-name\" --agent-type sisyphus:implement \"instruction\"\n- echo \"instruction\" | sisyphus spawn --name \"agent-name\"\nThen call sisyphus yield when done spawning."}
EOF
