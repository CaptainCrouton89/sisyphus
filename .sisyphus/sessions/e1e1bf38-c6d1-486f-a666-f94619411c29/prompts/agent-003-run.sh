#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e1e1bf38-c6d1-486f-a666-f94619411c29' && export SISYPHUS_AGENT_ID='agent-003' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-003-plugin" --session-id "8c2d49d0-6863-46e1-97fa-06ee69c297d2" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:session-fork-management requirements-clone-requirements c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-003-system.md')" 'Define behavioral requirements for the session cloning feature in sisyphus.

## Context

Read these files first:
- .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/problem-session-branching.md (REVISED problem definition — the original parent-child model was rejected by the user)
- .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/explore-integration-points.md (codebase integration map — partially relevant, ignore parent-child hooks)
- src/cli/commands/start.ts (existing session start command for reference)
- src/daemon/state.ts (session creation and state management)
- src/daemon/session-manager.ts (session lifecycle)

## What the feature is

`sisyphus clone "new goal"` — duplicates a running session with a new ID and new goal. The clone is fully independent (no parent-child relationship, no completion hooks, no cross-session communication). Both sessions diverge after the clone.

Key behaviors to define requirements for:

1. **CLI command** (`sisyphus clone "goal"`):
   - Reads SISYPHUS_SESSION_ID from env (orchestrator context)
   - Sends clone request to daemon
   - Prints EXTENSIVE guidance output that acts as instructions to the calling orchestrator
   - The output IS the mechanism for informing the orchestrator about what to do next
   - Must work from within an orchestrator pane (the primary use case)

2. **Session cloning**:
   - Copies: context/, strategy.md, roadmap.md, goal.md
   - Resets: state.json (new ID, new task, fresh cycles/agents/messages), prompts/, reports/, snapshots/, logs/
   - Grep-replaces old session ID with new ID in all copied text files
   - Registers clone as a new session with the daemon
   - Spawns orchestrator in new tmux session (strategy mode — clone needs to reorient)

3. **Output design** (this is critical — "every output is a prompt"):
   - Confirm what was cloned
   - List files copied and IDs replaced  
   - Explicit next-step instructions for the calling orchestrator:
     * Update goal.md to remove cloned responsibility
     * Update roadmap.md to remove related phases/steps
     * Update strategy.md to adjust remaining scope
     * Do NOT coordinate with or wait for the clone
   - Monitor command for the clone

4. **Edge cases**:
   - Clone from a paused session?
   - Clone from a completed session?
   - What if context/ has no files?
   - Multiple clones from same source?
   - Clone while agents are running?

## What this is NOT

- NOT a parent-child relationship — no parentSessionId, no childSessionIds, no hierarchy
- NOT a completion notification system — no context injection back to source
- NOT automatic — user asks orchestrator to do it, orchestrator runs the command
- The explore agent'\''s parent-child design was rejected. Do not define requirements for parent-child lifecycle hooks.

## Output

Save requirements to: .sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/requirements-clone.json

Use `sisyphus requirements --schema` to see the expected JSON schema, and `sisyphus requirements --annotated` for the writing guide.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %422