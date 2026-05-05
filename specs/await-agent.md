# `sisyphus await` — Spec

Lets the orchestrator consume an agent's report inline (same turn) instead of yielding and waiting for the next cycle. Targets the case where the orchestrator has an open-ended understanding question mid-flow ("why does this agent behave this way?", "how does the worker queue fill the dashboard?") that's currently answered with manual `Grep`/`Glob`/`Read` — which dumps raw search noise into the orchestrator's context.

The mechanism is intentionally minimal: a new `sisyphus await <agentId>` CLI verb that blocks until the agent reaches a terminal status, prints the same submit report the next-cycle orchestrator would have seen, and flags the agent as consumed-inline so its report is suppressed from the next cycle's prompt.

## Goals

- Orchestrator can ask cycle-internal questions without yielding.
- Synthesized answer in, raw search/code-read noise out — the orchestrator gets a short submit report, not 50+ lines of grep output.
- Zero new system-prompt machinery for the mechanism. The `sisyphus spawn` output itself teaches the next move via a tip line.
- Pure mechanism, no daemon-side policy. Any agent can be awaited; orchestrator decides whether it's worth doing.
- Cycle hygiene preserved: awaited agents leave no trace in the next cycle's report list.

## Non-Goals

- No `--timeout` flag in v1. Block until terminal status. Add later if a real case emerges.
- No multi-arg CLI form (`sisyphus await id1 id2 id3`). Orchestrator uses parallel `Bash` tool calls if it wants concurrent waits — daemon handles each socket connection independently.
- No change to the explore agent's behavior. It still writes `context/explore-{topic}.md` and submits its short report. Whether it gets awaited is invisible to the agent.
- No retroactive "un-consume" of a previously awaited agent. `consumedInline` is one-way.

## CLI Surface

### `sisyphus await <agentId> [--session <id>]`

Sends `{ type: 'await', sessionId, agentId }` to the daemon over the existing Unix socket. Daemon responds when the agent's status leaves `running` (i.e., reaches `completed`, `crashed`, `killed`, or `lost`). CLI then:

1. Reads the agent's final submit report (`reports/{agentId}/submit-final.md`) if it exists.
2. Prints a one-line status header followed by the report body to stdout:
   ```
   [completed] explore-foo-abc123 (explore-worker-queue)
   <submit report contents>
   ```
3. Exits 0 on any terminal status. The status header is the orchestrator's signal for `crashed`/`killed`/`lost` cases.

If the agent submitted no report (e.g., crashed before submit), the body is empty — header alone is the result.

If the agent is already in a terminal state when `await` is called, returns immediately. No blocking.

Exit code non-zero is reserved for *command* errors:
- Unknown `agentId` for the resolved session.
- Daemon not running / socket unreachable.
- Missing `--session` and no `SISYPHUS_SESSION_ID` in env.

Idempotent: a second `await` on the same agent returns the same content. `consumedInline` stays `true`.

### `sisyphus spawn` — output change

Adds one tip line between the existing "Agent spawned" line and the yield reminder (`src/cli/commands/spawn.ts:96-97`):

```
Agent spawned: explore-foo-abc123
Tip: `sisyphus await explore-foo-abc123` blocks for the report and consumes it inline (won't appear in next cycle).
Run `sisyphus yield` when done spawning agents.
```

Tip prints on every spawn — no agent-type gating. Slight redundancy when spawning multiple agents in a batch is acceptable; the orchestrator learns the pattern.

## Daemon Protocol

New request type in `src/daemon/server.ts`:

```ts
case 'await': {
  return await handleAwait(req.sessionId, req.agentId);
}
```

`handleAwait(sessionId, agentId)`:
1. Look up agent in session state. If not found → return error response (`{ ok: false, error: 'unknown agent' }`).
2. If agent's status is already terminal → skip to step 4.
3. Otherwise, wait for status transition out of `running`. Implementation: subscribe to the same internal event the pane monitor / `handleAgentSubmit` emits, or poll state at a short interval. Daemon already has the wiring for `onAllAgentsDone`; this is a per-agent variant.
4. Mark agent as `consumedInline: true` via `state.ts` `atomicWrite`.
5. Return `{ ok: true, status, reportPath, agentName }` — CLI handles printing.

