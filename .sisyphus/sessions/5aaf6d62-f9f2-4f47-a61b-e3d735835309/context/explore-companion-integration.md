# Companion Integration Surface Exploration

## 1. session-manager.ts Hooks

**File**: `src/daemon/session-manager.ts`

### startSession() — Line 26
```ts
export async function startSession(task: string, cwd: string, context?: string, name?: string): Promise<Session>
```
- **Available data**: `sessionId` (UUID), `task`, `cwd`, `context`, `name`, `session` (from `state.createSession` at L39), `tmuxName`
- **Hook insertion point**: After L105 (`recomputeDots()`) / before L106 (`return`). Session is fully created, tmux is set up, tracking is active.
- **Companion use**: Trigger mood=`excited` or companion reaction to new session.

### handleComplete() — Line 445
```ts
export async function handleComplete(sessionId: string, cwd: string, report: string): Promise<void>
```
- **Available data**: `session` (L446, full Session object with agents, cycles), `report` string
- **Hook insertion point**: After L457 (`recomputeDots()`) / before L458 (`switchToHomeSession`). Session is marked completed, all cleanup done.
- **Companion use**: Trigger mood=`triumphant` or `exhausted`, XP accumulation, level check.

### handleSpawn() — Line 362
```ts
export async function handleSpawn(sessionId: string, cwd: string, agentType: string, name: string, instruction: string, repo?: string): Promise<{ agentId: string }>
```
- **Available data**: `session` (L374), `agent` (L380, returned from `spawnAgent`), `windowId`, all spawn params
- **Hook insertion point**: After L394 (`recomputeDots()`) / before L395 (`return`). Agent is spawned and registered.
- **Companion use**: Nickname assignment, mood reaction ("more workers!").

### handlePaneExited() — Line 602
```ts
export async function handlePaneExited(paneId: string, cwd: string, sessionId: string, role: 'orchestrator' | 'agent', agentId?: string): Promise<void>
```
- **Available data**: `session` (L609), `role`, `agentId`, `agent` (L614 for agent role)
- **Hook insertion points**:
  - Agent exit without submit: After L620 (`handleAgentKilled`), before allDone check. Companion mood=`worried`.
  - Orchestrator crash: After L637 (`orchestratorDone.add`). Companion mood=`alarmed`.

### handleSubmit() — Line 398
```ts
export async function handleSubmit(cwd: string, sessionId: string, agentId: string, report: string, windowId: string): Promise<void>
```
- **Available data**: `allDone` boolean (L399), `cwd`, `sessionId`, `agentId`, `report`
- **Hook insertion point**: After L400 (`recomputeDots()`) before L401 (`if (allDone)`).
- **Companion use**: React to agent completion, show brief flash.

---

## 2. pane-monitor.ts Poll Cycle

**File**: `src/daemon/pane-monitor.ts`

### Poll interval
- Default: **5000ms** (L19: `storedPollIntervalMs = 5000`, L111: `startMonitor(pollIntervalMs = 5000)`)
- Sleep-aware: L150-153 computes `increment` capped at `storedPollIntervalMs` if machine slept

### pollAllSessions() — Line 147
```ts
async function pollAllSessions(): Promise<void>
```
- Iterates `trackedSessions` (L155), calls `pollSession()` per session
- **Dots update**: L162 `onDotsUpdate?.()` — called after all sessions polled
- **Companion hook insertion**: After L162, before function end. This is where mood recompute and flash expiry should go. Data available: all tracked session IDs via `trackedSessions`, `increment` (elapsed ms).

### pollSession() — Line 165
```ts
async function pollSession(sessionId: string, cwd: string, windowId: string, increment: number): Promise<void>
```
- **Available data**: `session` (L168, full Session object), `livePanes` (L194), `livePaneIds` set, `orchPaneId`, `timerEntry` (active time accumulators)
- **Companion hook insertion**: After L240 (active time accumulation) — mood could be influenced by "how long agents have been running" (available via `timerEntry.agentMs`).

### writeStatusBar() call chain
- `writeStatusBar()` is in `status-bar.ts`, called from `status-dots.ts`'s `recomputeDots()`. 
- `recomputeDots()` is called: (1) by `onDotsUpdate` callback set in pane-monitor L162, and (2) directly from session-manager after state changes.

---

## 3. status-bar.ts

**File**: `src/daemon/status-bar.ts`

### writeStatusBar() — Line 97
```ts
export function writeStatusBar(): void
```

**Rendering pipeline**:
1. L98: `tmux.listAllPanes()` → get all pane IDs + session names
2. L99: `tmux.listAllSessions()` → get all session names
3. L104-115: Compute per-session Claude state (processing > stopped > idle)
4. L118-138: Separate normal vs sisyphus sessions
5. L141-143: Order sessions by `~/.config/tmux/session-order`
6. L145-156: Render tmux format strings for each session
7. L158: Join sections with `│` separator
8. L160: Write to `tmux.setGlobalOption('@sisyphus_status', rendered)`

**Companion insertion point**: After L156 (sisyphusParts built), before L158 (join). Add a `companionPart` string to `sections` array at L154-156:
```ts
const sections: string[] = [];
if (normalParts.length > 0) sections.push(normalParts.join(' '));
if (sisyphusParts.length > 0) sections.push(sisyphusParts.join(' '));
// NEW: if (companionPart) sections.push(companionPart);
```

**Constraint**: Output is a tmux format string. Companion rendering here must use tmux `#[fg=...]` color codes, not ANSI escapes.

---

## 4. TUI Tree Panel

**File**: `src/tui/panels/tree.ts`

### renderTreePanel() — Line 135
```ts
export function renderTreePanel(buf: FrameBuffer, rect: Rect, nodes: TreeNode[], cursorIndex: number, focused: boolean): void
```

**Rendering pattern**:
1. L144: `drawBorder(buf, x, y, w, h, ...)` — border around panel
2. L148-150: Inner dimensions: `innerX = x + 2`, `innerW = w - 4`, `innerY = y + 1`, `innerH = h - 2`
3. L165-170: Scroll logic with `maxVisible = innerH`
4. L194-239: Render visible nodes row by row
5. L242-246: Bottom scroll indicator

**Companion pinning point**: The companion should be rendered in the **last 1-2 rows of innerH**, reducing `maxVisible` by the companion height. Insert before L165 (scroll logic):
```ts
const companionHeight = 1; // single-line companion
const maxVisible = Math.max(1, innerH - companionHeight);
// ... existing scroll logic uses reduced maxVisible ...
// After L246 (bottom scroll indicator), render companion at:
const companionRow = y + h - 2; // last inner row before bottom border
writeClipped(buf, innerX, companionRow, companionString, innerW);
```

**Available width**: `innerW = w - 4` (panel width minus border and padding). Companion must fit in this width.

**Dependencies**: Uses `writeClipped(buf, x, y, text, maxWidth)` from `render.ts` for safe rendering.

---

## 5. TUI Overlays

**File**: `src/tui/panels/overlays.ts`

### Overlay pattern (Leader example) — Line 20
```ts
export function renderLeaderOverlay(buf: FrameBuffer, rows: number, cols: number): void
```

**Pattern**:
1. Compute overlay position and size (anchored to bottom-right for leader, centered for help)
2. `drawBorder(buf, x, y, width, height, color)` — colored border
3. Build `lines: string[]` array with content
4. Write each line via `writeClipped(buf, x + 1, y + 1 + i, lines[i]!, innerWidth)`

**Help overlay** (L74): centered, `HELP_WIDTH = 62`, dynamic height from content. Uses `helpRow()` for two-column layout.

**Companion overlay** would follow the same pattern:
```ts
export function renderCompanionOverlay(buf: FrameBuffer, rows: number, cols: number, companionState: CompanionState): void {
  // Center or position as desired
  drawBorder(buf, x, y, width, height, 'green');
  // Render companion stats, mood, level, etc.
  writeClipped(buf, x + 1, y + 1 + i, line, innerWidth);
}
```

**Note**: L88 already references `'c  claude companion'` in the help overlay content — the keybinding is already documented there.

---

## 6. TUI Input — Leader Keys

**File**: `src/tui/input.ts`

### Leader key dispatch — Line 715
```ts
function handleLeaderKey(input: string, key: Key, state: AppState, actions: InputActions): void
```
- `state.mode === 'leader'` block: L716-735
- Keys registered: y, d, l, o, /, a, m, ?, !, j, k, q, 1-9

**'c' is NOT in the leader menu** — it's a **top-level keybinding** (not behind space/leader). See L991-998:
```ts
// c: open companion pane
if (input === 'c') {
    actions.openCompanionPane(state.cwd);
    ...
}
```

