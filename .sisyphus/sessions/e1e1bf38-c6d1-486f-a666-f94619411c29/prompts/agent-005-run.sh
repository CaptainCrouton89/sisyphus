#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e1e1bf38-c6d1-486f-a666-f94619411c29' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --model 'opus' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-005-plugin" --session-id "5ac46714-e458-43d8-9f3d-f247b94a7c63" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:session-fork-management plan-clone-plan c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e1e1bf38-c6d1-486f-a666-f94619411c29/prompts/agent-005-system.md')" 'Create an implementation plan for the `sisyphus clone` feature.

## Inputs (read all before planning)
- `context/requirements-clone.md` — 20 approved EARS requirements (authoritative)
- `context/design-clone.md` — approved technical design with data flow, algorithms, file manifest
- `context/explore-integration-points.md` — codebase map of relevant files and patterns

## What to produce
A concrete implementation plan saved to `context/plan-clone.md` with:

1. **Task breakdown** — each task scoped to a single file or tightly coupled pair. For each task:
   - Which file(s) to modify/create
   - What to add/change (reference design sections, not re-describe)
   - Which requirements it satisfies
   - Dependencies on other tasks (if any)

2. **Parallelization map** — which tasks can run concurrently vs which must be sequential. The design touches 8 files; maximize parallel execution.

3. **Implementation order** — considering dependencies:
   - Types/protocol first (no deps)
   - State layer (depends on types)
   - Session manager (depends on state)
   - Orchestrator (independent, can parallel with session-manager)
   - Server routing (depends on session-manager)
   - CLI command (depends on protocol types)
   - CLI registration (depends on CLI command)

4. **Companion hooks** — the design mentions companion hooks in step 9 but doesn'\''t detail which ones fire. Investigate `startSession()` companion hooks and specify which should fire for clone (likely `onSessionStart` at minimum). Document in the plan.

5. **Test considerations** — what unit tests should cover the new code (state cloning, agent normalization, CLI guards). Reference existing test patterns in `src/__tests__/`.

## Constraints
- Scope is small (~275 lines across 8 files) — this should be a single implementation phase, not multi-phase
- Follow existing patterns exactly (the design already specifies this — validate against actual code)
- Plan should be implementable by 2-3 parallel agents in one cycle'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %449