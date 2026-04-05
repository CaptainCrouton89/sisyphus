# Session Cloning Requirements

Defines the behavioral requirements for `sisyphus clone "goal"` — a command that duplicates a running session with a new ID and goal. The clone is a true fork: it inherits the full session history (context, prompts, reports, snapshots, cycle history) but diverges with a new goal and trajectory. No parent-child relationship, no cross-session communication.

## CLI Command (REQ-001 through REQ-003)

| # | Requirement | EARS Pattern |
|---|-------------|-------------|
| REQ-001 | Clone command invocation | WHEN user runs `sisyphus clone "goal"`, the system SHALL read SISYPHUS_SESSION_ID from env, send clone request to daemon, print guidance output |
| REQ-002 | Optional flags | WHERE user provides flags: `-c, --context` (background context), `--strategy` (copy strategy.md), `-n, --name` (session name) |
| REQ-003 | Missing session ID error | IF SISYPHUS_SESSION_ID not set, THEN system SHALL print error and exit code 1 |

**Key decisions:**
- Command name: `clone`
- Goal is always the positional arg, `--context` is supplementary background info (same as `start --context`)

## Session Cloning Mechanics (REQ-004 through REQ-009)

The clone is a TRUE DUPLICATION. Same memory, new trajectory.

**What gets copied (with session ID replacement):**
- `context/` — accumulated knowledge
- `prompts/` — previous prompt history
- `reports/` — previous agent reports
- `snapshots/` — cycle snapshots
- `strategy.md` — only with `--strategy` flag

**What's new:**
- `goal.md` — new goal from positional arg
- `roadmap.md` — seed template (clone builds its own)
- `logs/` — fresh, with clone event log entry
- `state.json` — new ID and task, but orchestratorCycles/agents/messages preserved from source

| # | Requirement | EARS Pattern |
|---|-------------|-------------|
| REQ-004 | Context directory copying | WHEN daemon processes clone, SHALL recursively copy context/ |
| REQ-005 | Session ID replacement | WHEN files are copied, SHALL replace source ID with clone ID in all text files |
| REQ-006 | Goal file creation | WHEN clone dir created, SHALL write new goal to goal.md |
| REQ-007 | Forked state initialization | WHEN clone registered, SHALL create state.json with new UUID/task, preserving cycle/agent/message history, reset activeMs |
| REQ-008 | Session history directories copied | WHEN clone dir created, SHALL copy prompts/reports/snapshots, create fresh logs/ with clone event |
| REQ-009 | Optional strategy copying | WHERE --strategy provided, SHALL copy strategy.md from source |

## Clone Startup & Orientation (REQ-010 through REQ-012)

The clone spawns at cycle N+1 in strategy mode with full history awareness.

| # | Requirement | EARS Pattern |
|---|-------------|-------------|
| REQ-010 | Orchestrator in strategy mode | WHEN clone initialized, SHALL spawn orchestrator in strategy mode at next cycle number |
| REQ-011 | Programmatic orientation | WHEN orchestrator spawns, SHALL provide context explaining this is a cloned session with inherited history |
| REQ-012 | Context passthrough | WHERE --context provided, SHALL pass text as additional background alongside programmatic orientation |

## Output Design (REQ-013, REQ-015)

"Every output is a prompt." No monitor commands, no file details.

| # | Requirement | EARS Pattern |
|---|-------------|-------------|
| REQ-013 | Handoff confirmation + behavioral guidance | WHEN clone succeeds, SHALL confirm handoff with guidance: "This is the other session's responsibility. You do not need to monitor it." |
| REQ-015 | Next-step instructions | WHEN clone succeeds, SHALL instruct orchestrator to update goal.md, roadmap.md, strategy.md to remove cloned scope |

## Edge Cases & Error Handling (REQ-017 through REQ-023)

| # | Requirement | EARS Pattern |
|---|-------------|-------------|
| REQ-017 | Clone from active session | WHEN clone from active, SHALL proceed regardless of running agents |
| REQ-018 | Clone from paused session | WHEN clone from paused, SHALL proceed normally; source stays paused |
| REQ-019 | Clone from completed rejected | IF clone from completed, THEN SHALL reject with error |
| REQ-020 | Empty context directory | WHEN context/ empty, SHALL proceed normally |
| REQ-021 | Multiple clones from source | WHEN multiple clones, SHALL create independent sessions each time |
| REQ-022 | Source session not found | IF session not found, THEN SHALL return error with session ID |
| REQ-023 | History events on clone | WHEN clone succeeds, SHALL emit `session-cloned` on source and `cloned-from` on clone |

## Status: All 20 requirements approved
