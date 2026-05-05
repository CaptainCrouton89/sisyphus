#!/bin/bash
# PreToolUse hook for the plan agent: enforce that plan files are written
# under $SISYPHUS_SESSION_DIR/context/$SISYPHUS_AGENT_ID/. The plan agent's
# pane cwd is the project root, so a bare relative `context/agent-XXX/...`
# resolves to <project-root>/context/..., outside the session and invisible
# to the orchestrator. Sub-planner sub-agents inherit $SISYPHUS_AGENT_ID,
# so the same anchor applies to their writes too.
#
# Matches Write, Edit, MultiEdit. Only gates files whose basename matches
# `plan-*.md` — exploration scratch files and anything else passes through.

if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_SESSION_DIR" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then
  exit 0
fi

STDIN_JSON=$(cat)

FILE_PATH=$(echo "$STDIN_JSON" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    pass
" 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

BASENAME=$(basename "$FILE_PATH")
case "$BASENAME" in
  plan-*.md) ;;
  *) exit 0 ;;
esac

if [[ "$FILE_PATH" = /* ]]; then
  ABS_PATH="$FILE_PATH"
else
  ABS_PATH="$PWD/$FILE_PATH"
fi

EXPECTED_PREFIX="$SISYPHUS_SESSION_DIR/context/$SISYPHUS_AGENT_ID/"

if [[ "$ABS_PATH" == "$EXPECTED_PREFIX"* ]]; then
  exit 0
fi

REASON=$'Plan write blocked: file path is not under the session context directory.\n\n'
REASON+="  attempted: $FILE_PATH"$'\n'
REASON+="  resolved:  $ABS_PATH"$'\n'
REASON+="  expected:  ${EXPECTED_PREFIX}<filename>"$'\n\n'
REASON+=$'Plan files must live under $SISYPHUS_SESSION_DIR/context/$SISYPHUS_AGENT_ID/. Your pane\'s cwd is the project root, so a bare relative `context/agent-XXX/plan-foo.md` resolves to `<project-root>/context/...`, outside the session and invisible to the orchestrator and downstream agents.\n\nUse the absolute prefix in your Write tool call. The directory already exists; the daemon created it when this pane spawned. Re-issue the write with the full path expanded from $SISYPHUS_SESSION_DIR.'

ESCAPED=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$REASON")
echo "{\"decision\":\"block\",\"reason\":$ESCAPED}"
exit 0
