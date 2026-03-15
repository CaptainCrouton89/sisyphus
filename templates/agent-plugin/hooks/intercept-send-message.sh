#!/bin/bash
# Block SendMessage — agents should use sisyphus CLI for reporting.
# Passthrough (exit 0) if not in a sisyphus session.

if [ -z "$SISYPHUS_SESSION_ID" ]; then
  exit 0
fi

cat <<'EOF'
{"decision":"block","reason":"Do not use SendMessage. Use the sisyphus CLI instead:\n- Progress report: echo \"message\" | sisyphus report\n- Urgent/blocking issue: sisyphus message \"description\"\n- Final submission: echo \"report\" | sisyphus submit"}
EOF
