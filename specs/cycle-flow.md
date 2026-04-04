# Cycle Flow Visualization — Spec

Adds a pipeline diagram to the session-level detail panel showing the current cycle's flow as a vertical ASCII graph with orchestrator, agent, and yield-prompt nodes.

## Phase Model

The session lifecycle is a repeating sequence of phases:

```
orchestrator → agents → yield → orchestrator → agents → yield → …
```

The diagram shows a **3-phase sliding window**: the previous phase (dim), the current phase (bright), and the next phase (dotted/planned).

| Current state | Previous (dim) | Current (bright) | Next (dotted) |
|---|---|---|---|
| Agents running | Orchestrator node | Agent boxes | Yield placeholder |
| Orchestrator running | Yield prompt | Orchestrator node | Agent placeholder |
| All agents done, between cycles | Agent boxes (slightly dim) | Yield prompt (solid) | "spawning orchestrator…" |
| First cycle, orchestrator running | *(nothing)* | Orchestrator node | Agent placeholder |
| Session completed | Last agents (dim) | `◉ complete` node | *(nothing)* |

## Visual Language

### Brightness encodes time

- **Bright / bold**: active right now
- **Dim** (ANSI dim, `\x1b[2m`): completed, in the past
- **Dotted outline** (`┊ ╌ ╌ ╌ ┊` with spaces): planned, hasn't happened yet

### Background tints encode identity

Every node gets a dark ANSI background tint via `\x1b[48;2;R;G;Bm`:

| Node type | BG tint (approx RGB on dark terminal) |
|---|---|
| Orchestrator | Yellow — `rgb(40, 35, 20)` |
| Agent (blue) | `rgb(20, 25, 45)` |
| Agent (green) | `rgb(20, 35, 20)` |
| Agent (magenta) | `rgb(30, 22, 40)` |
| Agent (cyan) | `rgb(18, 30, 38)` |
| Agent (red — error) | `rgb(40, 20, 22)` |
| Yield prompt | Gray — `rgb(25, 26, 32)` |

These are dark enough for text legibility. Agent bg color matches the agent's assigned ANSI color. Exact values should be tuned in-terminal.

### Status icons

```
● orchestrator running     ▶ agent running
○ orchestrator done        ✓ agent completed
                           ✕ killed   ! crashed   ? lost
```

### Mode colors (on orchestrator nodes)

`plan` = blue, `impl` = green, `strat` = yellow, `valid` = magenta. Uses existing `modeColor()`.

## Layout

### Orchestrator node

Full-width box with yellow border (bright) or dim border (past). Interior has bg tint. Single line content.

```
╭──────────────────────────────────────╮
│ ● C2  impl              running      │   ← bg-yellow tint
╰──────────────┬───────────────────────╯
```

When dim (previous phase), shows duration and time instead of "running":

```
╭──────────────────────────────────────╮
│ ○ C2  impl              22m   10:14  │   ← dim, bg-yellow tint
╰──────────────┬───────────────────────╯
```

### Agent boxes

Fixed-width boxes, max 3 per row. Each box has the agent's assigned color as border AND bg tint. Three content lines: status+id, name/type, duration.

```
╭────┴─────╮
│ ▶ a-004  │   ← line 1: icon + agent id
│ backend  │   ← line 2: agent display name (agentDisplayName())
│ 12m      │   ← line 3: duration (or "0m" if just spawned)
╰────┬─────╯
```

Box interior gets the agent's bg tint. Completed agents: border stays agent color, content dims. Error agents (killed/crashed): border and content turn red, duration line shows status tag (`6m kill`, `3m crash`).

**Box width**: `floor((panelWidth - 4) / 3)` for up to 3 boxes. Minimum 10 chars inner width. Agent name truncated to fit.

**Wrapping**: When >3 agents, overflow wraps to a new row left-aligned. Only the first row gets the `┌──┼──┐` branch connector from the orchestrator above. Subsequent rows are flush-left with no connector — proximity to the group implies membership.

### Connectors

Branch connectors use T-junctions built into box borders:

```
╰──────────────┬───────────────────────╯   ← orchestrator bottom has ┬
               │
      ┌────────┼────────┐                  ← horizontal branch
╭─────┴────╮╭──┴───────╮╭─────┴────╮      ← agent tops have ┴
```

Fan-in (below agents, before yield):

```
╰────┬─────╯╰────┬─────╯╰────┬─────╯      ← agent bottoms have ┬
     └────────────┼────────────┘            ← merge line
                  │
```

No free-floating `│` lines with blank lines around them. Connectors flow directly between box edges.

### Yield prompt node

**When known** (all agents done, prompt text available): solid border in yellow, gray bg tint, dim text.

```
╭──────────────────────────────────────╮
│ Validate all auth endpoints and run  │   ← bg-gray tint, dim text
│ compliance checker suite             │
╰──────────────────────────────────────╯
```

