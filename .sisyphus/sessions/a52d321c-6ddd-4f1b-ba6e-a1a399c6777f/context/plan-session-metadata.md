# Session Metadata Enrichment Plan

## New fields on `Session` (src/shared/types.ts)

```ts
interface Session {
  // ... existing fields ...
  model?: string;           // Model used for orchestrator (e.g. 'claude-opus-4-5')
  sessionLabel?: string;    // Human-friendly label (auto-generated or user-provided)
  wallClockMs?: number;     // Total wall-clock duration (completedAt - createdAt in ms)
  startHour?: number;       // Hour of day (0-23) when session started (for quick analytics)
  startDayOfWeek?: number;  // Day of week (0=Sun, 6=Sat)
  launchConfig?: {          // Original launch parameters preserved for resume/analytics
    model?: string;
    context?: string;
    orchestratorPrompt?: string;
  };
}
```

## Where to populate

### `model`
- **session-manager.ts → `startSession()`** — read from config at session start time, save to state
- Source: `loadConfig(cwd).model` or the model arg passed to start

### `sessionLabel`
- **session-manager.ts → `startSession()`** — the `name` option passed to `sisyphus start --name`
- Already stored as `session.name` but `sessionLabel` in the type is unused. Use `name` field (already exists).

### `wallClockMs`
- **session-manager.ts → `handleComplete()`** — compute `Date.now() - new Date(session.createdAt).getTime()` at completion
- Only set on completion (not on kill)

### `startHour` and `startDayOfWeek`
- **state.ts → `createSession()`** — compute from `createdAt` at creation time
- Redundant with createdAt but enables fast filtering without date parsing

### `launchConfig`
- **session-manager.ts → `startSession()`** — capture the config snapshot used at launch
- Already partially done via `session.context` but this preserves model + prompt path

## Backwards compatibility
- All new fields are optional (`?`) — existing sessions deserialize cleanly
- No migration needed
- Old sessions just won't have these fields

## Files to modify:
- `src/shared/types.ts` — add fields to Session interface
- `src/daemon/state.ts` — populate startHour/startDayOfWeek in createSession
- `src/daemon/session-manager.ts` — populate model, wallClockMs, launchConfig
