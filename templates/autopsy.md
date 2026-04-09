---
description: Debug a past sisyphus session — what went wrong, where, and why
argument-hint: <session-id-or-path>
---

Perform an autopsy on a sisyphus session. The user will pass either a session ID (full or prefix), a session name, or a path to a session directory.

**Argument:** `$0`

## Your goal

Figure out what actually happened in this session — not just summarize the completion report. The user is here because something needs explaining: a failure, an unexpected result, wasted cycles, a weird decision, an agent that stalled. Find it.

## Where to look

Sisyphus stores session data in two places. Both matter.

**1. Project-relative session dir:** `.sisyphus/sessions/{sessionId}/` (relative to the project the session ran in). Contains the artifacts agents produced and orchestrator scratch space:

```
state.json         # live state machine — agents, cycles, status, phase
goal.md            # one-paragraph definition of "done"
strategy.md        # completed / current stage / ahead — shape of the work
roadmap.md         # current stage, exit criteria, next steps (updated every cycle)
digest.json        # compact summary for orchestrator context
context/           # agent-written docs: requirements.{json,md}, design.{json,md},
                   #   plan-stage-N-*.md, e2e-recipe.md, exploration notes, CLAUDE.md
logs/              # cycle-001.md, cycle-002.md, ... — per-cycle orchestrator log
reports/           # agent-NNN-final.md, agent-NNN-<suffix>.md — what each agent reported
prompts/           # orchestrator-system-N.md, orchestrator-user-N.md, agent-NNN-system.md,
                   #   agent-NNN-run.sh — exact prompts and launch commands used
snapshots/         # cycle-N/ — filesystem snapshots at cycle boundaries (for rollback)
```

**2. Global history dir:** `~/.sisyphus/history/{sessionId}/`. Exists for every session the daemon has seen, independent of the project dir. Structured, queryable via `sisyphus history`:

```
session.json       # SessionSummary — final state, agents, cycles, messages, mood,
                   #   achievements, efficiency, completion report
events.jsonl       # ordered timeline: session-start, agent-spawned, agent-completed,
                   #   cycle-boundary, agent-killed, rollback, review-started/completed,
                   #   session-resumed, session-end
```

The project dir has the **content** (what agents wrote, what was decided). The history dir has the **timeline** (what happened and when). You usually want both.

## `sisyphus history` CLI

Start here for orientation. It's fast and gives structured views.

```bash
sisyphus history                              # list recent sessions (newest first)
sisyphus history <id-or-name>                 # detail view: task, agents, cycles, reviews, report
sisyphus history <id-or-name> --events        # raw event timeline
sisyphus history <id-or-name> --json          # full SessionSummary as JSON
sisyphus history <id-or-name> --events --json # events array as JSON (useful for grep/jq)
sisyphus history --stats                      # aggregate metrics across sessions
sisyphus history --search "<query>"           # substring search across task/messages
sisyphus history --cwd <path>                 # filter by project dir
sisyphus history --since 7d                   # filter by recency (7d, 24h, 2w, 30m)
sisyphus history --status killed              # filter by terminal status
```

**Session resolution:** `<id-or-name>` matches in order: exact UUID → UUID prefix → exact name → name substring. Short substrings can be ambiguous.

**Interactive agents:** `sisyphus:requirements`, `sisyphus:design`, `sisyphus:spec` have their `activeMs` bucketed as **interactive (TUI wait time), not compute**. Don't count their activeMs as wasted work in efficiency analysis — the user was sitting at a TUI.

**Efficiency field:** may be `null` for older sessions even when `wallClockMs` exists — the CLI recomputes inline. Don't assume null means "no data."

## Debugging workflow

1. **Start with the headline.** `sisyphus history <id>` gives the completion report, agent list with final status, cycle summaries, reviews, and final mood signals. Read the completion report if it exists — it's what the orchestrator thought happened at the end.

