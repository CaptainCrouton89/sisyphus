#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e1e1bf38-c6d1-486f-a666-f94619411c29' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-001-plugin" --session-id "79bc982f-4977-4e54-9f50-4b59fa415166" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:session-fork-management problem-branching-problem c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-001-system.md')" 'Explore the problem space for session branching/forking in sisyphus.

## Context
Sisyphus is a tmux-integrated daemon that orchestrates Claude Code multi-agent workflows. Sessions have a lifecycle: start → orchestrator cycles (spawning agents, yielding, respawning) → complete. During a session, unrelated issues often arise that need attention but shouldn'\''t pollute the current session'\''s context/roadmap. We need a mechanism to "branch" — spin up a focused sub-session for the tangent, then return to the original.

## What Exists
- `Session.parentSessionId` field exists in `src/shared/types.ts` but is never populated
- The `comeback-kid` achievement in `src/daemon/companion.ts` checks `session.parentSessionId != null` but is unearnable
- Sessions are fully isolated: own UUID, session dir, tmux session, state.json, context/, roadmap
- Session lifecycle is managed by `src/daemon/session-manager.ts`

## Questions to Explore

### User Workflow
1. What triggers the need to branch? (Bug found during feature work, urgent fix needed, exploratory tangent)
2. What does "return to parent" mean concretely? (Switch tmux session? Auto-resume parent?)
3. Should the parent session pause while a fork runs, or continue concurrently?
4. Can a fork itself be forked? (Tree of sessions vs flat parent-child)
5. What happens when a fork completes? Does anything flow back to the parent? (Context? Summary?)

### Interaction Model Options
Evaluate these models against the workflows above:
- **Git-like**: fork creates a snapshot, runs independently, parent continues. No merge.
- **Process-like**: fork pauses parent, runs to completion, parent resumes with fork'\''s summary injected as a message.
- **Concurrent**: parent and fork run simultaneously on the same codebase. Fork is just a linked session.
- **Hybrid**: user chooses pause/continue at fork time.

### CLI Surface
- What command creates a fork? (`sisyphus fork "task"`, `sisyphus branch "task"`)
- Can an orchestrator fork programmatically? (During a cycle, spawn a sub-session instead of an agent)
- How does the user navigate between parent and forks? (tmux, sisyphus CLI, TUI)

### Edge Cases
- What if the parent is killed while a fork is running?
- What if a fork runs longer than expected?
- Multiple forks from the same parent — how does the user track them?
- Fork from a paused session — is that meaningful?

Save your thinking document to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/context/problem-session-branching.md'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %348