# Companion System Implementation Plan

## 1. Type Definitions

All types go in `src/shared/companion-types.ts` (new file). Shared by daemon, CLI, and TUI.

### Core Types

```typescript
export type Mood = 'happy' | 'grinding' | 'frustrated' | 'zen' | 'sleepy' | 'excited' | 'existential';

export type CompanionField = 'face' | 'boulder' | 'title' | 'commentary' | 'mood' | 'level' | 'stats' | 'achievements';

export type CommentaryEvent =
  | 'session-start'
  | 'cycle-boundary'
  | 'session-complete'
  | 'level-up'
  | 'achievement'
  | 'agent-crash'
  | 'idle-wake'
  | 'late-night';

export type TimePersonality = 'chipper' | 'professional' | 'reflective' | 'dry-humor' | 'delirious';

export interface CompanionStats {
  strength: number;      // lifetime completed sessions
  endurance: number;     // lifetime active ms
  wisdom: number;        // efficient orchestration count
  luck: number;          // clean completion ratio (0-1)
  patience: number;      // lifetime idle ms (daemon uptime - active time)
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string;    // ISO timestamp
}

export interface RepoMemory {
  visits: number;
  completions: number;
  crashes: number;
  totalActiveMs: number;
  moodAvg: number;       // running average (0-1 scale)
  nickname: string | null;
  firstSeen: string;     // ISO timestamp
  lastSeen: string;      // ISO timestamp
}

export interface LastCommentary {
  text: string;
  event: CommentaryEvent;
  timestamp: string;     // ISO timestamp
}

export interface CompanionState {
  version: 1;
  name: string | null;
  createdAt: string;     // ISO timestamp
  stats: CompanionStats;
  xp: number;
  level: number;
  title: string;
  mood: Mood;
  moodUpdatedAt: string; // ISO timestamp
  achievements: UnlockedAchievement[];
  repos: Record<string, RepoMemory>;  // keyed by absolute cwd path
  lastCommentary: LastCommentary | null;
  // Lifetime counters (redundant with derivable stats but kept for fast achievement checks)
  sessionsCompleted: number;
  sessionsCrashed: number;
  totalActiveMs: number;
  lifetimeAgentsSpawned: number;
}
```

### Achievement Definition Type

```typescript
export interface AchievementDef {
  id: string;
  name: string;
  category: 'milestone' | 'session' | 'time' | 'behavioral';
  description: string;
  badge: string | null;  // inline cosmetic character(s), or null
  // Check functions are in companion.ts, not in the type.
  // This type is data-only for serialization and rendering.
}
```

### Idle State Type

```typescript
export type IdleAnimation = 'sleeping' | 'pacing' | 'pondering' | 'flexing' | 'deep-sleep';

export interface IdleState {
  animation: IdleAnimation;
  frame: number;         // current frame index in the animation cycle
  idleSince: string;     // ISO timestamp of last session event
}
```

### Render Options

```typescript
export interface CompanionRenderOpts {
  maxWidth?: number;
  color?: boolean;
}
```

---

## 2. Module Interface Definitions

### 2A. `src/daemon/companion.ts` (Core Logic)

Primary module for companion state management. Follows `state.ts` patterns (atomic writes, read-modify-write with in-memory state).

```typescript
// --- State I/O ---
export function loadCompanion(): CompanionState;
  // Reads ~/.sisyphus/companion.json
  // If missing, creates default state: zeroed stats, level 1, "Boulder Intern"
  // Normalizes missing fields for forward compatibility (version migrations)

export function saveCompanion(state: CompanionState): void;
  // Atomic write: temp file + rename (same pattern as state.ts atomicWrite)
  // Path: join(globalDir(), 'companion.json')

// --- Stat Computation ---
export function updateStatsFromSession(companion: CompanionState, session: Session): void;
  // Mutates companion.stats in place:
  //   strength += 1 (session completed)
  //   endurance += session.activeMs
  //   wisdom += isEfficientSession(session) ? 1 : 0
  //   luck = recalcLuck(companion) — ratio of (sessionsCompleted - sessionsCrashed) / sessionsCompleted
  //   patience += idleMs (computed from daemon uptime context, passed separately or estimated)
  // Also increments lifetime counters:
  //   sessionsCompleted++, totalActiveMs += session.activeMs
  //   lifetimeAgentsSpawned += session.agents.length (only new agents from this session)

function isEfficientSession(session: Session): boolean;
  // True if agent completion times have low variance (stddev < 30% of mean)
  // Only considers agents with status 'completed'
  // Needs >= 2 completed agents to evaluate (single-agent sessions don't qualify)

// --- XP and Leveling ---
export function computeXP(stats: CompanionStats): number;
  // Formula from spec:
  // xp = stats.strength * 100
  //    + (stats.endurance / 3_600_000) * 10    // endurance_hours
  //    + stats.wisdom * 50
  //    + (stats.luck * 100) * 200              // luck_pct (0-100 scale)
  //    + (stats.patience / 3_600_000) * 5      // patience_hours
  // Returns floor(result)

export function computeLevel(xp: number): number;
  // Exponential thresholds, ~1.5x per level
  // See Section 5 for exact threshold table
  // Returns highest level where cumulative threshold <= xp

export function getTitle(level: number): string;
  // Lookup from TITLE_MAP (see Section 5)
  // Levels without explicit titles inherit from the nearest lower titled level

// --- Mood ---
export function computeMood(
  companion: CompanionState,
  session?: Session,
  signals?: MoodSignals
): Mood;
  // Weighted score per mood, highest wins
  // See Section 7 for mood weight definitions

export function getTimePersonality(): TimePersonality;
  // Based on current hour:
  // 06-10: chipper, 10-17: professional, 17-22: reflective
  // 22-02: dry-humor, 02-06: delirious

// --- Achievements ---
export function checkAchievements(
  companion: CompanionState,
  session: Session
): UnlockedAchievement[];
  // Runs all achievement condition checkers
  // Returns only NEWLY unlocked achievements (not already in companion.achievements)
  // See Section 6 for all 35 definitions

export const ACHIEVEMENTS: AchievementDef[];
  // Exported data array of all 35 achievement definitions
  // Condition checkers are separate functions, not on the data objects

// --- Repo Memory ---
export function updateRepoMemory(
  companion: CompanionState,
  cwd: string,
  session: Session,
  mood: Mood
): void;
  // Creates or updates repos[cwd]:
  //   visits++, completions++ (if completed), crashes += crashCount
  //   totalActiveMs += session.activeMs
  //   moodAvg = running average (weighted toward recent)
  //   lastSeen = now, firstSeen = firstSeen || now

// --- Idle ---
export function getIdleState(companion: CompanionState, idleSinceMs: number): IdleState;
  // Returns current idle animation based on stats and idle duration
  // See spec "Idle Behavior" for animation selection logic

// --- Convenience ---
export function getCompanionPath(): string;
  // Returns join(globalDir(), 'companion.json')
```

#### Mood Signals Interface

```typescript
export interface MoodSignals {
  recentCrashes: number;        // crashes in last 30 minutes
  recentRestarts: number;       // agent restarts in last 30 minutes
  idleDurationMs: number;       // ms since last session activity
  sessionLengthMs: number;      // current session running time
  cleanStreak: number;          // consecutive clean completions
  justCompleted: boolean;       // session just completed successfully
  justCrashed: boolean;         // agent just crashed
  justLeveledUp: boolean;       // level up just happened
  hourOfDay: number;            // 0-23
}
```

### 2B. `src/shared/companion-render.ts` (Universal Renderer)

Shared module importable by daemon (status-bar), CLI (status, companion cmd), and TUI (tree panel).

```typescript
export function renderCompanion(
  state: CompanionState,
  fields: CompanionField[],
  opts?: CompanionRenderOpts
): string;
  // Composes: base form + stat cosmetics + achievement badges + mood face + boulder
  // Only includes components specified in `fields`
  // maxWidth truncates commentary (never face/boulder)
  // color toggles ANSI escape codes

export function getBaseForm(level: number): string;
  // Returns body string by level bracket:
  //   1-2:   (o.o) .
  //   3-4:   (o.o)/ o
  //   5-7:  /(o.o)/ O
  //   8-11: \(^.^)/ O
  //   12-19: ᕦ(^.^)ᕤ OO
  //   20+:   ᕦ(>.<)ᕤ @
  // Returns [body, boulder] tuple for composition

export function getMoodFace(mood: Mood): string;
  // Returns face string that overrides the base form's face:
  //   happy: (^.^)    grinding: (>.< )   frustrated: (>.<#)
  //   zen: (‾.‾)      sleepy: (-.-)zzZ   excited: (*o*)
  //   existential: (◉_◉)

export function getMoodColor(mood: Mood): string;
  // Returns ANSI color code:
  //   happy: green    grinding: yellow    frustrated: red
  //   zen: cyan       sleepy: dim gray    excited: bright white
  //   existential: magenta

export function getStatCosmetics(stats: CompanionStats): { prefix: string; suffix: string };
  // Thresholds for "high" stat: top 25% of expected range
  // High wisdom → suffix wisps: ~O~
  // High endurance → suffix trail: O ...
  // High luck → prefix/suffix sparkle: * ... *
  // High patience → prefix zen: o ...
  // Multiple can stack

export function getAchievementBadges(achievements: UnlockedAchievement[]): { prefix: string; suffix: string };
  // Scans unlocked achievements for cosmetic badges
  // Night Owl → suffix: )
  // Marathon → boulder becomes: O~^~
  // Flawless → prefix/suffix: * ... *
  // Sisyphean → face mod: (;^.^)
  // Iron Will → boulder becomes: [O]
  // Cartographer → prefix: +
  // Returns aggregated prefix/suffix strings

export function getBoulderSize(agentCount?: number, repoVisits?: number, repoNickname?: string | null): string;
  // 1-2 agents: .    3-5 agents: o    6-9 agents: O    10+: @
  // No active session / idle: uses last known or default
  // 5+ visits: appends ' "nickname"' if available

export function renderIdleCompanion(state: CompanionState, idleState: IdleState): string;
  // Renders the idle animation frame
  // Low endurance: (-.-)zzZ o
  // High endurance: pacing frames
  // High wisdom + idle: (o.o)~ o
  // High strength: flexing frames
  // Very long idle: (u.u)... o
```

