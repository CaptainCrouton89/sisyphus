# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 9a02cc3c-c228-4c4a-893c-9036fcac354f
- **Your Task**: Apply the companion recalibration spec to TWO files: `src/shared/companion-render.ts` and `src/shared/companion-types.ts`.

Read `.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/recalibration-spec.md` first.

## File 1: src/shared/companion-render.ts

### Boulder Form (getBoulderForm function)
Change the boulder sizing from 4 tiers to 6 tiers based on real data percentiles:

```typescript
export function getBoulderForm(agentCount?: number, repoNickname?: string): string {
  let boulder: string;
  if (agentCount === undefined || agentCount <= 0) {
    boulder = '.';
  } else if (agentCount <= 1) {
    boulder = 'o';
  } else if (agentCount <= 4) {
    boulder = 'O';
  } else if (agentCount <= 9) {
    boulder = '◉';
  } else if (agentCount <= 20) {
    boulder = '@';
  } else {
    boulder = '@@';
  }
  if (repoNickname !== undefined) {
    boulder = `${boulder} "${repoNickname}"`;
  }
  return boulder;
}
```

### Stat Cosmetics (getStatCosmetics function)
Lower the thresholds:

```typescript
export function getStatCosmetics(stats: CompanionStats): string[] {
  const cosmetics: string[] = [];
  if (stats.wisdom > 5) cosmetics.push('wisps');       // was > 15
  if (stats.endurance > 36_000_000) cosmetics.push('trail');   // was > 180_000_000 (10h vs 50h)
  if (stats.luck > 0.6) cosmetics.push('sparkle');     // was > 0.7
  if (stats.patience > 36_000_000) cosmetics.push('zen-prefix'); // was > 180_000_000 (10h vs 50h)
  return cosmetics;
}
```

### Base Form (getBaseForm function) — keep as-is, no changes needed.

## File 2: src/shared/companion-types.ts

### Extend MoodSignals with new fields

Add these optional fields to the MoodSignals interface:

```typescript
export interface MoodSignals {
  recentCrashes: number;
  idleDurationMs: number;
  sessionLengthMs: number;
  cleanStreak: number;
  justCompleted: boolean;
  justCrashed: boolean;
  justLeveledUp: boolean;
  hourOfDay: number;
  activeAgentCount?: number;
  // NEW fields for richer mood scoring
  cycleCount?: number;              // current session orchestrator cycle count
  sessionsCompletedToday?: number;  // sessions completed today
}
```

That's it for types — just add the two new optional fields to MoodSignals.

Do NOT modify any other types or interfaces. Preserve all existing exports.

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
