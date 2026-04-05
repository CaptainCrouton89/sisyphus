# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Implement the Companion system's shared renderer for the sisyphus daemon — a pure rendering function that composes ASCII art from companion state.

## Your Task: WP2 — Renderer

Create one new file: `src/shared/companion-render.ts`. Do NOT touch any other files.

### Important: Type Import Strategy
Another agent is creating `src/shared/companion-types.ts` in parallel. You need to import types from it. Create your file importing from `./companion-types.js` — the types file WILL exist when everything compiles together. If the types file doesn't exist yet when you're working, create a minimal local type stub at the top of your file to guide your implementation, but make sure the ACTUAL imports point to `./companion-types.js`. The final code must import from companion-types.

Types you'll need (defined in companion-types.ts):
```typescript
interface CompanionStats { strength: number; endurance: number; wisdom: number; luck: number; patience: number; }
type Mood = 'happy' | 'grinding' | 'frustrated' | 'zen' | 'sleepy' | 'excited' | 'existential';
interface UnlockedAchievement { id: AchievementId; unlockedAt: string; }
interface CompanionState { version: 1; name: string | null; createdAt: string; stats: CompanionStats; xp: number; level: number; title: string; mood: Mood; moodUpdatedAt: string; achievements: UnlockedAchievement[]; repos: Record<string, RepoMemory>; lastCommentary: Commentary | null; sessionsCompleted: number; sessionsCrashed: number; totalActiveMs: number; lifetimeAgentsSpawned: number; consecutiveCleanSessions: number; dailyRepos: Record<string, string[]>; taskHistory: Record<string, number>; consecutiveDaysActive: number; lastActiveDate: string | null; }
type CompanionField = 'face' | 'boulder' | 'title' | 'commentary' | 'mood' | 'level' | 'stats' | 'achievements';
interface CompanionRenderOpts { maxWidth?: number; color?: boolean; tmuxFormat?: boolean; agentCount?: number; repoPath?: string; }
type AchievementId = 'first-blood' | 'centurion' | 'thousand-boulder' | 'cartographer' | 'world-traveler' | 'hive-mind' | 'old-growth' | 'ancient' | 'marathon' | 'blitz' | 'speed-run' | 'flawless' | 'iron-will' | 'glass-cannon' | 'solo' | 'one-more-cycle' | 'quick-draw' | 'night-owl' | 'dawn-patrol' | 'early-bird' | 'weekend-warrior' | 'all-nighter' | 'witching-hour' | 'sisyphean' | 'stubborn' | 'creature-of-habit' | 'loyal' | 'wanderer' | 'streak' | 'hot-streak' | 'momentum' | 'patient-one' | 'message-in-a-bottle';
```

### File to CREATE: `src/shared/companion-render.ts`

This is a **pure rendering module** — no state mutations, no side effects, no file I/O.

**Exports:**

```typescript
export function renderCompanion(companion: CompanionState, fields: CompanionField[], opts?: CompanionRenderOpts): string;
export function getBaseForm(level: number): string;
export function getMoodFace(mood: Mood): string;
export function getStatCosmetics(stats: CompanionStats): string[];
export function getAchievementBadges(achievements: UnlockedAchievement[]): string[];
export function getBoulderForm(agentCount?: number, repoNickname?: string): string;
export function composeLine(body: string, cosmetics: string[], badges: string[], boulder: string): string;
```

**`getBaseForm(level)`** — Level determines the base body (FACE is a placeholder replaced by mood face):
- Lv 1-2: `(FACE) .` — just a face and pebble
- Lv 3-4: `(FACE)/ o` — gains an arm
- Lv 5-7: `/(FACE)/ O` — both arms, boulder grows
- Lv 8-11: `\(FACE)/ O` — expression upgrade body
- Lv 12-19: `ᕦ(FACE)ᕤ OO` — buff arms
- Lv 20+: `ᕦ(FACE)ᕤ @` — final form

Return the template string with literal `FACE` as the placeholder.

**`getMoodFace(mood)`** — Returns the face expression string:
- happy: `^.^`
- grinding: `>.<`
- frustrated: `>.<#`
- zen: `‾.‾`
- sleepy: `-.-)zzZ`
- excited: `*o*`
- existential: `◉_◉`