### 2C. `src/daemon/companion-commentary.ts` (Haiku-Powered Commentary)

Follows `summarize.ts` patterns exactly: fire-and-forget, 5-min cooldown, graceful degradation.

```typescript
export async function generateCommentary(
  companion: CompanionState,
  event: CommentaryEvent,
  context: CommentaryContext
): Promise<string | null>;
  // Builds prompt via buildPrompt(), sends to Haiku via @r-cli/sdk
  // Returns 1-2 sentence commentary, or null if unavailable
  // Fire-and-forget pattern: never blocks session operations

export async function generateAgentNickname(
  companion: CompanionState,
  agentType: string,
  agentIndex: number
): Promise<string | null>;
  // Generates a flavor nickname based on mood + stats
  // Returns a single word/name, or null
  // See spec "Agent Naming" for style-by-mood-stat table

export function buildPrompt(
  companion: CompanionState,
  event: CommentaryEvent,
  context: CommentaryContext
): string;
  // Constructs the Haiku prompt:
  //   1. Persona instruction (stable, from spec)
  //   2. Current state: mood, level, title, stats summary
  //   3. Time personality (from getTimePersonality())
  //   4. Event-specific context
  //   5. Output constraint: "1-2 short sentences. No emojis."

export function buildNicknamePrompt(
  companion: CompanionState,
  agentType: string,
  agentIndex: number
): string;
  // Constructs nickname generation prompt
  // Includes mood + stat profile → naming style hint

// --- Supporting Types ---
export interface CommentaryContext {
  repoPath?: string;
  repoNickname?: string | null;
  repoVisits?: number;
  sessionTask?: string;
  agentCount?: number;
  crashCount?: number;
  newLevel?: number;
  newTitle?: string;
  achievementName?: string;
  completionReport?: string;
}

// --- Internal ---
const PERSONA_INSTRUCTION = `You are a small ASCII creature who pushes boulders for a living. You are self-aware about your Sisyphean condition but mostly at peace with it. You speak in 1-2 short sentences. Your voice is shaped by your mood and stats. High wisdom: insightful. Low patience + frustrated: blunt. Happy + high luck: optimistic. Existential mood: philosophical non-sequiturs. Never break character. Never use emojis.`;

// Shared cooldown with summarize.ts? No — separate module, separate cooldown.
// But uses same COOLDOWN_MS = 5 * 60 * 1000 pattern.
```

---

## 3. Work Packages

### Package A: Core Companion Module + Types
**Files touched:** `src/shared/companion-types.ts` (new), `src/daemon/companion.ts` (new), `src/shared/paths.ts` (add `companionPath()`)
**Depends on:** Nothing (foundational)
**Deliverables:**
- All type definitions from Section 1
- All functions from Section 2A
- 35 achievement definitions as data
- XP formula, level computation, title lookup
- Mood computation with weighted scoring
- Repo memory CRUD
- Idle state computation
- `companionPath()` in paths.ts: `join(globalDir(), 'companion.json')`

### Package B: Renderer
**Files touched:** `src/shared/companion-render.ts` (new)
**Depends on:** Package A (types only, not runtime — can develop in parallel using type imports)
**Deliverables:**
- All functions from Section 2B
- `renderCompanion()` universal renderer
- Base form, mood face, stat cosmetics, achievement badges, boulder size
- Idle animation rendering
- ANSI color support with toggle

### Package C: Commentary + Agent Naming
**Files touched:** `src/daemon/companion-commentary.ts` (new)
**Depends on:** Package A (types + companion state for prompt building)
**Deliverables:**
- All functions from Section 2C
- Haiku integration following `summarize.ts` pattern
- Persona-consistent commentary generation
- Agent nickname generation by mood/stat profile

