#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export SISYPHUS_AGENT_ID='agent-007' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-007-plugin" --agent 'devcore:programmer' --session-id "c250a90e-7b9e-4e7c-91ec-a4f7437d19c1" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:companion wp5-cli-command-devcore:programmer c4' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/5aaf6d62-f9f2-4f47-a61b-e3d735835309/prompts/agent-007-system.md')" '## Goal
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
| { type: '\''companion'\''; name?: string }
```

The Response type already supports `{ ok: true; data?: Record<string, unknown> }` which is sufficient.

### 2. Create `src/cli/commands/companion.ts`

Pattern follows existing commands (see `companion-context.ts` for a simple example).

```typescript
import type { Command } from '\''commander'\'';
import { sendRequest } from '\''../client.js'\'';
import { renderCompanion } from '\''../../shared/companion-render.js'\'';
import { ACHIEVEMENTS } from '\''../../daemon/companion.js'\'';
import type { CompanionState } from '\''../../shared/companion-types.js'\'';

export function registerCompanion(program: Command): void {
  program
    .command('\''companion'\'')
    .description('\''Show companion profile and stats'\'')
    .option('\''--name <name>'\'', '\''Set companion name'\'')
    .action(async (opts: { name?: string }) => {
      const res = await sendRequest({ type: '\''companion'\'', name: opts.name });
      if (!res.ok) {
        console.error(res.error);
        process.exit(1);
      }
      const companion = res.data as unknown as CompanionState;
      
      // Render full profile
      const face = renderCompanion(companion, ['\''face'\'', '\''boulder'\''], { color: true });
      console.log(face);
      console.log(`Level ${companion.level} — ${companion.title}`);
      console.log(`Mood: ${companion.mood}`);
      console.log(`XP: ${companion.xp}`);
      console.log();
      
      // Stats
      const s = companion.stats;
      const endH = Math.floor(s.endurance / 3_600_000);
      const patH = Math.floor(s.patience / 3_600_000);
      console.log('\''Stats:'\'');
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
        const icon = unlocked.has(def.id) ? '\''✓'\'' : '\''·'\'';
        console.log(`  ${icon} ${def.name} — ${def.description}`);
      }
      console.log();
      
      // Repos
      const repos = Object.entries(companion.repos);
      if (repos.length > 0) {
        console.log('\''Repositories:'\'');
        for (const [path, mem] of repos.slice(0, 10)) {
          const nick = mem.nickname ? ` "${mem.nickname}"` : '\'''\'';
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

Adapt and improve this — it'\''s a starting point. Use color formatting consistent with other sisyphus CLI commands.

### 3. Register in `src/cli/index.ts`

Add import and register call:
```typescript
import { registerCompanion } from '\''./commands/companion.js'\'';
// ... in the registration block:
registerCompanion(program);
```

### 4. Handle in `src/daemon/server.ts`

Add handler for `'\''companion'\''` request type. Find where other request types are handled (in the `handleRequest` function) and add:

```typescript
case '\''companion'\'': {
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
- The ACHIEVEMENTS import from daemon is just for display — don'\''t import other daemon internals
- The companion state is returned as the full CompanionState object in the data field
- Color output should work in terminal (ANSI escapes, not tmux format)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2382