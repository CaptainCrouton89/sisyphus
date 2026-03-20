#!/bin/bash
# Stop hook: block agent from stopping if it hasn't submitted a final report.
# Passthrough (exit 0) if not in a sisyphus session.

if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then
  exit 0
fi

# Guard against infinite loops — if we already blocked once and Claude is
# retrying, stop_hook_active will be true in the input JSON.
STOP_ACTIVE=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('stop_hook_active',False))" 2>/dev/null)
if [ "$STOP_ACTIVE" = "True" ]; then
  exit 0
fi

# Check if the agent already submitted its final report
REPORT_FILE="${SISYPHUS_SESSION_DIR}/reports/${SISYPHUS_AGENT_ID}-final.md"
if [ -f "$REPORT_FILE" ]; then
  exit 0
fi

cat <<'EOF'
{"decision":"block","reason":"You have not submitted your final report. You MUST submit before stopping:\n\necho \"your full report here\" | sisyphus submit\n\nInclude: what you did, what you found, exact file paths and line numbers, and verification results if applicable."}
EOF
