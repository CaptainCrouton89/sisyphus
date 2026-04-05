#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-002-plugin" --agent 'devcore:programmer' --session-id "22d14914-1ca0-463d-b1ac-33865ab99e79" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-threshold-metadata-an session-metadata-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/a52d321c-6ddd-4f1b-ba6e-a1a399c6777f/prompts/agent-002-system.md')" 'Add session metadata fields to enrich analytics and companion behavior.

## 1. Add fields to Session interface (src/shared/types.ts)
Add these optional fields to the Session interface:
- model?: string           — Model used for orchestrator
- sessionLabel?: string    — Human-friendly label  
- wallClockMs?: number     — Wall-clock duration (completedAt - createdAt)
- startHour?: number       — Hour of day 0-23 when session started
- startDayOfWeek?: number  — Day of week 0=Sun, 6=Sat
- launchConfig?: { model?: string; context?: string; orchestratorPrompt?: string; }

Note: Session already has `name?: string` which serves as the session label. Don'\''t duplicate it. Skip adding sessionLabel. The key additions are: model, wallClockMs, startHour, startDayOfWeek, launchConfig.

## 2. Populate startHour and startDayOfWeek (src/daemon/state.ts)
In the createSession function, compute from the createdAt timestamp:
```ts
const created = new Date(createdAt);
startHour: created.getHours(),
startDayOfWeek: created.getDay(),
```

## 3. Populate model and launchConfig (src/daemon/session-manager.ts)
In startSession(), after creating the session, update it with:
- model: from the config (loadConfig(cwd).model or the default)
- launchConfig: { model, context (from the start request), orchestratorPrompt (from config) }

Look at how startSession receives its parameters to find the right values. The config is loaded via loadConfig(). The start request has task, context, name fields.

## 4. Populate wallClockMs (src/daemon/session-manager.ts)
In handleComplete(), compute wallClockMs before saving:
```ts
const wallClockMs = Date.now() - new Date(session.createdAt).getTime();
```
Save it to the session state.

## Important
- All new fields are optional — existing sessions must continue to load correctly
- Read each file before modifying
- Follow existing code patterns (e.g., use state.updateSession for mutations)
- Don'\''t modify protocol.ts — these are internal session state fields, not protocol additions'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2434