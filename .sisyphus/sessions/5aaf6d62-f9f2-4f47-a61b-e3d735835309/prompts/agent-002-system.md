# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: Create a detailed implementation plan for the Companion system. Save to context/plan-companion.md.

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
Compute exact level thresholds from the spec's '~1.5x' exponential rule.

### 6. Achievement Definitions
List all 35 achievements with exact condition checker logic.

### 7. Mood Weights
Define the mood scoring system — which signals feed which moods, reasonable weights.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
