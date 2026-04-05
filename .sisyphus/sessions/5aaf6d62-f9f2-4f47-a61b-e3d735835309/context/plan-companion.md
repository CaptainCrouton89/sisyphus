# Companion Implementation Plan

## Type Definitions

All types live in `src/shared/companion-types.ts`. This is the contract between all modules.

```typescript
// src/shared/companion-types.ts

export interface CompanionStats {
  strength: number;     // Total sessions completed (count)
  endurance: number;    // Total active time (ms)
  wisdom: number;       // Efficient orchestration score (count of low-variance sessions)
  luck: number;         // Clean completion ratio (0-1, no crashes/restarts)
  patience: number;     // Daemon idle time (ms) — uptime minus active session time
}

export type Mood = 'happy' | 'grinding' | 'frustrated' | 'zen' | 'sleepy' | 'excited' | 'existential';

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: string; // ISO timestamp
}

export interface RepoMemory {
  visits: number;
  completions: number;
  crashes: number;
  totalActiveMs: number;
  moodAvg: number;       // Running average mood score (0-1)
  nickname?: string;     // Haiku-generated after 3+ visits
  firstSeen: string;     // ISO timestamp
  lastSeen: string;      // ISO timestamp
}

export interface Commentary {
  text: string;
  event: string;         // e.g. 'session-start', 'session-complete', 'achievement', 'level-up'
  timestamp: string;     // ISO timestamp
}

export interface CompanionState {
  version: 1;
  name: string | null;           // User-set via `sisyphus companion --name`
  createdAt: string;             // ISO timestamp
  stats: CompanionStats;
  xp: number;
  level: number;
  title: string;
  mood: Mood;
  moodUpdatedAt: string;         // ISO timestamp
  achievements: UnlockedAchievement[];
  repos: Record<string, RepoMemory>;  // keyed by absolute path
  lastCommentary: Commentary | null;
  sessionsCompleted: number;     // Lifetime counter
  sessionsCrashed: number;       // Lifetime counter
  totalActiveMs: number;         // Lifetime total
  lifetimeAgentsSpawned: number; // Lifetime counter
  // Tracking fields for behavioral achievements
  consecutiveCleanSessions: number;  // For iron-will, hot-streak
  dailyRepos: Record<string, string[]>; // date string → repo paths (for wanderer)
  taskHistory: Record<string, number>; // task hash → restart count (for sisyphean/stubborn)
  consecutiveDaysActive: number; // For streak
  lastActiveDate: string | null; // ISO date string (YYYY-MM-DD)
}

export type CompanionField = 'face' | 'boulder' | 'title' | 'commentary' | 'mood' | 'level' | 'stats' | 'achievements';

export type AchievementId =
  // Milestone (8)
  | 'first-blood' | 'centurion' | 'thousand-boulder' | 'cartographer' | 'world-traveler'
  | 'hive-mind' | 'old-growth' | 'ancient'
  // Session (9)
  | 'marathon' | 'blitz' | 'speed-run' | 'flawless' | 'iron-will' | 'glass-cannon'
  | 'solo' | 'one-more-cycle' | 'quick-draw'
  // Time-based (6)
  | 'night-owl' | 'dawn-patrol' | 'early-bird' | 'weekend-warrior' | 'all-nighter' | 'witching-hour'
  // Behavioral (10)
  | 'sisyphean' | 'stubborn' | 'creature-of-habit' | 'loyal' | 'wanderer' | 'streak'
  | 'hot-streak' | 'momentum' | 'patient-one' | 'message-in-a-bottle';

export type AchievementCategory = 'milestone' | 'session' | 'time' | 'behavioral';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  category: AchievementCategory;
  badge?: string;       // Inline cosmetic character(s)
  description: string;  // Human-readable unlock condition
}

export interface CompanionRenderOpts {
  maxWidth?: number;
  color?: boolean;        // ANSI escapes on/off
  tmuxFormat?: boolean;   // Use tmux #[fg=...] instead of ANSI
  agentCount?: number;    // Current session agent count (for boulder size)
  repoPath?: string;      // Current repo path (for boulder nickname)
}
```