2. **Check for failures.** Look at the `agents` block for statuses that aren't `completed`: `crashed`, `killed`, `lost`, `exited`. Look at `crashCount`, `lostCount`, `killedAgentCount`, `rollbackCount` in the summary. Any non-zero is a lead.

3. **Walk the timeline.** `sisyphus history <id> --events` shows the event stream chronologically. Look for:
   - `agent-killed` / `agent-restarted` — something was rescued or abandoned
   - `rollback` — orchestrator backtracked (check `fromCycle → toCycle`)
   - `session-resumed` — daemon restart; `lostAgentCount` matters
   - multiple `cycle-boundary` events with the same mode — stuck in a phase
   - `signals-snapshot` — phase transitions
   - long gaps between events — something hung

4. **Read what the agent actually wrote.** For any suspicious agent, open `reports/{agentId}-final.md` in the project session dir. Agents write their own report; it's richer than the orchestrator's summary of it.

5. **Read the prompt the agent got.** `prompts/{agentId}-system.md` shows the exact instructions. If the agent did the wrong thing, the prompt often explains why — bad instruction, missing context, ambiguous goal. `prompts/{agentId}-run.sh` shows the launch command (model, flags, appended system prompt).

6. **Read cycle logs.** `logs/cycle-NNN.md` is the orchestrator's per-cycle log. Shows what the orchestrator observed and decided. `cycle-001.md` uses zero-padding; snapshot dirs do not (`snapshots/cycle-1/`) — don't glob them interchangeably.

7. **Read context docs.** `context/requirements.md`, `context/design.md`, `context/plan-stage-*.md`, `context/e2e-recipe.md` — the artifacts agents produced that downstream agents consumed. If implementation went sideways, planning docs are the first place to look for bad assumptions.

8. **Read the orchestrator's own prompts.** `prompts/orchestrator-system-N.md` and `prompts/orchestrator-user-N.md` for cycle N. Shows exactly what context the stateless orchestrator saw at the start of that cycle. Useful when the orchestrator made a weird call — often it was missing context.

## Common failure patterns to check for

- **Stuck in a phase.** Multiple cycles with the same mode in events. Orchestrator can't find the exit criteria. Check `roadmap.md` for current exit criteria; check recent cycle logs for what the orchestrator thought it was waiting on.
- **Thrashing on the same code.** Repeated fix agents across cycles hitting the same files. Indicates a missed root cause — check the earliest failing agent's report, not the latest.
- **Bad plan.** Implementation agents hit unexpected complexity. Go back to `context/plan-stage-*.md` — is the plan actually complete? Does it match the design?
- **Rollback loop.** `rollback` events in the timeline. `sisyphus rollback` is destructive — it rewinds to a prior cycle boundary. If there are multiple, the orchestrator gave up and retried repeatedly. Check what changed between the retried cycles.
- **Killed/crashed agents.** `agent-killed` with a reason; `agent-restarted` means it was respawned. Check the agent's report (if any) and the cycle log around the kill event.
- **Session resumed mid-work.** `session-resumed` event + non-zero `lostAgentCount` — daemon restarted, some in-flight agents were lost. Look at what phase the session was in when resumed.
- **Wasted interactive time.** High `activeMs` on `sisyphus:requirements`/`sisyphus:design`/`sisyphus:spec` isn't wasted compute — it's user think-time at a TUI. Don't flag it as inefficiency.

## How to report back

Don't summarize the completion report — the user already has that. Lead with what's **surprising** or **non-obvious**: the specific inflection where things went wrong, the agent whose report contradicts the orchestrator's summary, the prompt that was missing a constraint, the cycle that repeated. Cite specific files and line numbers (`reports/agent-004-final.md:12`) so the user can jump straight there.

If the session succeeded and the user asked for an autopsy anyway, they probably want to know **how** it succeeded — which cycle made the key decision, which agent did the heavy lifting, where it could have gone faster. Same rules: cite specifics, skip the recap.
