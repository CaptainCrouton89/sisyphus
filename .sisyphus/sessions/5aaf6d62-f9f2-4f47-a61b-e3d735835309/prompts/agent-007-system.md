# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: 5aaf6d62-f9f2-4f47-a61b-e3d735835309
- **Your Task**: ## Goal
Add a `sisyphus companion` CLI command that shows the full companion profile.

## Context Files
- Read `context/plan-companion.md` section "WP5: CLI Command" for requirements
- Read `src/cli/CLAUDE.md` and `src/cli/commands/CLAUDE.md` for CLI conventions
- Read `src/daemon/CLAUDE.md` for daemon conventions

## Overall Session Goal
Implement a persistent ASCII companion character inside sisyphus that accumulates stats, levels up, earns achievements.

## Your Task: Create the CLI companion command

### 1. Add protocol types in `src/shared/protocol.ts`

Add to the Request union:
```typescript
| { type: 'companion'; name?: string }
```

The Response type already supports `{ ok: true; data?: Record<string, unknown> }` which is sufficient.

### 2. Create `src/cli/commands/companion.ts`

Pattern follows existing commands (see `companion-context.ts` for a simple example).

```typescript
import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { renderCompanion } from '../../shared/companion-render.js';
import { ACHIEVEMENTS } from '../../daemon/companion.js';
import type { CompanionState } from '../../shared/companion-types.js';

export function registerCompanion(program: Command): void {
  program
    .command('companion')
    .description('Show companion profile and stats')
    .option('--name <name>', 'Set companion name')
    .action(async (opts: { name?: string }) => {
      const res = await sendRequest({ type: 'companion', name: opts.name });
      if (!res.ok) {
        console.error(res.error);
        process.exit(1);
      }
      const companion = res.data as unknown as CompanionState;
      
      // Render full profile
      const face = renderCompanion(companion, ['face', 'boulder'], { color: true });
      console.log(face);
      console.log(`Level ${companion.level} — ${companion.title}`);
      console.log(`Mood: ${companion.mood}`);
      console.log(`XP: ${companion.xp}`);
      console.log();
      
      // Stats
      const s = companion.stats;
      const endH = Math.floor(s.endurance / 3_600_000);
      const patH = Math.floor(s.patience / 3_600_000);
      console.log('Stats:');
      console.log(`  Strength:  ${s.strength} sessions`);
      console.log(`  Endurance: ${endH}h`);
      console.log(`  Wisdom:    ${s.wisdom}`);
      console.log(`  Luck:      ${Math.round(s.luck * 100)}%`);
      console.log(`  Patience:  ${patH}h`);
      console.log();
      
      // Achievements
      const unlocked = new Set(companion.achievements.map(a => a.id));
      console.log(`Achievements (${companion.achievements.length}/${ACHIEVEMENTS.length}):`);
      for (const def of ACHIEVEMENTS) {
        const icon = unlocked.has(def.id) ? '✓' : '·';
        console.log(`  ${icon} ${def.name} — ${def.description}`);
      }
      console.log();
      
      // Repos
      const repos = Object.entries(companion.repos);
      if (repos.length > 0) {
        console.log('Repositories:');
        for (const [path, mem] of repos.slice(0, 10)) {
          const nick = mem.nickname ? ` "${mem.nickname}"` : '';
          console.log(`  ${path}${nick} — ${mem.visits} visits, ${mem.completions} completions`);
        }
      }
      
      // Commentary
      if (companion.lastCommentary) {
        console.log();
        console.log(`"${companion.lastCommentary.text}"`);
      }
    });
}
```

Adapt and improve this — it's a starting point. Use color formatting consistent with other sisyphus CLI commands.

### 3. Register in `src/cli/index.ts`

Add import and register call:
```typescript
import { registerCompanion } from './commands/companion.js';
// ... in the registration block:
registerCompanion(program);
```

### 4. Handle in `src/daemon/server.ts`

Add handler for `'companion'` request type. Find where other request types are handled (in the `handleRequest` function) and add:

```typescript
case 'companion': {
  const companion = loadCompanion();
  if (req.name) {
    companion.name = req.name;
    saveCompanion(companion);
  }
  return { ok: true, data: companion as unknown as Record<string, unknown> };
}
```

Import `loadCompanion`, `saveCompanion` from `./companion.js`.

## Important Constraints
- Follow existing CLI command patterns exactly (registration, sendRequest, error handling)
- The ACHIEVEMENTS import from daemon is just for display — don't import other daemon internals
- The companion state is returned as the full CompanionState object in the data field
- Color output should work in terminal (ANSI escapes, not tmux format)

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