## Module Interfaces

### companion.ts (`src/daemon/companion.ts`)

Core state management — load, save, update, query.

```typescript
// Persistence
export function loadCompanion(): CompanionState;       // Load from ~/.sisyphus/companion.json, create default if missing
export function saveCompanion(state: CompanionState): void;  // Atomic write (temp + rename)

// Stat updates (called from session-manager hooks)
export function onSessionStart(companion: CompanionState, cwd: string): CompanionState;
export function onSessionComplete(companion: CompanionState, session: Session): CompanionState;
export function onAgentSpawned(companion: CompanionState): CompanionState;
export function onAgentCrashed(companion: CompanionState): CompanionState;

// Computed values
export function computeXP(stats: CompanionStats): number;
export function computeLevel(xp: number): number;
export function getTitle(level: number): string;
export function computeMood(companion: CompanionState, activeSessions: number, recentCrashes: number): Mood;

// Achievements
export const ACHIEVEMENTS: AchievementDef[];  // All 35 definitions
export function checkAchievements(companion: CompanionState, session?: Session): AchievementId[];  // Returns newly unlocked IDs
export function hasAchievement(companion: CompanionState, id: AchievementId): boolean;

// Repo memory
export function updateRepoMemory(companion: CompanionState, repoPath: string, event: 'visit' | 'complete' | 'crash'): CompanionState;

// Default state
export function createDefaultCompanion(): CompanionState;
```

### companion-render.ts (`src/shared/companion-render.ts`)

Pure rendering — no state mutations, no side effects.

```typescript
export function renderCompanion(
  companion: CompanionState,
  fields: CompanionField[],
  opts?: CompanionRenderOpts
): string;

// Internal helpers (exported for testing)
export function getBaseForm(level: number): string;           // Level → body string
export function getMoodFace(mood: Mood): string;              // Mood → face expression
export function getStatCosmetics(stats: CompanionStats): string[];  // Stat thresholds → decorations
export function getAchievementBadges(achievements: UnlockedAchievement[]): string[];
export function getBoulderForm(agentCount?: number, repoNickname?: string): string;
export function composeLine(body: string, cosmetics: string[], badges: string[], boulder: string): string;
```

### companion-commentary.ts (`src/daemon/companion-commentary.ts`)

Haiku SDK calls — fire-and-forget, same pattern as summarize.ts.

```typescript
export type CommentaryEvent = 
  | 'session-start' | 'session-complete' | 'cycle-boundary'
  | 'level-up' | 'achievement' | 'agent-crash'
  | 'idle-wake' | 'late-night';

export function generateCommentary(
  event: CommentaryEvent,
  companion: CompanionState,
  context?: string        // Event-specific context (task description, achievement name, etc.)
): Promise<string | null>;

export function generateNickname(
  companion: CompanionState
): Promise<string | null>;

export function generateRepoNickname(
  repoPath: string,
  memory: RepoMemory
): Promise<string | null>;
```

## Work Packages

### Phase 1 — Core (parallel, no file conflicts)

#### WP1: Types + Core Module
**Files created:** `src/shared/companion-types.ts`, `src/daemon/companion.ts`
**Files modified:** `src/shared/paths.ts` (add `companionPath()`), `src/shared/types.ts` (add `nickname?: string` to Agent)

Delivers:
- All type definitions exactly as specified above
- `companionPath()` in paths.ts: `join(globalDir(), 'companion.json')`
- `loadCompanion()` / `saveCompanion()` with atomic writes (same pattern as state.ts)
- `createDefaultCompanion()` — zeroed stats, level 1, "Boulder Intern"
- `computeXP()` — formula: `strength * 100 + (endurance / 3600000) * 10 + wisdom * 50 + (luck * 100) * 2 + (patience / 3600000) * 5`
- `computeLevel()` — exponential thresholds: `level N requires floor(100 * 1.5^(N-1))` cumulative XP
- `getTitle()` — lookup table from spec (20 titles + milestone titles at 25, 30)
- `computeMood()` — weighted scoring across all signals (error rate, time of day, idle duration, success, session length, streak)
- All 35 `ACHIEVEMENTS` definitions array
- `checkAchievements()` — evaluate all conditions, return newly unlocked
- `onSessionStart/Complete/AgentSpawned/AgentCrashed` — update stats, XP, level, repo memory, achievements
- `nickname?: string` added to Agent interface after `name` field
- Behavioral tracking: consecutiveCleanSessions, dailyRepos, taskHistory, streak tracking

