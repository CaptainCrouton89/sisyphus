#!/bin/bash
# UserPromptSubmit hook: fire only on the first prompt to prime the spec lead
# for a three-stage interactive spec session (shape → requirements → deepen).
if [ -z "$SISYPHUS_SESSION_ID" ] || [ -z "$SISYPHUS_AGENT_ID" ]; then exit 0; fi

FLAG_DIR="/tmp/sisyphus-hooks/${SISYPHUS_SESSION_ID}"
FLAG_FILE="${FLAG_DIR}/${SISYPHUS_AGENT_ID}-spec-primed"

# Only fire once per agent session
if [ -f "$FLAG_FILE" ]; then exit 0; fi

mkdir -p "$FLAG_DIR"
touch "$FLAG_FILE"

# IMPORTANT: heredoc delimiter is single-quoted (<<'HINT') — do NOT change to unquoted.
# Single quotes prevent bash from expanding $INSTRUCTION, $SISYPHUS_*, backticks,
# or any other dollar-sign content inside the prompt body. The body is static
# instructional prose and must be byte-for-byte literal.
#
# If you ever need to interpolate an env var into this output, do NOT switch the
# delimiter to unquoted. Instead, assign to a local var BEFORE the heredoc and
# emit the interpolated part via a separate printf call after the heredoc.
cat <<'HINT'
<spec-first-prompt>
This is a three-stage spec session: Stage 1 (shape), Stage 2 (requirements), Stage 3 (deepen). Do not treat it as a single requirements pass.

Your first message to the user should:
1. Briefly acknowledge what you understand from the instruction
2. Ask 1–2 clarifying questions about scope or intent
3. Be short — a few sentences and the questions, nothing more

Before dispatching any subagent:
- Explore the codebase relevant to the topic (Bash, Glob, Grep, Read)
- Complete at least one round of user dialogue
- Do NOT spawn the engineer until exploration is done and the user has responded to you at least once

When you do dispatch subagents:
- Engineer: Agent tool with subagent_type "engineer"
- Requirements-writer: Agent tool with subagent_type "requirements-writer"

You are the only pane the user sees. Narrate subagent activity in real time — tell the user when you dispatch a subagent and what it is doing, and tell them what came back when it returns.
</spec-first-prompt>
HINT
