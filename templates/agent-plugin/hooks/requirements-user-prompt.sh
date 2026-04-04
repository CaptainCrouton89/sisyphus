#!/bin/bash
# UserPromptSubmit hook: fire only on the first prompt to prime the requirements
# agent for interactive product discovery with the user.
if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then exit 0; fi

FLAG_DIR="/tmp/sisyphus-hooks/${SISYPHUS_SESSION_ID}"
FLAG_FILE="${FLAG_DIR}/${SISYPHUS_AGENT_ID}-requirements-primed"

# Only fire once per agent session
if [ -f "$FLAG_FILE" ]; then exit 0; fi

mkdir -p "$FLAG_DIR"
touch "$FLAG_FILE"

cat <<'HINT'
<requirements-first-prompt>
You are starting a product discovery conversation with the user. Before you investigate the codebase, before you draft anything — talk to the user.

Your first message should:
1. Briefly acknowledge what you understand from the instruction
2. Ask 1-2 clarifying questions about what they want to build and why
3. Be short — a few sentences and the questions, not a wall of text

Do NOT:
- Draft requirements before the user has responded to you at least once
- Assume you know what they want based on the instruction alone
- Present a completed requirements document without iterating

The instruction you received is a starting point, not a specification. The user has context you don't have yet. Your job is to surface it through conversation.
</requirements-first-prompt>
HINT