Level thresholds (cumulative XP):
```
1: 0, 2: 100, 3: 250, 4: 475, 5: 812, 6: 1318, 7: 2077, 8: 3216, 
9: 4924, 10: 7486, 11: 11329, 12: 17094, 13: 25741, 14: 38712, 
15: 58168, 16: 87352, 17: 131128, 18: 196792, 19: 295288, 20: 443032
```

Mood weights (higher = more likely to be selected):
- **happy**: +3 if clean completion in last 5min, +1 per streak session (max 5)
- **grinding**: +3 if activeSessions > 0, +1 per additional active session
- **frustrated**: +2 per recent crash (last 15min), +1 per session over 2h
- **zen**: +3 if patience > 10h AND no crashes in last 30min, +1 if time 17:00-22:00
- **sleepy**: +3 if idle > 30min, +2 if time 22:00-06:00, +1 per hour idle
- **excited**: +5 on level-up (decays over 5min), +3 on session start
- **existential**: +5 if time 02:00-06:00 AND endurance > 100h, +2 if time 22:00-02:00

Achievement conditions (all 35):
- **Milestone**: first-blood (1 completion), centurion (100), thousand-boulder (1000), cartographer (10 unique repos), world-traveler (25 repos), hive-mind (500 agents spawned), old-growth (30 days since createdAt), ancient (365 days)
- **Session**: marathon (session with 10+ agents), blitz (<2min activeMs), speed-run (<5min), flawless (0 crashes in session), iron-will (10 consecutive clean sessions), glass-cannon (5+ agents all crashed at least once but session completed), solo (1 agent), one-more-cycle (10+ orchestrator cycles), quick-draw (first agent spawned within 30s of session start)
- **Time**: night-owl (complete session started after midnight), dawn-patrol (session active midnight-6am), early-bird (start before 6am), weekend-warrior (complete on Sat/Sun), all-nighter (8h+ activeMs single session), witching-hour (start 3am-4am)
- **Behavioral**: sisyphean (same task hash 3+ times), stubborn (same task 5+ times then completed), creature-of-habit (20+ sessions same repo), loyal (50+ same repo), wanderer (5 repos in one day), streak (7 consecutive days active), hot-streak (7 consecutive clean completions), momentum (3 completions within 1 hour), patient-one (30+ min idle between cycles), message-in-a-bottle (10+ messages to single session — tracked via session.messages.length)

#### WP2: Renderer
**Files created:** `src/shared/companion-render.ts`

Delivers:
- `renderCompanion(state, fields, opts)` composing all visual elements
- `getBaseForm(level)`:
  - Lv 1-2: `(FACE) .`
  - Lv 3-4: `(FACE)/ o`
  - Lv 5-7: `/(FACE)/ O`
  - Lv 8-11: `\(FACE)/ O`
  - Lv 12-19: `ᕦ(FACE)ᕤ OO`
  - Lv 20+: `ᕦ(FACE)ᕤ @`
- `getMoodFace(mood)`:
  - happy: `^.^`, grinding: `>.<`, frustrated: `>.<#`, zen: `‾.‾`, sleepy: `-.-)zzZ`, excited: `*o*`, existential: `◉_◉`
- Stat cosmetics (thresholds: stat > 75th percentile of expected range):
  - High wisdom (>30): trailing wisps `~BOULDER~`
  - High endurance (>500h): trail `BOULDER ...`
  - High luck (>0.8): sparkle `* BODY BOULDER *`
  - High patience (>500h): zen prefix `o BODY BOULDER`
