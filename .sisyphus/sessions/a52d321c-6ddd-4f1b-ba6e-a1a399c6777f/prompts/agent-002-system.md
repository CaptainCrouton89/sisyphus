# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: a52d321c-6ddd-4f1b-ba6e-a1a399c6777f
- **Your Task**: Add session metadata fields to enrich analytics and companion behavior.

## 1. Add fields to Session interface (src/shared/types.ts)
Add these optional fields to the Session interface:
- model?: string           — Model used for orchestrator
- sessionLabel?: string    — Human-friendly label  
- wallClockMs?: number     — Wall-clock duration (completedAt - createdAt)
- startHour?: number       — Hour of day 0-23 when session started
- startDayOfWeek?: number  — Day of week 0=Sun, 6=Sat
- launchConfig?: { model?: string; context?: string; orchestratorPrompt?: string; }

Note: Session already has `name?: string` which serves as the session label. Don't duplicate it. Skip adding sessionLabel. The key additions are: model, wallClockMs, startHour, startDayOfWeek, launchConfig.

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
- Don't modify protocol.ts — these are internal session state fields, not protocol additions

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