### Package D: Tests
**Files touched:** `src/__tests__/companion.test.ts` (new)
**Depends on:** Packages A + B (test the pure logic, mock Haiku calls)
**Deliverables:**
- XP computation tests (known inputs → expected XP)
- Level computation tests (boundary cases)
- Title lookup tests
- Mood scoring tests (given signals → expected mood)
- Achievement condition tests (each achievement's checker)
- Renderer output tests (known state → expected ASCII string)
- Stat accumulation tests (session data → stat deltas)
- Repo memory tests (create, update, visit counting)
- Idle state selection tests

### Package E: Integration (Daemon Hooks)
**Files touched:** `src/daemon/session-manager.ts`, `src/daemon/pane-monitor.ts`, `src/daemon/status-bar.ts`
**Depends on:** Packages A + B + C (needs all three modules working)
**Deliverables:**
- Hook into `startSession()`: update repo visits, compute mood, generate start commentary, flash to status bar
- Hook into `handleComplete()`: update stats, check achievements, check level-up, generate commentary, update repo, flash
- Hook into `handleSpawn()`: generate agent nickname, store in session state
- Hook into pane-monitor poll cycle: recompute mood, update idle animation, clear expired flash
- Hook into `handlePaneExited()` (crash path): mood spike to frustrated, maybe commentary + flash
- Status bar flash mechanism: `flashUntil` timestamp, commentary display on event, revert after 5s
- Add optional `nickname` field to `Agent` type in `src/shared/types.ts`

### Package F: CLI Command
**Files touched:** `src/cli/commands/companion.ts` (new), `src/cli/index.ts` (register), `src/shared/protocol.ts` (add request/response types)
**Depends on:** Packages A + B (reads companion state, renders full profile)
**Deliverables:**
- `sisyphus companion` command: full profile dump
- `--name <name>` flag to set companion name
- Multi-line formatted output: ASCII art, stats bars, achievement list, repo history, XP progress
- Protocol types: `CompanionRequest` / `CompanionResponse` in protocol.ts
- Handler in `src/daemon/server.ts`

### Package G: TUI Integration
**Files touched:** `src/tui/panels/tree.ts`, `src/tui/input.ts`, `src/tui/panels/` (companion overlay)
**Depends on:** Packages A + B + E (needs companion state available from daemon + renderer)
**Deliverables:**
- Tree panel: companion pinned to bottom row (face + boulder + commentary, mood-colored)
- Leader key `c`: companion profile overlay (stats, achievements, repo history)
- Overlay layout matching spec's baseball card format

---

## 4. Dependency Graph

```
Phase 1 (parallel):
  [A: Core + Types] ←── foundational, no deps
  [B: Renderer]     ←── depends on A types only (can start immediately with type imports)

Phase 2 (parallel, after A complete):
  [C: Commentary]   ←── needs A for companion state in prompts
  [D: Tests]        ←── needs A + B for testable modules

Phase 3 (after A + B + C complete):
  [E: Integration]  ←── hooks into daemon, needs all three modules
  [F: CLI Command]  ←── needs A + B for rendering, protocol types

Phase 4 (after E complete):
  [G: TUI]          ←── needs companion state flowing through daemon (E) + renderer (B)
```

**Parallel execution plan:**
- Wave 1: A + B (2 agents)
- Wave 2: C + D (2 agents, after A lands)
- Wave 3: E + F (2 agents, after A+B+C land)
- Wave 4: G (1 agent, after E lands)

**Maximum parallelism: 2 agents at a time.** No file conflicts between any concurrent pair.

---

## 5. XP Formula and Level Thresholds

### XP Formula

```typescript
function computeXP(stats: CompanionStats): number {
  const strengthXP = stats.strength * 100;
  const enduranceXP = (stats.endurance / 3_600_000) * 10;  // ms → hours
  const wisdomXP = stats.wisdom * 50;
  const luckXP = (stats.luck * 100) * 2;                   // ratio → pct, *2 weight
  const patienceXP = (stats.patience / 3_600_000) * 5;     // ms → hours
  return Math.floor(strengthXP + enduranceXP + wisdomXP + luckXP + patienceXP);
}
```

**XP contribution breakdown per unit:**
| Stat | Unit | XP per unit |
|------|------|------------|
| Strength | 1 completed session | 100 |
| Endurance | 1 hour active | 10 |
| Wisdom | 1 efficient session | 50 |
| Luck | 1% clean rate | 2 |
| Patience | 1 hour idle | 5 |

**Design note:** Strength dominates — each completed session is the largest single-event XP gain. This means the primary way to level is to complete sessions, which aligns with the "no grinding" philosophy. Endurance and patience provide slow background XP from uptime. Wisdom rewards good orchestration. Luck is a small bonus that caps at 200 XP total (100% clean rate).

### Level Thresholds

Formula: each level requires `floor(200 * 1.5^(N-2))` additional XP beyond the previous level. Cumulative thresholds:

```typescript
const LEVEL_THRESHOLDS: number[] = []; // index = level, value = cumulative XP needed

// Computed via: threshold[1] = 0, threshold[N] = threshold[N-1] + floor(200 * 1.5^(N-2))
```

| Level | Per-Level XP | Cumulative XP | Title | Approx. Sessions* |
|-------|-------------|---------------|-------|-------------------|
| 1 | — | 0 | Boulder Intern | 0 |
| 2 | 200 | 200 | Pebble Pusher | 2 |
| 3 | 300 | 500 | Rock Hauler | 5 |
| 4 | 450 | 950 | Gravel Wrangler | 10 |
| 5 | 675 | 1,625 | Slope Familiar | 16 |
| 6 | 1,012 | 2,637 | Incline Regular | 26 |
| 7 | 1,518 | 4,155 | Ridge Runner | 42 |
| 8 | 2,278 | 6,433 | Crag Warden | 64 |
| 9 | 3,417 | 9,850 | Stone Whisperer | 99 |
| 10 | 5,126 | 14,976 | Boulder Brother | 150 |
| 11 | 7,689 | 22,665 | Hill Veteran | 227 |
| 12 | 11,533 | 34,198 | Summit Aspirant | 342 |
| 13 | 17,300 | 51,498 | Peak Haunter | 515 |
| 14 | 25,950 | 77,448 | Cliff Sage | 774 |
| 15 | 38,925 | 116,373 | Mountain's Shadow | 1,164 |
| 16 | 58,388 | 174,761 | Eternal Roller | 1,748 |
| 17 | 87,581 | 262,342 | Gravity's Rival | 2,623 |
| 18 | 131,372 | 393,714 | The Unmoved Mover | 3,937 |
| 19 | 197,058 | 590,772 | Camus Was Right | 5,908 |
| 20 | 295,587 | 886,359 | The Absurd Hero | 8,864 |
| 25 | — | ~3,400,000 | One Must Imagine Him Happy | ~34,000 |
| 30 | — | ~25,600,000 | He Has Always Been Here | ~256,000 |

*Approx. sessions assumes 100 XP per session (strength only, no other stat contributions). Real progression is faster due to endurance, wisdom, luck, and patience contributions.

### computeLevel Implementation

```typescript
function computeLevel(xp: number): number {
  let level = 1;
  let threshold = 200;
  let cumulative = 0;
  while (cumulative + threshold <= xp) {
    cumulative += threshold;
    level++;
    threshold = Math.floor(threshold * 1.5);
  }
  return level;
}
```

### Title Lookup

```typescript
const TITLE_MAP: Record<number, string> = {
  1: 'Boulder Intern',
  2: 'Pebble Pusher',
  3: 'Rock Hauler',
  4: 'Gravel Wrangler',
  5: 'Slope Familiar',
  6: 'Incline Regular',
  7: 'Ridge Runner',
  8: 'Crag Warden',
  9: 'Stone Whisperer',
  10: 'Boulder Brother',
  11: 'Hill Veteran',
  12: 'Summit Aspirant',
  13: 'Peak Haunter',
  14: 'Cliff Sage',
  15: "Mountain's Shadow",
  16: 'Eternal Roller',
  17: "Gravity's Rival",
  18: 'The Unmoved Mover',
  19: 'Camus Was Right',
  20: 'The Absurd Hero',
  25: 'One Must Imagine Him Happy',
  30: 'He Has Always Been Here',
};

function getTitle(level: number): string {
  // Walk down from level to find nearest titled level
  for (let l = level; l >= 1; l--) {
    if (TITLE_MAP[l]) return TITLE_MAP[l];
  }
  return 'Boulder Intern';
}
```

Levels 21-24 use "The Absurd Hero". Levels 26-29 use "One Must Imagine Him Happy".

---

## 6. Achievement Definitions

35 total. The spec lists 33 explicitly; 2 additional are defined below to reach the 35 count shown in the `sisyphus companion` output example.

### Milestone Achievements (8)

| # | ID | Name | Condition | Badge |
|---|---|------|-----------|-------|
| 1 | `first-blood` | First Blood | `sessionsCompleted >= 1` | — |
| 2 | `centurion` | Centurion | `sessionsCompleted >= 100` | — |
| 3 | `thousand-boulder` | Thousand Boulder | `sessionsCompleted >= 1000` | — |
| 4 | `cartographer` | Cartographer | `Object.keys(repos).length >= 10` | `+` |
| 5 | `world-traveler` | World Traveler | `Object.keys(repos).length >= 25` | — |
| 6 | `hive-mind` | Hive Mind | `lifetimeAgentsSpawned >= 500` | — |
| 7 | `old-growth` | Old Growth | `daysSince(createdAt) >= 30` | — |
| 8 | `ancient` | Ancient | `daysSince(createdAt) >= 365` | — |

### Session Achievements (9)

| # | ID | Name | Condition | Badge |
|---|---|------|-----------|-------|
| 9 | `marathon` | Marathon | Session with `agents.length >= 10` | `~^~` |
| 10 | `blitz` | Blitz | Session `activeMs < 120_000` (2 min) and completed | — |
| 11 | `speed-run` | Speed Run | Session `activeMs < 300_000` (5 min) and completed | — |
| 12 | `flawless` | Flawless | Session completed, zero agents with status `crashed` or `killed` | `*` |
| 13 | `iron-will` | Iron Will | 10 consecutive completed sessions with zero crashes (tracked via companion counter) | `[]` |
| 14 | `glass-cannon` | Glass Cannon | Session with `agents.length >= 5`, every agent crashed at least once (has `killedReason` or was restarted), but session still completed | — |
| 15 | `solo` | Solo | Session completed with exactly 1 agent | — |
| 16 | `one-more-cycle` | One More Cycle | Session with `orchestratorCycles.length >= 10` | — |
| 17 | `quick-draw` | Quick Draw | First agent spawned within 30s of session creation (`agents[0].spawnedAt - session.createdAt < 30_000`) | — |

### Time-Based Achievements (6)

| # | ID | Name | Condition | Badge |
|---|---|------|-----------|-------|
| 18 | `night-owl` | Night Owl | Session completed where `new Date(session.createdAt).getHours() >= 0 && < 6` (started after midnight) | `)` |
| 19 | `dawn-patrol` | Dawn Patrol | Session `activeMs` spans midnight to 6am (session was active during both midnight and 6am — check `createdAt` before midnight and either `completedAt` or current time after 6am) | — |
| 20 | `early-bird` | Early Bird | Session started before 6am (`new Date(session.createdAt).getHours() < 6`) | — |
| 21 | `weekend-warrior` | Weekend Warrior | Session completed on Saturday (6) or Sunday (0) | — |
| 22 | `all-nighter` | All-Nighter | Single session with `activeMs >= 28_800_000` (8 hours) | — |
| 23 | `witching-hour` | Witching Hour | Session started between 3am-4am (`hour === 3`) | — |

### Behavioral Achievements (12)

| # | ID | Name | Condition | Badge |
|---|---|------|-----------|-------|
| 24 | `sisyphean` | Sisyphean | Same task string restarted 3+ times (fuzzy match: normalized task appears 3+ times in recent sessions for same cwd) | `;` |
| 25 | `stubborn` | Stubborn | Same task restarted 5+ times AND eventually completed | — |
| 26 | `creature-of-habit` | Creature of Habit | Any single repo with `visits >= 20` | — |
| 27 | `loyal` | Loyal | Any single repo with `visits >= 50` | — |
| 28 | `wanderer` | Wanderer | 5+ different repos with sessions in the same calendar day (check repos' `lastSeen` dates) | — |
| 29 | `streak` | Streak | 7 consecutive calendar days with at least one completed session (tracked via companion state — need a `lastStreakDays` counter or derive from session history) | — |
| 30 | `hot-streak` | Hot Streak | 7 consecutive completed sessions with zero crashes | — |
| 31 | `momentum` | Momentum | 3 sessions completed within a 60-minute window | — |
| 32 | `patient-one` | Patient One | Session where idle time between any two consecutive cycles was 30+ minutes | — |
| 33 | `message-in-a-bottle` | Message in a Bottle | 10+ messages sent to a single session (`session.messages.length >= 10` where `source.type === 'user'`) | — |
| 34 | `comeback-kid` | Comeback Kid | Session that was paused/killed and then resumed and completed successfully | — |
| 35 | `pair-programming` | Pair Programming | 3+ user messages sent during an active session (user actively collaborating, not fire-and-forget) | — |

**Note on #34-35:** These are the 2 additional achievements beyond the 33 in the spec, bringing the total to 35 as shown in the spec's CLI output example (`Achievements (7/35)`). Both fit the behavioral category and track interesting patterns.

### Achievement Checker Implementation Pattern

```typescript
type AchievementChecker = (companion: CompanionState, session: Session) => boolean;

const ACHIEVEMENT_CHECKERS: Record<string, AchievementChecker> = {
  'first-blood': (c) => c.sessionsCompleted >= 1,
  'centurion': (c) => c.sessionsCompleted >= 100,
  // ... etc
};

function checkAchievements(companion: CompanionState, session: Session): UnlockedAchievement[] {
  const newlyUnlocked: UnlockedAchievement[] = [];
  const alreadyUnlocked = new Set(companion.achievements.map(a => a.id));

  for (const [id, checker] of Object.entries(ACHIEVEMENT_CHECKERS)) {
    if (alreadyUnlocked.has(id)) continue;
    if (checker(companion, session)) {
      newlyUnlocked.push({ id, unlockedAt: new Date().toISOString() });
    }
  }
  return newlyUnlocked;
}
```

### Tracking Requirements for Complex Achievements

Some achievements need tracking state beyond what's in `CompanionState` or a single `Session`:

| Achievement | Extra State Needed | Where to Store |
|-------------|-------------------|----------------|
| Iron Will | Consecutive clean sessions counter | `companion.cleanStreak: number` |
| Hot Streak | Same as Iron Will | Same field works |
| Sisyphean | Recent task strings per repo | Derive from session state files on disk (scan `sessionsDir`) |
| Stubborn | Same + completion flag | Same scan approach |
| Streak (7 days) | Daily session dates | `companion.lastSessionDates: string[]` (last 7 ISO date strings) |
| Wanderer | Repos per day | Derive from `repos[*].lastSeen` on same calendar day |
| Momentum | Recent completion timestamps | `companion.recentCompletions: string[]` (last 3 ISO timestamps, rolling) |
| Comeback Kid | Session was previously paused/killed | Check session state history or add a flag |

**Recommended additions to CompanionState:**

```typescript
// Add to CompanionState:
cleanStreak: number;              // consecutive completed sessions with 0 crashes
lastSessionDates: string[];       // last 7 unique ISO date strings with sessions
recentCompletions: string[];      // last 3 completion timestamps for momentum check
```

---

## 7. Mood Weights

### Mood Scoring System

Each mood has a base score plus weighted contributions from signals. The highest-scoring mood wins.

```typescript
interface MoodScore {
  mood: Mood;
  base: number;
  weights: Partial<Record<keyof MoodSignals, number>>;
}
```

### Weight Table

| Mood | Base | Signals (weight) |
|------|------|-----------------|
| **Happy** | 0 | `justCompleted: +50`, `cleanStreak: +5/streak`, `hourOfDay 6-17: +5` |
| **Grinding** | 10 | `sessionLengthMs > 300_000: +30`, `sessionLengthMs > 600_000: +20` (stacks) |
| **Frustrated** | 0 | `recentCrashes: +25/crash`, `recentRestarts: +15/restart`, `justCrashed: +40` |
| **Zen** | 0 | `patience_hours > 100: +20`, `idleDurationMs 300_000-1_800_000: +25`, `cleanStreak > 3: +15` |
| **Sleepy** | 0 | `idleDurationMs > 1_800_000: +35`, `idleDurationMs > 3_600_000: +25` (stacks), `hourOfDay 22-06: +20` |
| **Excited** | 0 | `justLeveledUp: +60`, `justCompleted && agentCount >= 5: +30` |
| **Existential** | 0 | `hourOfDay 2-5: +25`, `endurance_hours > 200: +20`, `hourOfDay 2-5 && endurance > 200: +30` (bonus for both) |

### Scoring Algorithm

```typescript
function computeMood(companion: CompanionState, session?: Session, signals?: MoodSignals): Mood {
  if (!signals) {
    // No signals = idle state. Use time-of-day and idle duration defaults.
    const hour = new Date().getHours();
    if (hour >= 2 && hour < 6) return 'existential';  // late night override
    if (hour >= 22 || hour < 2) return 'sleepy';
    return 'zen';  // default idle mood
  }

  const scores: Record<Mood, number> = {
    happy: 0, grinding: 10, frustrated: 0, zen: 0,
    sleepy: 0, excited: 0, existential: 0,
  };

  // Happy
  if (signals.justCompleted) scores.happy += 50;
  scores.happy += signals.cleanStreak * 5;
  if (signals.hourOfDay >= 6 && signals.hourOfDay < 17) scores.happy += 5;

  // Grinding (base 10 gives it advantage when session is running but nothing else triggers)
  if (signals.sessionLengthMs > 300_000) scores.grinding += 30;
  if (signals.sessionLengthMs > 600_000) scores.grinding += 20;

  // Frustrated
  scores.frustrated += signals.recentCrashes * 25;
  scores.frustrated += signals.recentRestarts * 15;
  if (signals.justCrashed) scores.frustrated += 40;

  // Zen
  const patienceHours = companion.stats.patience / 3_600_000;
  if (patienceHours > 100) scores.zen += 20;
  if (signals.idleDurationMs > 300_000 && signals.idleDurationMs <= 1_800_000) scores.zen += 25;
  if (signals.cleanStreak > 3) scores.zen += 15;

  // Sleepy
  if (signals.idleDurationMs > 1_800_000) scores.sleepy += 35;
  if (signals.idleDurationMs > 3_600_000) scores.sleepy += 25;
  if (signals.hourOfDay >= 22 || signals.hourOfDay < 6) scores.sleepy += 20;

  // Excited
  if (signals.justLeveledUp) scores.excited += 60;
  if (signals.justCompleted && (session?.agents.length ?? 0) >= 5) scores.excited += 30;

  // Existential
  if (signals.hourOfDay >= 2 && signals.hourOfDay < 6) scores.existential += 25;
  const enduranceHours = companion.stats.endurance / 3_600_000;
  if (enduranceHours > 200) scores.existential += 20;
  if (signals.hourOfDay >= 2 && signals.hourOfDay < 6 && enduranceHours > 200) {
    scores.existential += 30;  // synergy bonus
  }

  // Pick highest
  let best: Mood = 'grinding';
  let bestScore = -1;
  for (const [mood, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = mood as Mood;
    }
  }
  return best;
}
```

### Design Rationale

- **Grinding has base 10**: ensures that during an active session with no notable events, the mood defaults to "grinding" rather than falling to a zero-scoring mood.
- **Excited requires explicit triggers**: level-ups and big completions are rare, keeping "excited" special.
- **Existential has a synergy bonus**: only achievable at 3am+ with high endurance — a rare state that rewards late-night veterans.
- **Frustrated requires actual failures**: won't trigger from slow sessions, only crashes/restarts.
- **Zen requires calm**: moderate idle + good track record. Too much idle → sleepy instead.
- **Sleepy wins at extended idle**: 30+ minutes idle pushes sleepy past zen. Late night amplifies.

### Time-of-Day Personality (for Commentary Voice)

```typescript
function getTimePersonality(): TimePersonality {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'chipper';
  if (hour >= 10 && hour < 17) return 'professional';
  if (hour >= 17 && hour < 22) return 'reflective';
  if (hour >= 22 || hour < 2) return 'dry-humor';
  return 'delirious';  // 2-6
}
```

---

## 8. Integration Details

### Status Bar Flash Mechanism

Add to `status-bar.ts` (in-memory, not persisted):

```typescript
let companionFlashText: string | null = null;
let flashUntil = 0;

export function flashCompanionCommentary(text: string): void {
  companionFlashText = text;
  flashUntil = Date.now() + 5000;
}
```

In `writeStatusBar()`, after rendering session dots, append companion:
- If `Date.now() < flashUntil`: render face + commentary (`companionFlashText`)
- Else: render face + boulder (compact form)
- On each call, if flash expired, clear `companionFlashText`

### Session-Manager Hook Points

**`startSession()` — after session creation, before return:**
```typescript
const companion = loadCompanion();
updateRepoMemory(companion, cwd, session, companion.mood);
const mood = computeMood(companion, session, buildSignals(session));
companion.mood = mood;
companion.moodUpdatedAt = new Date().toISOString();
saveCompanion(companion);

// Fire-and-forget commentary
generateCommentary(companion, 'session-start', {
  repoPath: cwd, repoVisits: companion.repos[cwd]?.visits,
  repoNickname: companion.repos[cwd]?.nickname, sessionTask: task,
}).then(text => {
  if (text) {
    companion.lastCommentary = { text, event: 'session-start', timestamp: new Date().toISOString() };
    saveCompanion(companion);
    flashCompanionCommentary(text);
  }
});
```

**`handleComplete()` — after marking session completed:**
```typescript
const companion = loadCompanion();
updateStatsFromSession(companion, session);
companion.xp = computeXP(companion.stats);
const newLevel = computeLevel(companion.xp);
const leveledUp = newLevel > companion.level;
companion.level = newLevel;
companion.title = getTitle(newLevel);
const newAchievements = checkAchievements(companion, session);
companion.achievements.push(...newAchievements);
updateRepoMemory(companion, cwd, session, companion.mood);
companion.mood = computeMood(companion, session, buildSignals(session));
companion.moodUpdatedAt = new Date().toISOString();
saveCompanion(companion);

// Commentary for completion, level-up, achievements (pick highest priority)
// ...fire-and-forget
```

**`handleSpawn()` — after creating agent:**
```typescript
// Fire-and-forget nickname generation
generateAgentNickname(companion, agentType, agentIndex).then(nickname => {
  if (nickname) {
    updateAgent(cwd, sessionId, agentId, { nickname });
    // Update tmux pane title to include nickname
  }
});
```

### Agent Type Extension

Add to `src/shared/types.ts`:
```typescript
export interface Agent {
  // ... existing fields ...
  nickname?: string;  // companion-assigned flavor name
}
```

### CLI `companion` Command Protocol

Add to `src/shared/protocol.ts`:
```typescript
// Request
| { type: 'companion'; action: 'get' }
| { type: 'companion'; action: 'set-name'; name: string }

// Response
| { type: 'companion'; companion: CompanionState }
```

---

## 9. File Inventory

### New Files (7)
| File | Package | Purpose |
|------|---------|---------|
| `src/shared/companion-types.ts` | A | All companion type definitions |
| `src/daemon/companion.ts` | A | Core companion logic |
| `src/shared/companion-render.ts` | B | Universal ASCII renderer |
| `src/daemon/companion-commentary.ts` | C | Haiku commentary + naming |
| `src/__tests__/companion.test.ts` | D | Tests |
| `src/cli/commands/companion.ts` | F | CLI command |
| `src/tui/panels/companion-overlay.ts` | G | TUI overlay panel |

### Modified Files (7)
| File | Package | Change |
|------|---------|--------|
| `src/shared/paths.ts` | A | Add `companionPath()` |
| `src/shared/types.ts` | E | Add `nickname?: string` to `Agent` |
| `src/shared/protocol.ts` | F | Add companion request/response types |
| `src/daemon/session-manager.ts` | E | Hook companion into lifecycle events |
| `src/daemon/pane-monitor.ts` | E | Recompute mood on poll, idle animation |
| `src/daemon/status-bar.ts` | E | Companion face + flash mechanism |
| `src/daemon/server.ts` | F | Handle companion protocol requests |
| `src/cli/index.ts` | F | Register companion command |
| `src/tui/panels/tree.ts` | G | Pinned companion bottom row |
| `src/tui/input.ts` | G | Leader key `c` binding |

### Unchanged but Referenced
| File | Why |
|------|-----|
| `src/daemon/summarize.ts` | Pattern reference for Haiku SDK usage |
| `src/daemon/state.ts` | Pattern reference for atomic writes |
