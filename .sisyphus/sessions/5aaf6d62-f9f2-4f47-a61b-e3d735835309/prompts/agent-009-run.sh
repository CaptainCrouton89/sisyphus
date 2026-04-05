#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-009' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-009-plugin" --agent 'devcore:programmer' --session-id "4c2f8928-2ea3-49a6-8546-f18aae9d2b0e" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion wp7-tests-devcore:programmer c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-009-system.md')" '## Goal
Write comprehensive tests for the companion core module and renderer.

## Context Files
- Read `context/plan-companion.md` section "WP7: Tests" for test requirements
- Read existing test files in `src/__tests__/` for patterns (e.g., `state.test.ts` uses node:test runner)

## Overall Session Goal
Implement a persistent ASCII companion character inside sisyphus with stat accumulation, XP/leveling, mood computation, 35 achievements, and rendering.

## Your Task: Create 2 test files

### 1. `src/__tests__/companion.test.ts` — Core logic tests

Test the companion core module (`src/daemon/companion.ts`). Read the source file first to understand the actual API.

Key imports:
```typescript
import { describe, it } from '\''node:test'\'';
import assert from '\''node:assert/strict'\'';
import {
  createDefaultCompanion,
  computeXP,
  computeLevel,
  getTitle,
  computeMood,
  checkAchievements,
  onSessionStart,
  onSessionComplete,
  onAgentSpawned,
  onAgentCrashed,
  updateRepoMemory,
  ACHIEVEMENTS,
  hasAchievement,
} from '\''../daemon/companion.js'\'';
import type { Session } from '\''../shared/types.js'\'';
import type { CompanionState, MoodSignals } from '\''../shared/companion-types.js'\'';
```

Test categories (implement ALL of these):

**Default state:**
- `createDefaultCompanion()` returns level 1, "Boulder Intern", mood "sleepy", empty stats/achievements/repos

**XP computation:**
- `computeXP({ strength: 0, endurance: 0, wisdom: 0, luck: 0, patience: 0 })` → 0
- `computeXP({ strength: 1, endurance: 3_600_000, wisdom: 1, luck: 1, patience: 3_600_000 })` → expected value
- Verify XP formula: strength*100 + (endurance/3600000)*10 + wisdom*50 + (luck*100)*2 + (patience/3600000)*5

**Leveling:**
- Level 1 at XP 0
- Level boundary tests — check several thresholds
- `computeLevel` returns correct levels for known XP values

**Titles:**
- Level 1 → "Boulder Intern"
- Level 10 → "Boulder Brother"  
- Level 20 → "The Absurd Hero"
- Levels between defined entries use the last defined title (e.g., level 21 → "The Absurd Hero")

**Mood computation:**
- Default (no signals) returns time-based mood
- With `justCompleted: true` → tends toward '\''happy'\''
- With `recentCrashes > 0` and `justCrashed` → tends toward '\''frustrated'\''
- With high `idleDurationMs` → tends toward '\''sleepy'\''
- With `justLeveledUp: true` → tends toward '\''excited'\''

**Stat accumulation:**
- `onSessionComplete` increments strength by 1
- `onSessionComplete` adds session.activeMs to endurance
- `onAgentSpawned` increments lifetimeAgentsSpawned
- `onAgentCrashed` resets consecutiveCleanSessions to 0

**Achievement checking (test ALL 35 + 2 extras):**
Create a helper to build minimal Session objects for testing. For each achievement:
- Set up companion state + session to meet the condition → verify it unlocks
- Verify already-unlocked achievements aren'\''t re-returned
- Key ones to test individually:
  - first-blood: sessionsCompleted >= 1
  - centurion: sessionsCompleted >= 100
  - marathon: session.agents.length >= 10
  - blitz: session.activeMs < 120000 && completed
  - flawless: no crashed/killed agents
  - iron-will: consecutiveCleanSessions >= 10
  - night-owl: session started after midnight
  - sisyphean: taskHistory has entry >= 3
  - streak: consecutiveDaysActive >= 7
  - momentum: 3 completions within 1 hour

**Repo memory:**
- `updateRepoMemory` creates new entry on first visit
- Subsequent visits increment visit count
- Completions and crashes tracked separately

### 2. `src/__tests__/companion-render.test.ts` — Renderer tests

Test the companion renderer (`src/shared/companion-render.ts`). Read the source file first.

```typescript
import { describe, it } from '\''node:test'\'';
import assert from '\''node:assert/strict'\'';
import {
  getBaseForm,
  getMoodFace,
  getStatCosmetics,
  getAchievementBadges,
  getBoulderForm,
  composeLine,
  renderCompanion,
} from '\''../shared/companion-render.js'\'';
import { createDefaultCompanion } from '\''../daemon/companion.js'\'';
import type { CompanionState } from '\''../shared/companion-types.js'\'';
```

Test categories:

**Base form:**
- Level 1 → contains '\''FACE'\'' and '\''.'\''
- Level 5 → contains '\''FACE'\'' and '\''O'\''
- Level 20+ → contains '\''ᕦ'\'' and '\''@'\''

**Mood faces:**
- Each mood returns expected string (happy→'\''^.^'\'', grinding→'\''>.<'\'', etc.)
- Unknown mood throws

**Stat cosmetics:**
- wisdom > 30 → includes '\''wisps'\''
- endurance > 1,800,000,000 → includes '\''trail'\''
- luck > 0.8 → includes '\''sparkle'\''
- patience > 1,800,000,000 → includes '\''zen-prefix'\''
- Stats below thresholds → empty array

**Achievement badges:**
- night-owl achievement → '\''crescent'\'' badge
- marathon → '\''heat'\''
- flawless → '\''sparkle-bookends'\''
- No matching achievements → empty

**Boulder form:**
- agentCount 0 → '\''.'\''
- agentCount 5 → '\''o'\''
- agentCount 10 → '\''@'\''
- With nickname → includes quoted nickname

**renderCompanion:**
- Default companion renders without error
- Field mask ['\''face'\''] renders only face
- Field mask ['\''level'\'', '\''title'\''] renders level and title
- maxWidth truncates commentary first
- color: true wraps in ANSI codes
- tmuxFormat: true uses #[fg=...] format

**Cosmetic stacking:**
- composeLine with multiple cosmetics applies all in correct order
- Badges and cosmetics don'\''t interfere with each other

## Important Constraints
- Use `node:test` runner (describe, it, beforeEach, etc.) — NOT jest/mocha
- Use `assert from '\''node:assert/strict'\''` — NOT chai
- Create helper functions to build test fixtures (mock Session objects, companion states)
- Tests should be fast — no I/O, no network calls
- Build mock Session objects with the minimum required fields matching the Session type from `src/shared/types.ts`
- Run `npm test` at the end to verify tests pass'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2384