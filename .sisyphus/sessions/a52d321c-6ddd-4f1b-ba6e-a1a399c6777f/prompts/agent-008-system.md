# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: a52d321c-6ddd-4f1b-ba6e-a1a399c6777f
- **Your Task**: Two changes to the companion stats system:

## 1. Remove `luck` stat entirely

Remove `luck` from everywhere:

**`src/shared/companion-types.ts`**:
- Remove `luck: number` from `CompanionStats` interface (and its comment)

**`src/daemon/companion.ts`**:
- Remove `luck: 0` from `createCompanion()` initial stats
- Remove `luckXP` term from `computeXP()` — just delete the line and remove from the return sum
- Remove luck accumulation from `onSessionComplete()` — delete the `companion.stats.luck = ...` line and the `total` variable
- Remove any luck references in mood scoring (check `computeMood` for luck usage — there shouldn't be any but verify)

**`src/shared/companion-render.ts`**:
- Remove `if (stats.luck > 0.6) cosmetics.push('sparkle')` from `getStatCosmetics()`
- Remove luck from the stat summary string in `formatStatLine()` — change from `STR:${stats.strength} END:${endH}h WIS:${stats.wisdom} LCK:${luckPct}% PAT:${Math.floor(stats.patience / 3_600_000)}h` to `STR:${stats.strength} END:${endH}h WIS:${stats.wisdom} PAT:${Math.floor(stats.patience / 3_600_000)}h`
- Remove the `luckPct` variable

**`src/daemon/companion-commentary.ts`**:
- Remove `Luck: ${stats.luck}` from both prompt templates (the "Strength: ..., Endurance: ..., ..." lines)
- Remove the nickname style rule: `if (mood === 'happy' && stats.luck > 7) return 'lucky names (Charm, Ace, Windfall, Clover)';`
- Remove "Happy + high luck: optimistic" from the companion personality description in generateCommentary

**`src/tui/panels/overlays.ts`**:
- Remove `luckPct` variable and `lckBar` from the profile overlay
- Remove the `LCK` line from `contentLines`
- Update `statBar` calls — there should be 4 remaining (STR, END, WIS, PAT)

**`src/__tests__/companion.test.ts`**:
- Remove any assertions on `stats.luck`
- If there's a test for luck accumulation, remove it

**`src/__tests__/companion-render.test.ts`**:
- Remove `sparkle` from any cosmetic threshold tests
- Remove luck from stat line assertions

## 2. Fix `patience` accumulation

In `src/daemon/companion.ts` → `onSessionComplete()`, add patience accumulation AFTER the existing `companion.stats.strength++` block:

```typescript
// Patience: persistence through complex sessions
const cycleCount = session.orchestratorCycles?.length ?? 0;
companion.stats.patience += cycleCount;
// Bonus for sessions that went through full lifecycle
const modes = new Set((session.orchestratorCycles ?? []).map(c => c.mode));
if (modes.has('validation')) companion.stats.patience += 3;
if (modes.has('completion')) companion.stats.patience += 2;
```

Also update `src/shared/companion-types.ts` — change the patience comment from `// lifetime idle ms (daemon uptime - active time)` to `// persistence score (cycles + lifecycle bonuses)`

Also update patience-related thresholds to match the new unit (it's now a count, not milliseconds):
- In `src/shared/companion-render.ts` `getStatCosmetics()`: change `stats.patience > 36_000_000` to `stats.patience > 50` (zen-prefix unlocks after ~50 patience points, roughly 5-6 full-lifecycle sessions)
- In `src/daemon/companion.ts` `computeMood()`: change `const patienceHours = companion.stats.patience / 3_600_000; if (patienceHours > 20) scores.zen += 15;` to `if (companion.stats.patience > 30) scores.zen += 15;`
- In `src/daemon/companion.ts` `computeXP()`: change `const patienceXP = (stats.patience / 3_600_000) * 8;` to `const patienceXP = stats.patience * 5;` (5 XP per patience point)

In `src/shared/companion-render.ts` `formatStatLine()`: patience is now a plain number, not hours. Change `PAT:${Math.floor(stats.patience / 3_600_000)}h` to just `PAT:${stats.patience}`

In `src/tui/panels/overlays.ts`: remove the `patH = Math.floor(companion.stats.patience / 3_600_000)` conversion — use `companion.stats.patience` directly. Update the stat bar max from 200 to 200 (keep it). Update the display line from `PAT ${String(patH + 'h').padStart(4)}` to `PAT ${String(companion.stats.patience).padStart(4)}`.

In `src/daemon/companion-commentary.ts`: the Patience value in prompts will now be a small integer (not ms). This is fine — just make sure the prompt text makes sense. Update commentary personality: change "Low patience + frustrated: blunt" to "Low patience: impatient and blunt" (patience is now a persistence score, not idle time).

After all changes: run `npm run build` and `npm test` to verify everything passes. Fix any TypeScript errors from the luck removal.

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
