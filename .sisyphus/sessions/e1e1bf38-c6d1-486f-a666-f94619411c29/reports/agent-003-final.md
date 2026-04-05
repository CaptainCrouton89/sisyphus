Session cloning requirements complete — 20 EARS requirements across 5 groups, all approved after 3 review rounds.

## Key design decisions (evolved through user feedback):

1. **True duplication, not clean start**: The clone copies prompts/, reports/, snapshots/ alongside context/. State.json preserves orchestratorCycles/agents/messages. The clone spawns at cycle N+1 with full history awareness. User: "This is literally like the session got duped. It has the same memory, just a new trajectory."

2. **Output shapes behavior, not informs**: No monitor commands, no file details in output. Behavioral guidance ("This is the other session's responsibility, you don't need to monitor it") instead of technical details. User rejected babysitting affordances.

3. **Flag semantics match `start`**: `--context` is supplementary background info (NOT the goal). Goal is the positional arg. `--strategy` optionally copies strategy.md. Roadmap always resets.

4. **No parent-child relationship**: No parentSessionId, no childSessionIds. History events (`session-cloned` / `cloned-from`) on both sessions for audit trail only.

5. **Completed sessions cannot be cloned**: Rejected with error suggesting `continue` or `start`.

## Files produced:
- .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/requirements-clone.json (machine-readable, all 20 items status: approved)
- .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/requirements-clone.md (human-readable summary)

## Open item resolved by agent judgment (no user objection across 3 rounds):
- REQ-007 Q about messages array: preserved (part of session memory, consistent with the "true duplication" model)
- REQ-019 Q about completed sessions: rejected (user didn't object to the rejection approach)