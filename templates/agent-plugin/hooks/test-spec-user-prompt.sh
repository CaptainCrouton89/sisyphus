#!/bin/bash
# UserPromptSubmit hook: reinforce behavioral invariants for test-spec agents.
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi

cat <<'HINT'
<test-spec-reminder>
Behavioral properties, not test code:

- State behaviors as invariants: "Users can log in with email/password" — not "loginHandler calls bcrypt.compare"
- Each property must be independently verifiable
- Include negative properties — what must NOT happen is as important as what must
- If the change is purely mechanical with nothing to verify, submit { "testsNeeded": false }
</test-spec-reminder>
HINT
