#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e1e1bf38-c6d1-486f-a666-f94619411c29' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-004-plugin" --session-id "2204fc6f-14b3-46b9-9967-b4dfef52766c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:session-fork-management design-clone-design c3' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-004-system.md')" 'Design the technical architecture for `sisyphus clone "goal"` — a command that duplicates a running session with a new ID and goal.

## Authoritative Requirements
Read: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/requirements-clone.md

This has 20 approved EARS requirements. The design MUST cover all of them.

## Codebase Reference
Read: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/explore-integration-points.md

This maps the key files and patterns to follow. Start your codebase investigation from these files.

## Core Design Decisions (already settled by requirements)

1. **True duplication, not hierarchy**: Clone copies the session directory (context/, prompts/, reports/, snapshots/), replaces session IDs in text files, creates fresh state.json with new UUID but preserved orchestratorCycles/agents/messages history. No parentSessionId, no childSessionIds.

2. **History events only**: `session-cloned` event on source, `cloned-from` on clone. Audit trail, no behavioral effect.

3. **Clone startup**: Orchestrator spawns in strategy mode at cycle N+1 (source'\''s last cycle + 1). Gets programmatic orientation explaining the fork. Optional `--context` flag adds supplementary background.

4. **CLI output is orchestrator guidance**: No monitor commands, no file details. Behavioral guidance: "This is the other session'\''s responsibility. You do not need to monitor it." Plus explicit next-steps to update own scope.

5. **Edge cases**: Active sessions clone normally (running agents don'\''t matter). Paused sessions clone normally. Completed sessions are rejected with error.

## What the Design Should Produce

1. **Data flow**: CLI → daemon protocol → session-manager → state → filesystem → orchestrator spawn
2. **State model changes**: What goes in state.json for the clone, what history events look like
3. **Directory cloning algorithm**: What files get copied, how ID replacement works, what resets
4. **Protocol additions**: Request/response types for the clone operation
5. **CLI command design**: Argument parsing, env var reading, output formatting
6. **Orchestrator orientation**: How the clone'\''s first-cycle prompt is constructed
7. **Error handling**: Each error path from the requirements

Read the actual codebase — especially `state.ts`, `session-manager.ts`, `server.ts`, `protocol.ts`, the `start` command, and `orchestrator.ts`. Follow existing patterns. The design should be concrete enough that an implementation agent can build from it without ambiguity.

Save to: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/design-clone.md'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %443