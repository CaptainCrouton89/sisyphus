#!/bin/bash
# Intercept SendMessage and route through sisyphus report/submit infrastructure.
# Passthrough (exit 0) if not in a sisyphus session or if jq is missing.

# Passthrough if not in a sisyphus session
if [ -z "$SISYPHUS_SESSION_ID" ]; then
  exit 0
fi

# Passthrough if jq not available
if ! command -v jq &>/dev/null; then
  exit 0
fi

# Read hook input from stdin
input=$(cat)

# Extract type and content from tool_input
msg_type=$(echo "$input" | jq -r '.tool_input.type // empty')
content=$(echo "$input" | jq -r '.tool_input.content // empty')

if [ -z "$content" ]; then
  cat <<'EOF'
{"decision":"block","reason":"SendMessage content is empty. Provide a message to send."}
EOF
  exit 0
fi

case "$msg_type" in
  message)
    # Final submission — pipe content to sisyphus submit
    error=$(echo "$content" | sisyphus submit 2>&1)
    rc=$?
    if [ $rc -ne 0 ]; then
      # Relay error (likely worktree uncommitted changes check)
      reason=$(echo "$error" | tr '\n' ' ' | sed 's/"/\\"/g')
      echo "{\"decision\":\"block\",\"reason\":\"Submit failed: ${reason}\"}"
      exit 0
    fi
    cat <<'EOF'
{"decision":"block","reason":"Report submitted to orchestrator."}
EOF
    ;;
  broadcast)
    # Progress report — pipe content to sisyphus report
    error=$(echo "$content" | sisyphus report 2>&1)
    rc=$?
    if [ $rc -ne 0 ]; then
      reason=$(echo "$error" | tr '\n' ' ' | sed 's/"/\\"/g')
      echo "{\"decision\":\"block\",\"reason\":\"Report failed: ${reason}\"}"
      exit 0
    fi
    cat <<'EOF'
{"decision":"block","reason":"Progress report recorded. Continue working."}
EOF
    ;;
  *)
    cat <<EOF
{"decision":"block","reason":"Unknown message type '${msg_type}'. Use type 'message' for final submission or 'broadcast' for progress reports."}
EOF
    ;;
esac