This is in the main `handleNormalKey` flow (non-leader, non-compose mode). To add `leader + c` for a companion overlay, add to the leader block at L716-735:
```ts
if (input === 'c') { /* open companion overlay */ return; }
```

The `LeaderAction` type (L24-42) would need a new variant: `| { type: 'companion-overlay' }`.

**Current modes** (from `state.ts`): leader, copy-menu, help, normal, search, compose, confirm, input.

---

## 7. Agent Type — shared/types.ts

**File**: `src/shared/types.ts`

### Agent interface — Line 47-65
```ts
export interface Agent {
  id: string;
  name: string;
  agentType: string;
  provider?: Provider;
  claudeSessionId?: string;
  color: string;
  instruction: string;
  status: AgentStatus;
  spawnedAt: string;
  completedAt: string | null;
  activeMs: number;
  reports: AgentReport[];
  paneId: string;
  repo: string;
  killedReason?: string;
  resumeEnv?: string;
  resumeArgs?: string;
}
```

**Confirmed: No `nickname` field exists.** To add:
```ts
nickname?: string;  // Companion-assigned nickname
```

Add after `name` (L49) for logical grouping. This is a serialized type (persisted in state.json), so existing sessions will have `undefined` — optional field is safe.

---

## 8. Existing Companion Infrastructure

### companion-context.ts (CLI command)
**File**: `src/cli/commands/companion-context.ts` (L1-13)
- Registers `sisyphus companion-context --cwd <path>` CLI command
- Calls `buildCompanionContext(cwd)` and outputs `{ additionalContext: <xml> }` as JSON to stdout
- Used by the companion plugin's hook

### buildCompanionContext() (context builder)
**File**: `src/tui/lib/context.ts` (L22-105)
- Builds XML summarizing all sessions (≤7 days old)
- Per session: id, name, status, task, created, cycles, agents (status counts), goal (first line), roadmap todos (up to 5)
- Completed sessions include truncated completion report (300 chars)

### openCompanionPane() (tmux helper)
**File**: `src/tui/lib/tmux.ts` (L58-87)
- Splits pane horizontally (33% width) running Claude with `--dangerously-skip-permissions`
- Sets `SISYPHUS_COMPANION_CWD` env var
- Installs companion plugin from `templates/companion-plugin/` to `~/.sisyphus/companion-plugin/`
- Renders `dashboard-claude.md` template with `{{CWD}}` replacement
- Caches `companionPaneId` module-level; reuses if pane still alive
- **No auto-detection of external pane kills** — manual `companionPaneId = null` required

### Companion Plugin
**File**: `templates/companion-plugin/.claude-plugin/plugin.json` — Just `{"name": "sisyphus-companion", "version": "1.0.0"}`
**File**: `templates/companion-plugin/hooks/user-prompt-context.sh` — Calls `sisyphus companion-context --cwd $SISYPHUS_COMPANION_CWD`

### Dashboard prompt template
**File**: `templates/dashboard-claude.md` — Contains `{{CWD}}` and `{{SESSIONS_CONTEXT}}` placeholders, guides Claude as a session management assistant.

### TUI keybinding
**File**: `src/tui/input.ts:991-998` — Top-level `c` key opens companion pane via `actions.openCompanionPane(state.cwd)`

### Help overlay reference
**File**: `src/tui/panels/overlays.ts:88` — Already lists `c  claude companion` in help text

---

## Summary of Integration Points

| Surface | File | Line | Hook Type | Data Available |
|---------|------|------|-----------|----------------|
| Session start | session-manager.ts | ~105 | Event | session, task, cwd |
| Session complete | session-manager.ts | ~457 | Event | session, report |
| Agent spawn | session-manager.ts | ~394 | Event | session, agent, agentType |
| Agent submit | session-manager.ts | ~400 | Event | agentId, report, allDone |
| Pane exit (agent) | session-manager.ts | ~620 | Event | session, agent |
| Pane exit (orch) | session-manager.ts | ~637 | Event | session |
| Poll cycle | pane-monitor.ts | ~162 | Periodic (5s) | all tracked sessions, increment |
| Status bar | status-bar.ts | ~156 | Render | tmux format string sections |
| Tree panel | tree.ts | ~165 | Render | buf, rect, innerW, innerH |
| Overlay | overlays.ts | new fn | Render | buf, rows, cols |
| Leader key | input.ts | ~716 | Input | state, actions |
| Top-level key | input.ts | ~991 | Input | state, actions |
| Agent type | types.ts | ~47 | Schema | Agent interface |