- Achievement badges:
  - night-owl: `)` suffix, marathon: `~^~` on boulder, flawless: `*` bookends, sisyphean: `;` in face, iron-will: `[BOULDER]`, cartographer: `+` prefix
- `getBoulderForm(agentCount, repoNickname)`:
  - 0-2: `.`, 3-5: `o`, 6-9: `O`, 10+: `@`
  - If repo has nickname: `BOULDER "nickname"`
- Field mask: only include requested elements. If `face` excluded, skip body entirely. If `commentary` included, append `lastCommentary.text` after boulder.
- `maxWidth`: truncate commentary first (never truncate face/boulder). If still too wide, truncate from right with ellipsis.
- `color`: wrap in ANSI color code matching mood. `tmuxFormat`: use `#[fg=COLOR]` instead.
- Mood colors: happy=green, grinding=yellow, frustrated=red, zen=cyan, sleepy=gray, excited=bright white, existential=magenta

#### WP3: Commentary + Agent Naming  
**Files created:** `src/daemon/companion-commentary.ts`

Delivers:
- `generateCommentary(event, companion, context)` — Haiku SDK call
- `generateNickname(companion)` — Haiku SDK call
- `generateRepoNickname(repoPath, memory)` — Haiku SDK call
- All follow `summarize.ts` fire-and-forget pattern exactly:
  - Check `Date.now() < disabledUntil`, return null if cooldown active
  - `query()` with `@r-cli/sdk`, model: 'haiku', maxTurns: 1
  - 5-minute cooldown on 401/403 errors
  - Return null on any failure (graceful degradation)
- Commentary prompt template (see spec for persona instruction)
- Nickname prompt: includes mood, stats, level. Naming style varies by mood+stat profile (see spec table). Returns single word.
- Repo nickname prompt: includes repo stats (visits, crashes, moodAvg). Returns 1-2 word nickname.
- Commentary frequency: event type determines whether to always generate or randomly skip (spec defines frequency per event)

### Phase 2 — Integration (parallel, no file conflicts between packages)

#### WP4: Daemon Hooks
**Files modified:** `src/daemon/session-manager.ts`, `src/daemon/pane-monitor.ts`, `src/daemon/status-bar.ts`

Integration points (exact locations from explore-companion-integration.md):

**session-manager.ts:**
- After L105 (`recomputeDots()`): call `companion.onSessionStart()`, fire-and-forget `generateCommentary('session-start', ...)`
- After L457 (`recomputeDots()`): call `companion.onSessionComplete(session)`, check achievements, check level-up, fire-and-forget commentary
- After L394 (`recomputeDots()`): call `companion.onAgentSpawned()`, fire-and-forget `generateNickname()`, store nickname on agent
- After L400 (`recomputeDots()`): no stat update, but could flash commentary
- After L620 (`handleAgentKilled`): call `companion.onAgentCrashed()`, mood spike
- After L637 (orchestratorDone): companion mood reaction

Each hook: `loadCompanion()` → mutate → `saveCompanion()` → fire-and-forget commentary/naming. Import from companion.ts and companion-commentary.ts.

**pane-monitor.ts:**
- After L162 (`onDotsUpdate?.()`): recompute mood via `computeMood()`, check flash expiry, advance idle animation frame. Load companion once per poll cycle, save if changed.

**status-bar.ts:**
- After L156 (sections built): load companion, render via `renderCompanion(state, ['face', 'boulder'], { maxWidth: 20, tmuxFormat: true })`. If flash active (check `flashUntil` in memory), render `['face', 'commentary']` instead. Push to sections array.
- Flash state: module-level `let flashUntil = 0` and `let flashText = ''`. Set by session-manager hooks. Cleared when `Date.now() > flashUntil` on next writeStatusBar() call.

#### WP5: CLI Command
**Files created:** `src/cli/commands/companion.ts`
**Files modified:** `src/cli/index.ts` (register), `src/shared/protocol.ts` (add request/response types), `src/daemon/server.ts` (add handler)

