#!/bin/bash
# UserPromptSubmit hook: remind spec agent to iterate with the user.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

python3 -c "
import json, sys
print(json.dumps({'additionalContext': sys.stdin.read()}))
" <<'HINT'
<spec-reminder>
Iterate with the user — include them in the process before writing anything to disk:

- Present your findings and a concrete proposal with your reasoning
- Surface specific, substantive questions that need human input:
  Bad: "What should happen on error?"
  Good: "If the API returns a 429, should we retry with backoff or surface the rate limit to the user?"
- Share your perspective: what's clear, what's open, what you'd lean toward and why
- Wait for the user to respond and incorporate their answers before proceeding
- The spec is only written after user sign-off on the direction

Ambiguity can be technical, architectural, or design-related. Don't skip design questions just because they aren't code.
</spec-reminder>
HINT