Concurrent `await` calls on different agents are independent (each runs on its own socket connection). Concurrent `await` calls on the *same* agent both unblock when the agent terminates; both succeed; `consumedInline` is set once.

## State Changes

`src/shared/types.ts` — `Agent` gains:

```ts
consumedInline: boolean;  // default false; set true when sisyphus await returns
```

`src/daemon/orchestrator.ts:216-220` — `formatStateForOrchestrator` filters the agent report list:

```ts
const visibleAgents = session.agents.filter(a => !a.consumedInline);
// ... existing per-agent rendering only over visibleAgents
```

Awaited agents stay in `state.json` for audit/history (visible in the dashboard, in autopsy traces, etc.) — they're only suppressed from the *next-cycle orchestrator prompt*.

`allAgentsDone` (`src/daemon/agent.ts:595-598`): unchanged. By the time `await` returns, the awaited agent is already in a terminal state, so it's not gating yields. There's no race because respawn fires only when the orchestrator has yielded *and* `allAgentsDone` — an awaited-then-completed agent satisfies the latter passively.

Context files in `context/explore-{topic}.md` are untouched. They stay in the directory, reachable but not auto-loaded into the next cycle's prompt (the prompt references the dir as a whole, not enumerated files). The orchestrator can promote a finding to durable status by referencing the file in `roadmap.md` if it matters long-term.

## Orchestrator System Prompt Change

Small addition to `templates/agent-plugin/agents/orchestrator-base.md` — one paragraph in the section that already discusses agent spawning. The `await` *mechanism* is not documented here; the spawn output's tip line teaches it just-in-time. This change is policy only:

> For open-ended understanding questions mid-flow — "why does this agent behave this way?", "how does the worker queue fill up the dashboard?", "what's the contract between X and Y?" — spawn `sisyphus:explore` agent(s) and consume their results inline (the spawn output shows you how). For multi-system questions, spawn one explore per system in parallel, then await them concurrently via parallel `Bash` calls. You get synthesized answers; raw code/search noise stays out of your context. Reserve direct `Grep`/`Glob`/`Read` for narrow lookups where you know exactly what you're after. Don't await long-running implementation agents — you'll burn your turn waiting.

## Edge Cases

| Case | Behavior |
|---|---|
| Agent terminal before `await` called | Returns immediately with existing report. |
| Agent crashes / killed / lost mid-await | Returns with terminal status header + whatever submit text exists (often empty). Exit 0. |
| `await` on unknown agent ID | Exit non-zero, error to stderr. |
| Daemon down | Exit non-zero, error to stderr. |
| Two `await`s on the same agent | Both unblock on termination, both print same content, `consumedInline` set once. |
| Awaiting a non-explore agent (problem, implementer) | Allowed. Orchestrator's judgment per system-prompt guidance — daemon does not gate. |
| Awaited agent's context file | Stays in `context/`. Not auto-surfaced next cycle, but reachable if orchestrator references it. |
| Orchestrator awaits, then yields without spawning more | Normal yield → respawn cycle. Awaited agent's report is filtered out of next cycle's prompt. |

## Implementation Touch Points

- `src/cli/commands/await.ts` — new file, mirrors structure of `yield.ts` and `spawn.ts`.
- `src/cli/commands/spawn.ts:96-97` — add tip line to stdout.
- `src/cli/index.ts` (or wherever commands are registered) — register `await`.
- `src/daemon/server.ts` — add `'await'` case in `handleRequest`.
- `src/daemon/agent.ts` — add `handleAwait` (peer of `handleAgentSubmit`); reuse existing status-transition signal if present, else add a per-agent waiter.
- `src/daemon/orchestrator.ts:216-220` — filter `consumedInline` agents in `formatStateForOrchestrator`.
- `src/shared/types.ts` — add `consumedInline: boolean` to `Agent`.
- `src/daemon/state.ts` — ensure new field migrates cleanly on existing sessions (default `false` when reading older state).
- `templates/agent-plugin/agents/orchestrator-base.md` — system prompt nudge.