- New protocol request: `{ type: 'companion'; name?: string }` → response with full CompanionState
- CLI renders full profile (spec's `sisyphus companion` example): face, level, title, mood, stat bars, achievements checklist, repo list, latest commentary
- `--name <name>` flag: sets `companion.name`, persists
- Uses `renderCompanion` for the face line, custom formatting for the rest

#### WP6: TUI Integration
**Files modified:** `src/tui/panels/tree.ts`, `src/tui/panels/overlays.ts`, `src/tui/input.ts`, possibly `src/tui/state.ts`

**tree.ts:**
- Reduce `maxVisible` by 2 (blank line + companion line)
- After bottom scroll indicator, render companion at `y + h - 2`:
  `renderCompanion(state, ['face', 'boulder', 'commentary'], { maxWidth: innerW, color: true })`
- Companion state loaded once per render frame (from companion.ts)

**overlays.ts:**
- New `renderCompanionOverlay(buf, rows, cols, companion)` function
- Same pattern as help overlay: centered, bordered, multi-line
- Shows: full ASCII art, level/title/XP progress, stat bars, achievement grid, top repos, mood

**input.ts:**
- Add `'c'` to leader key dispatch (L716-735 block): opens companion overlay
- Add `companion-overlay` to mode enum if needed
- ESC/any key dismisses overlay

#### WP7: Tests
**Files created:** `src/__tests__/companion.test.ts`, `src/__tests__/companion-render.test.ts`

Uses node:test runner (same pattern as existing tests).

Test categories:
- **Stat accumulation**: onSessionComplete increments strength, endurance, wisdom correctly
- **XP formula**: computeXP returns expected values for known stat combos
- **Leveling**: computeLevel returns correct level for boundary XP values
- **Titles**: getTitle returns correct title for each level
- **Mood computation**: computeMood selects correct mood for various signal combos
- **All 35 achievements**: one test per achievement checking unlock conditions
- **Renderer**: getBaseForm returns correct form per level bracket
- **Mood faces**: getMoodFace returns correct expression
- **Stat cosmetics**: applied above thresholds, absent below
- **Achievement badges**: correct badges for each cosmetic achievement
- **Field masks**: renderCompanion with different field combos
- **maxWidth truncation**: commentary truncated, face never truncated
- **Cosmetic stacking**: multiple cosmetics compose correctly on one line
- **Repo memory**: visit counting, nickname persistence, mood average calculation
- **Default state**: createDefaultCompanion has correct initial values

## Dependency Graph

```
Phase 1 (parallel):  WP1 ─┐
                     WP2 ─┤─ no dependencies between them
                     WP3 ─┘   (WP2/WP3 use type definitions from spec, WP1 creates the actual file)

Phase 2 (parallel):  WP4 ─┐
                     WP5 ─┤─ all depend on WP1/WP2/WP3 being merged
                     WP6 ─┤   no file conflicts between them
                     WP7 ─┘
```

## File Ownership (conflict-free guarantee)

| File | Owner | Phase |
|------|-------|-------|
| `src/shared/companion-types.ts` | WP1 | 1 |
| `src/daemon/companion.ts` | WP1 | 1 |
| `src/shared/paths.ts` | WP1 | 1 |
| `src/shared/types.ts` | WP1 | 1 |
| `src/shared/companion-render.ts` | WP2 | 1 |
| `src/daemon/companion-commentary.ts` | WP3 | 1 |
| `src/daemon/session-manager.ts` | WP4 | 2 |
| `src/daemon/pane-monitor.ts` | WP4 | 2 |
| `src/daemon/status-bar.ts` | WP4 | 2 |
| `src/cli/commands/companion.ts` | WP5 | 2 |
| `src/cli/index.ts` | WP5 | 2 |
| `src/shared/protocol.ts` | WP5 | 2 |
| `src/daemon/server.ts` | WP5 | 2 |
| `src/tui/panels/tree.ts` | WP6 | 2 |
| `src/tui/panels/overlays.ts` | WP6 | 2 |
| `src/tui/input.ts` | WP6 | 2 |
| `src/tui/state.ts` | WP6 | 2 |
| `src/__tests__/companion.test.ts` | WP7 | 2 |
| `src/__tests__/companion-render.test.ts` | WP7 | 2 |