**When unknown** (agents still running): dashed placeholder.

```
┊ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ┊
┊  awaiting agents…                     ┊   ← bg-gray tint, dim
┊ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ╌ ┊
```

The `╌` characters are **space-separated** (`╌ ╌ ╌` not `╌╌╌`). This avoids the glyph-gap problem where `╌` doesn't connect flush in monospace fonts. The spaces make the dotted pattern intentional.

### Complete node

Terminal state for completed sessions:

```
╭──────────────────────────────────────╮
│ ◉ complete               34m total   │   ← cyan border, bold
╰──────────────────────────────────────╯
```

## Data Mapping

### Determining the current phase

```typescript
function getCurrentPhase(session: Session): 'orchestrator' | 'agents' | 'between' | 'complete' {
  if (session.status === 'completed') return 'complete';
  const cycles = session.orchestratorCycles;
  if (cycles.length === 0) return 'orchestrator'; // waiting for first cycle
  const lastCycle = cycles[cycles.length - 1]!;
  const cycleAgents = session.agents.filter(a => lastCycle.agentsSpawned.includes(a.id));
  
  if (!lastCycle.completedAt) {
    // Orchestrator still running, or just finished and spawned agents
    return cycleAgents.length > 0 ? 'agents' : 'orchestrator';
  }
  
  // Orchestrator completed this cycle
  const allDone = cycleAgents.every(a => a.status !== 'running');
  if (cycleAgents.length > 0 && !allDone) return 'agents';
  if (cycleAgents.length > 0 && allDone && lastCycle.nextPrompt) return 'between';
  return 'orchestrator'; // fallback
}
```

### Building the 3-phase window

From `session.orchestratorCycles` and `session.agents`:

- **Current cycle**: `cycles[cycles.length - 1]`
- **Previous cycle**: `cycles[cycles.length - 2]` (if exists)
- **Cycle agents**: `session.agents.filter(a => cycle.agentsSpawned.includes(a.id))`
- **Yield prompt**: `cycle.nextPrompt` (null until orchestrator yields)
- **Mode**: `cycle.mode` (planning, implementation, strategy, validation)

## Keybind

`F` (uppercase) in navigate mode when cursor is on a session node toggles `state.flowExpanded: boolean`. When expanded, all cycles render (older ones at deeper dim). When collapsed, only the 3-phase window shows. Default: collapsed.

The `[F] full` / `[F] collapse` hint shows inline next to the section header.

Add `flowExpanded` to `AppState` (default `false`). Reset to `false` on session change.

## Integration

### Where it renders

In `buildSessionLines()` in `src/tui/panels/detail.ts`. The cycle flow section replaces (or is inserted before) the existing `▎ ⟳ CYCLES` section. Header: `▎ ◈ CYCLE FLOW`.

### New function

```typescript
function buildCycleFlowLines(
  session: Session,
  width: number,
  expanded: boolean,
): DetailLine[]
```

Returns `DetailLine[]` (array of `Seg[]`). Called from `buildSessionLines()`.

### Background tints

The `Seg` type needs a `bg` field (optional string) for ANSI background color. `renderLine()` in `format.ts` emits `\x1b[48;2;R;G;Bm` when `bg` is set and `\x1b[49m` to reset.

Define a map of bg tint RGB values:

```typescript
const BG_TINTS: Record<string, string> = {
  yellow:  '48;2;40;35;20',
  blue:    '48;2;20;25;45',
  green:   '48;2;20;35;20',
  magenta: '48;2;30;22;40',
  cyan:    '48;2;18;30;38',
  red:     '48;2;40;20;22',
  gray:    '48;2;25;26;32',
};
```

### Box rendering helper

```typescript
function buildAgentBoxRows(
  agents: Agent[],
  boxWidth: number,
  maxPerRow: number,  // 3
): DetailLine[]
```

Produces the box rows for all agents, handling wrapping. Each box is `boxWidth` chars. Boxes are adjacent (no gap between them).

### Connector rendering helper

```typescript
function buildBranchConnector(
  boxWidth: number,
  count: number,      // agents in this row (1-3)
  totalWidth: number,  // panel content width
  direction: 'down' | 'up',
): DetailLine[]
```

Produces the `┌──┼──┐` / `└──┼──┘` connector line, with T-junction positions calculated from box centers.

## Rendering Constraints

- All output is `DetailLine[]` (Seg arrays) — no raw ANSI string construction
- Box width is uniform within a row
- Connector T-junction positions must be exact character offsets — measure with `stringWidth()` not `.length`
- Background tint resets (`\x1b[49m`) must happen at end of every tinted span to prevent bleed
- Dim previous-phase nodes: apply `dim: true` to all segs in those lines
- Dotted placeholder: `┊` and `╌` are regular characters (no special width), safe in all monospace fonts
- The cycle flow section is scrollable with the rest of the detail panel via `detailScroll`
