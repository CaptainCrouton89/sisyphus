#!/bin/bash
# PostToolUse hook (matcher: Task): register background-Task agentIds for require-submit.sh.
# Only fires when Claude Code itself flagged the Task as run_in_background=true —
# structured signal, not prose scraping. Eliminates the false-positive class where
# a non-background Task's output happens to contain the word "background".
# Passthrough (exit 0) if not in a sisyphus session.

if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then
  exit 0
fi

INPUT=$(cat)

RIB=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('run_in_background',False))" 2>/dev/null)
if [ "$RIB" != "True" ]; then
  exit 0
fi

# tool_response may be a string or structured; normalize to a string before grepping.
TR=$(echo "$INPUT" | python3 -c "
import json, sys
r = json.load(sys.stdin).get('tool_response', '')
if isinstance(r, str):
    print(r)
else:
    print(json.dumps(r))
" 2>/dev/null)

AID=$(echo "$TR" | grep -oE 'agentId: [a-z0-9]+' | head -1 | awk '{print $2}')
if [ -z "$AID" ]; then
  exit 0
fi

DIR="$SISYPHUS_SESSION_DIR/runtime/bg-tasks"
mkdir -p "$DIR" 2>/dev/null || exit 0
echo "$AID" >> "$DIR/$SISYPHUS_AGENT_ID.txt"
exit 0