**`getStatCosmetics(stats)`** — Returns array of cosmetic modifiers to apply. Each is a tag indicating what decoration to add:
- High wisdom (> 30): return `'wisps'` — boulder gets wrapped: `~BOULDER~`
- High endurance (> 1800000000, i.e. 500h in ms): return `'trail'` — trail after boulder: `BOULDER ...`
- High luck (> 0.8): return `'sparkle'` — sparkle bookends: `* BODY BOULDER *`
- High patience (> 1800000000, i.e. 500h in ms): return `'zen-prefix'` — zen prefix: `o BODY BOULDER`

Multiple can be active. Return array of active cosmetic names.

**`getAchievementBadges(achievements)`** — Returns array of badge identifiers for achievements that have visual cosmetics:
- night-owl: `'crescent'` — `)` suffix
- marathon: `'heat'` — `~^~` on boulder
- flawless: `'sparkle-bookends'` — `*` bookends (note: stacks with luck sparkle)
- sisyphean: `'sweatdrop'` — `;` inserted in face
- iron-will: `'armored'` — boulder wrapped in `[]`
- cartographer: `'compass'` — `+` prefix

Only return badges for achievements the companion has unlocked.

**`getBoulderForm(agentCount?, repoNickname?)`** — Returns boulder string:
- 0-2 agents (or undefined): `.`
- 3-5: `o`
- 6-9: `O`
- 10+: `@`
- If repoNickname provided, append: `BOULDER "nickname"`

**`composeLine(body, cosmetics, badges, boulder)`** — Composes the final single line from all parts:
1. Start with body string (already has FACE replaced)
2. Apply cosmetics in order:
   - `wisps`: wrap boulder with `~`: `~BOULDER~`
   - `trail`: append ` ...` after boulder
   - `sparkle`: wrap whole line with `* ` and ` *`
   - `zen-prefix`: prepend `o ` before body
3. Apply badges in order:
   - `crescent`: append ` )` at end
   - `heat`: append `~^~` to boulder
   - `sparkle-bookends`: wrap with `* ` and ` *` (if sparkle cosmetic already applied, don't double)
   - `sweatdrop`: insert `;` after opening `(` in body
   - `armored`: wrap boulder with `[` and `]`
   - `compass`: prepend `+ ` before everything

**`renderCompanion(companion, fields, opts)`** — Main entry point:
1. Build parts based on which fields are requested:
   - `'face'`: Get base form, replace FACE placeholder with mood face, apply cosmetics and badges via composeLine. Include boulder in same string if `'boulder'` also requested.
   - `'boulder'`: Boulder form (only separate if face not requested — unusual but handle it)
   - `'title'`: companion.title
   - `'commentary'`: companion.lastCommentary?.text or empty
   - `'mood'`: `[${companion.mood}]`
   - `'level'`: `Lv ${companion.level}`
   - `'stats'`: stat summary string
   - `'achievements'`: achievement count string
2. Join parts with `  ` (double space)
3. Apply `maxWidth`: truncate commentary FIRST (never truncate face/boulder). If still over, truncate from right with `…`
4. Apply color if `opts?.color`:
   - Mood colors: happy=green(32), grinding=yellow(33), frustrated=red(31), zen=cyan(36), sleepy=gray(90), excited=bright white(97), existential=magenta(35)
   - Wrap the face/body portion in `\x1b[COLORm...\x1b[0m`
5. If `opts?.tmuxFormat`: use `#[fg=COLOR]` instead of ANSI. Color names: happy=green, grinding=yellow, frustrated=red, zen=cyan, sleepy=colour245, excited=white, existential=magenta. Reset with `#[fg=default]`.

### Reference
- Plan details: `context/plan-companion.md` (WP2 section)
- Spec: `.claude/specs/companion.spec.md` (rendering examples)
- This is a shared module (in `src/shared/`) — no daemon imports allowed

### Done Condition
- `src/shared/companion-render.ts` exists with all 7 exported functions
- Imports types from `./companion-types.js`
- Pure functions only — no side effects, no file I/O
- All level brackets, mood faces, cosmetics, and badges implemented as specified
- `npx tsc --noEmit` passes (may need companion-types.ts to exist first — that's fine, just make sure your imports are correct)

Report clearly: what you built, design decisions, any edge cases you handled.

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
