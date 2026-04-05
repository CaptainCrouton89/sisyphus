# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Implement the Companion system's commentary and naming module for the sisyphus daemon — fire-and-forget Haiku SDK calls for personality.

## Your Task: WP3 — Commentary + Agent Naming

Create one new file: `src/daemon/companion-commentary.ts`. Do NOT touch any other files.

### Important: Type Import and Pattern Reference

Another agent is creating `src/shared/companion-types.ts` in parallel. Import types from it:
```typescript
import type { CompanionState, Mood, RepoMemory } from '../shared/companion-types.js';
```

**Critical pattern reference: `src/daemon/summarize.ts`** — Your module MUST follow the exact same fire-and-forget pattern. Read that file carefully. Key elements:
- Import `query` from `@r-cli/sdk`
- Import `execEnv` from `../shared/env.js`
- Module-level `const COOLDOWN_MS = 5 * 60 * 1000` and `let disabledUntil = 0`
- Check `Date.now() < disabledUntil` → return null
- Call `query({ prompt, options: { model: 'haiku', maxTurns: 1, env: execEnv() } })`
- Iterate the async session to extract text
- On 401/403 errors: set `disabledUntil = Date.now() + COOLDOWN_MS`
- On ANY error: log and return null (graceful degradation)

Types you'll need from companion-types.ts:
```typescript
type Mood = 'happy' | 'grinding' | 'frustrated' | 'zen' | 'sleepy' | 'excited' | 'existential';
interface CompanionStats { strength: number; endurance: number; wisdom: number; luck: number; patience: number; }
interface RepoMemory { visits: number; completions: number; crashes: number; totalActiveMs: number; moodAvg: number; nickname?: string; firstSeen: string; lastSeen: string; }
interface CompanionState { version: 1; name: string | null; stats: CompanionStats; xp: number; level: number; title: string; mood: Mood; /* ... other fields */ }
```

### File to CREATE: `src/daemon/companion-commentary.ts`

**Exports:**

```typescript
export type CommentaryEvent = 
  | 'session-start' | 'session-complete' | 'cycle-boundary'
  | 'level-up' | 'achievement' | 'agent-crash'
  | 'idle-wake' | 'late-night';

export function generateCommentary(
  event: CommentaryEvent,
  companion: CompanionState,
  context?: string
): Promise<string | null>;

export function generateNickname(
  companion: CompanionState
): Promise<string | null>;

export function generateRepoNickname(
  repoPath: string,
  memory: RepoMemory
): Promise<string | null>;
```

**`generateCommentary(event, companion, context?)`**

Calls Haiku with a prompt that includes:
1. The companion persona (stable across all calls):
   > You are a small ASCII creature who pushes boulders for a living. You are self-aware about your Sisyphean condition but mostly at peace with it. You speak in 1-2 short sentences. Your voice is shaped by your mood and stats. High wisdom: insightful. Low patience + frustrated: blunt. Happy + high luck: optimistic. Existential mood: philosophical non-sequiturs. Never break character. Never use emojis.

2. Current companion state context: mood, level, title, key stats
3. Time-of-day personality modifier:
   - 06:00-10:00: "Chipper, energetic, brief"
   - 10:00-17:00: "Professional, focused"
   - 17:00-22:00: "Reflective, slightly philosophical"
   - 22:00-02:00: "Dry humor, existential asides"
   - 02:00-06:00: "Delirious, absurdist, dramatic"

4. The event type and any context string
5. Instruction: "Respond with 1-2 sentences only. No quotes around the text."

**Commentary frequency** — Some events should be skipped randomly to feel organic:
- Always generate: session-start, session-complete, level-up, achievement, late-night
- 50% chance: cycle-boundary, idle-wake
- 30% chance: agent-crash

Use `Math.random()` for the probability check. Return null when skipped.

Extract text from the Haiku response. Trim. Return null if empty. Max 150 chars (truncate with `…` if longer).

**`generateNickname(companion)`**

Calls Haiku with a prompt that includes:
1. Current companion mood, stats, level
2. Naming style guidance based on mood+stat profile:
   - Happy + high wisdom: "mythological names (Atlas, Hermes, Arachne)"
   - Frustrated + low patience: "blunt functional names (Fix-It, Patch, Leftovers)"
   - Zen + high patience: "nature names (River, Stone, Cedar, Moss)"
   - Excited + high strength: "heroic names (Vanguard, Striker, Apex)"
   - Existential: "abstract names (Echo, Void, Loop, Why)"
   - Grinding + high endurance: "workhorse names (Steady, Grind, Anvil, Ox)"
   - Sleepy: "drowsy names (Mumble, Blink, Yawn, Doze)"
   - Happy + high luck: "lucky names (Charm, Ace, Windfall, Clover)"
   - High level (15+): "legendary names (Prometheus, Orpheus, Icarus)"
3. Instruction: "Generate a single agent nickname. One word only. No quotes, no explanation."

Extract text, trim, take first word only, return. Max 20 chars. Return null on any issue.

**`generateRepoNickname(repoPath, memory)`**

Calls Haiku with a prompt:
1. Repo path basename (not full path for privacy)
2. Repo stats: visits, completions, crashes, mood average
3. Instruction: "Generate a 1-2 word nickname for this repository based on the work history there. Affectionate or wary depending on crash rate and mood. No quotes, no explanation."

Extract text, trim, max 30 chars. Return null on any issue.

### Internal helper

Create a private `callHaiku(prompt: string): Promise<string | null>` helper to avoid repeating the SDK call pattern. This is the same pattern as summarize.ts:
- Check cooldown
- Call query with haiku model
- Extract text from async iterator
- Handle errors with cooldown

All three public functions build a prompt string, then call this helper.

### Reference Files
- **MUST follow this pattern exactly**: `src/daemon/summarize.ts`
- Env helper: `src/shared/env.ts` (exports `execEnv()`)
- Plan: `context/plan-companion.md` (WP3 section)
- Spec: `.claude/specs/companion.spec.md` (Commentary section, Voice Shaping section, Agent Naming section)

### Done Condition
- `src/daemon/companion-commentary.ts` exists with all 3 exported functions + CommentaryEvent type
- Follows summarize.ts fire-and-forget pattern exactly (cooldown, error handling, graceful degradation)
- Persona instruction embedded in commentary prompt
- Time-of-day personality modifier included
- Commentary frequency randomization implemented
- Nickname generation varies by mood+stat profile
- `npx tsc --noEmit` passes (may need companion-types.ts — that's fine, just ensure imports are correct)

Report clearly: what you built, the prompt templates you used, any design decisions.

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
