#!/bin/bash
# PostToolUse hook (matcher: Task|Agent): register background sub-agent IDs for require-submit.sh.
# For Task: only fires when Claude Code itself flagged run_in_background=true —
# structured signal, not prose scraping.
# For Agent (FleetView): always async; the run_in_background gate is skipped.
# Passthrough (exit 0) if not in a sisyphus session.

if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then
  exit 0
fi

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)
if [ "$TOOL_NAME" != "Agent" ]; then
  RIB=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('run_in_background',False))" 2>/dev/null)
  if [ "$RIB" != "True" ]; then
    exit 0
  fi
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
