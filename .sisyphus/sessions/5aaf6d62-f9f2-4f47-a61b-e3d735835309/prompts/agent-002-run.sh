#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort max --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-002-plugin" --agent 'sisyphus:plan' --session-id "0a7c6b68-b9af-4b83-a71c-6c3ff936ef8a" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion plan-companion-plan c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-002-system.md')" 'Create a detailed implementation plan for the Companion system. Save to context/plan-companion.md.

## Source Material
Read the full spec: .claude/specs/companion.spec.md (550 lines, very detailed)
Read the existing patterns: src/daemon/summarize.ts (Haiku SDK), src/daemon/state.ts (atomic writes), src/shared/types.ts (existing types)

## What to Produce

A phased implementation plan with:

### 1. Type Definitions
Define the complete CompanionState type with all fields from the spec:
- Stats (strength, endurance, wisdom, luck, patience)
- XP, level, title
- Mood and mood timestamps
- Achievements array
- Repo memory
- Last commentary
- Lifetime counters
- Version field

Also define: CompanionField type, Mood type, Achievement type, RepoMemory type, idle state types.

### 2. Module Interface Definitions

**companion.ts** (src/daemon/companion.ts):
- loadCompanion(): reads or creates companion.json
- saveCompanion(): atomic write
- updateStatsFromSession(session): stat accumulation
- computeXP(stats): weighted sum formula
- computeLevel(xp): exponential thresholds
- getTitle(level): level-to-title mapping
- computeMood(companion, session?, signals?): mood calculation
- checkAchievements(companion, session): returns newly unlocked achievements
- updateRepoMemory(companion, cwd, session): repo visit tracking
- getIdleState(companion): current idle animation frame
- All 35 achievements defined as data (id, name, condition checker, badge)

**companion-render.ts** (src/shared/companion-render.ts):
- renderCompanion(state, fields, opts): the universal renderer
- getBaseForm(level): body by level
- getMoodFace(mood): face override
- getStatCosmetics(stats): inline decorations
- getAchievementBadges(achievements): inline badges
- getBoulderSize(agentCount?, repoVisits?): boulder character

**companion-commentary.ts** (src/daemon/companion-commentary.ts):
- generateCommentary(companion, event, context): Haiku call
- generateAgentNickname(companion, agentType): Haiku call
- buildPrompt(companion, event, context): prompt construction
- Event type enum and per-event context builders

### 3. Work Packages (Parallel-Safe)
Break into work packages where each agent touches DIFFERENT files:

Package A: Core companion module (companion.ts) + companion types
Package B: Renderer (companion-render.ts)
Package C: Commentary + agent naming (companion-commentary.ts)
Package D: Tests (companion.test.ts)
Package E: Integration (session-manager hooks, pane-monitor, status-bar)
Package F: CLI command (companion.ts in cli/commands/)
Package G: TUI integration (tree panel, overlay, leader key)

### 4. Dependency Graph
Which packages can run in parallel, which must be sequential.

### 5. XP Formula and Level Thresholds
Compute exact level thresholds from the spec'\''s '\''~1.5x'\'' exponential rule.

### 6. Achievement Definitions
List all 35 achievements with exact condition checker logic.

### 7. Mood Weights
Define the mood scoring system — which signals feed which moods, reasonable weights.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2373