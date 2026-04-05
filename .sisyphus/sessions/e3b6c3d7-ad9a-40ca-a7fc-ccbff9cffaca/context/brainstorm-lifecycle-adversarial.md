# Adversarial Integration Tests: Session Lifecycle & Protocol Edge Cases

Scenarios grounded in actual code gaps found in session-manager.ts, server.ts, pane-monitor.ts, state.ts, and protocol.ts.

---

## 1. Orchestrator Crashes Without Yielding

- **What the user does**: Orchestrator process exits (OOM, segfault, `kill -9`) without calling `yield` or `complete`.
- **What breaks**: `pane-monitor.ts` poll detects missing orchestrator pane, calls `completeOrchestratorCycle`. But if `orchPaneId` was already cleared from memory (race with a prior poll), the `if (orchPaneId && !livePaneIds.has(orchPaneId))` check is skipped entirely. Session stays `active` with no orchestrator, no agents, and no recovery path. The stuck-session check at pane-monitor.ts:371 won't fire if `agents.length === 0`.
- **How to test**: Start session → spawn orchestrator → `tmux kill-pane -t <orchPane>` → wait 2 poll intervals → assert session transitions to `paused` and eventually respawns orchestrator (or enters a recoverable error state).
- **Tier**: `tmux`

## 2. Agent Submits After Session Killed

- **What the user does**: `sisyphus kill <sessionId>`, then a slow agent calls `sisyphus submit --report "done"`.
- **What breaks**: `server.ts` looks up the session via `lookupPane`. If the pane was already unregistered during kill, submit returns `{ ok: true }` silently — the report is lost. If the pane is still registered (race window), `handleAgentSubmit` writes to a session that's been killed, potentially resurrecting state on disk.
- **How to test**: Start session → spawn agent → `sisyphus kill` → immediately send submit from agent pane → assert submit returns error (not silent success) and state.json is not resurrected.
- **Tier**: `tmux`

## 3. Agent Submits Empty Report

- **What the user does**: `sisyphus submit --report ""`
- **What breaks**: No validation on report content in protocol.ts or server.ts. Empty string propagates to state.json. Summarize.ts may send empty content to Haiku for summarization, wasting API calls or erroring.
- **How to test**: Start session → spawn agent → submit with empty string → assert agent marked `done`, report stored (or rejected with error), no crash in summarize path.
- **Tier**: `tmux`

## 4. Agent Pane Killed Externally

- **What the user does**: `tmux kill-pane -t <agentPane>` while agent is still `running`.
- **What breaks**: `pane-exited` handler in server.ts calls `unregisterPane` BEFORE `handlePaneExited`. If `handlePaneExited` throws, the pane is gone from registry but agent stays `running` in state forever. Subsequent polls see no pane for this agent but have no registry entry to resolve it.
- **How to test**: Start session → spawn agent → `tmux kill-pane` → wait for poll → assert agent status is `failed`/`killed` (not stuck at `running`).
- **Tier**: `tmux`

## 5. Multiple Agents Submit Simultaneously

- **What the user does**: Two agents call `sisyphus submit` at the exact same time.
- **What breaks**: `server.ts` has no per-session request serialization. Both `handleAgentSubmit` calls read session state concurrently. `state.ts` has a lock per session, but the compound read-check-update in session-manager is not atomic. Both may see "1 agent remaining" and both trigger `onAllAgentsDone`, causing double orchestrator respawn.
- **How to test**: Start session → spawn 2 agents → use `&` to submit both in parallel → assert exactly one orchestrator respawn occurs, both reports persisted.
- **Tier**: `tmux`

## 6. Double Yield

- **What the user does**: Orchestrator calls `sisyphus yield` twice rapidly (script bug, retry logic).
- **What breaks**: First yield transitions session to `paused`, kills orchestrator pane. Second yield arrives — session is now `paused`, orchestrator pane is gone. `handleYield` may attempt to kill an already-dead pane (tmux error), or process the yield on a paused session without guard.
- **How to test**: Start session → from orchestrator pane, run `sisyphus yield & sisyphus yield` → assert no crash, session in consistent state, only one cycle completed.
- **Tier**: `tmux`

## 7. Complete While Agents Still Running

- **What the user does**: Orchestrator calls `sisyphus complete` while agents are still `running`.
- **What breaks**: If `handleComplete` doesn't check for running agents, it marks session `completed` while agent panes are still alive. Those agents may later call `submit` on a completed session (see scenario 2). Pane monitor continues polling dead session. Agent panes become orphans.
- **How to test**: Start session → spawn agent (don't submit) → call `sisyphus complete` from orchestrator → assert: either complete is rejected, or running agents are killed and session completes cleanly.
- **Tier**: `tmux`

## 8. Message to Completed Session

- **What the user does**: `sisyphus message "hey" --session <completedSessionId>`
- **What breaks**: `server.ts` messageCounter restarts at 0 on daemon restart. For a completed session, the message is appended to state.json with ID `msg-001` which may collide with an existing message from cycle 1. No guard checks session status before accepting messages.
- **How to test**: Start session → complete it → send message → assert error response (not silent append to completed session state).
- **Tier**: `base` (socket-only, no tmux needed)

## 9. Restart-Agent on Running Agent

- **What the user does**: `sisyphus restart-agent agent-001` while agent-001 is still running.
- **What breaks**: If no guard checks agent status, a second pane is spawned for the same agent ID. Two panes, same agent ID — both can submit. The `updateAgent` reverse-find in state.ts would only update the last-appended record, so the first agent's state is silently lost.
- **How to test**: Start session → spawn agent → immediately `sisyphus restart-agent` that agent → assert: either restart is rejected (agent still running), or old pane is killed before new one spawns.
- **Tier**: `tmux`

## 10. Empty Task String

- **What the user does**: `sisyphus start ""`
- **What breaks**: No validation on task content. Empty task propagates to orchestrator prompt template. Orchestrator receives empty instruction, does unpredictable things. Session name generation via Haiku gets empty input.
- **How to test**: `sisyphus start ""` → assert error response with validation message (or, if allowed, session creates without crash).
- **Tier**: `base`

## 11. Extremely Long Task String (10KB+)

- **What the user does**: `sisyphus start "$(python3 -c 'print("A"*10240)')"`
- **What breaks**: Task is written to prompt file, sent via tmux send-keys. Tmux has buffer limits. The socket protocol (JSON line-delimited) may struggle with a single 10KB+ line. Prompt file write should be fine, but `send-keys` fallback path could truncate.
- **How to test**: Generate 10KB string → `sisyphus start` with it → assert session creates, orchestrator receives full task (check prompt file content).
- **Tier**: `tmux`

## 12. Spawn With No Task

- **What the user does**: `sisyphus spawn` (no arguments) from orchestrator pane.
- **What breaks**: CLI should reject this (Commander.js argument validation). If it doesn't, empty instruction reaches `handleSpawn`, gets written to agent prompt template with `{{INSTRUCTION}}` replaced by empty string.
- **How to test**: From orchestrator context, run `sisyphus spawn` with no args → assert CLI error, not a daemon-side crash.
- **Tier**: `base` (CLI validation, no tmux needed)

## 13. Orchestrator Spawns 50+ Agents

- **What the user does**: Orchestrator loop calls `sisyphus spawn` 50 times.
- **What breaks**: Each spawn creates a tmux pane. System runs out of PTYs, tmux hits pane limits, or node-pty exhausts file descriptors. Agent color rotation wraps (6 colors), pane IDs grow. State.json gets large with 50 agent records. Poll interval scans 50 panes every tick.
- **How to test**: Script that spawns 50 agents in a loop → assert: all spawn successfully OR daemon returns resource-limit error after threshold. Check daemon doesn't OOM or hang.
- **Tier**: `full` (needs mock claude for agents)

## 14. Socket Timeout Mid-Request

- **What the user does**: CLI sends request, daemon pauses (heavy load / GC), socket hits 10s timeout in `client.ts`.
- **What breaks**: CLI returns timeout error to user. Daemon may still be processing the request. If it was a `yield` or `complete`, the state mutation happens server-side but the CLI reports failure. User retries, causing double-yield (scenario 6) or double-complete.
- **How to test**: Add artificial delay to daemon handler (or use `tc` to add latency on loopback) → send yield → assert CLI timeout → check session state consistency.
- **Tier**: `base`

## 15. Daemon Restart While Sessions Active

- **What the user does**: `sisyphusd restart` while a session has running agents.
- **What breaks**: `messageCounter` resets to 0 (duplicate message IDs). `sessionLocks` map is cleared. `respawningSessions` set is cleared. `activeTimers` in pane-monitor lost (timer drift). Pane registry cleared — daemon doesn't know which tmux panes belong to which sessions until they call in via protocol. Running agents' panes are orphaned until next poll re-discovers them (if it does).
- **How to test**: Start session → spawn agents → `sisyphusd restart` → assert agents are re-discovered, session resumes correctly, no duplicate message IDs.
- **Tier**: `tmux`

## 16. Continue on Never-Completed Session

- **What the user does**: `sisyphus continue <sessionId>` on a session that's still `active` or `paused`.
- **What breaks**: `continueSession` in state.ts clears `completedAt` on the last cycle and sets status to `active`. If session was already active, this is a no-op that might clear cycle metadata. If paused, it becomes active with no orchestrator pane — stuck.
- **How to test**: Start session (status=active) → `sisyphus continue` → assert error or no-op. Then: pause session → `sisyphus continue` → assert orchestrator respawns (or error).
- **Tier**: `tmux`

## 17. Rollback to Cycle 0

- **What the user does**: `sisyphus rollback <sessionId> 0`
- **What breaks**: `handleRollback` restores snapshot for cycle 0. Snapshot may not exist (snapshots created at cycle boundaries — cycle 0 is the initial state before any yield). If snapshot missing, `restoreSnapshot` throws ENOENT. After rollback, session is `paused` with tmux bindings cleared — no `resumeSession` call, so session is inert. User must manually resume.
- **How to test**: Start session → yield (creates cycle 1) → `sisyphus rollback <id> 0` → assert: either error (no snapshot) or clean restore with session resumable.
- **Tier**: `tmux`

## 18. Pane-Exited Before Registration Complete

- **What the user does**: Agent pane spawns but exits immediately (bad command, missing claude binary).
- **What breaks**: `pane-exited` arrives at server.ts. `unregisterPane` is called but pane may never have been registered (spawn is async, registration happens after tmux pane creation). `lookupPane` returns null → handler returns `{ ok: true }` silently. Agent stays `running` in state.json forever.
- **How to test**: Spawn agent with invalid command (e.g., nonexistent binary) → assert agent transitions to `failed` within poll interval, not stuck at `running`.
- **Tier**: `full`

## 19. Concurrent Yield and Spawn

- **What the user does**: Orchestrator calls `sisyphus spawn "task" & sisyphus yield` (fire both).
- **What breaks**: No per-session request serialization in server.ts. `handleSpawn` may execute after `handleYield` kills the orchestrator. Spawn succeeds, creating an agent, but the session is now `paused`. When this agent submits, `onAllAgentsDone` tries to respawn the orchestrator — but the session already has a pending respawn from the yield path. Double respawn race.
- **How to test**: From orchestrator, `sisyphus spawn "x" & sisyphus yield` → assert: spawn either completes before yield (agent created, then yield) or is rejected (session yielding). No double-respawn.
- **Tier**: `tmux`

## 20. State File Corruption

- **What the user does**: Nothing intentional — disk full, power loss, or concurrent write from another process.
- **What breaks**: `state.ts` uses atomic temp-file + rename, which is good. But `createSnapshot` (state.ts:289-302) uses multiple `copyFileSync`/`cpSync` calls without transaction. Crash mid-snapshot = partial snapshot. `restoreSnapshot` would restore inconsistent state.
- **How to test**: Start session → create snapshot → during snapshot copy, kill daemon (`kill -9`) → restart → attempt rollback → assert: either snapshot is validated and rejected, or restore produces consistent state.
- **Tier**: `base`

## 21. handleSpawn Re-activates Completed Session

- **What the user does**: Race condition — orchestrator sends `complete` and `spawn` nearly simultaneously.
- **What breaks**: At session-manager.ts:413, if session is `completed`, `handleSpawn` sets it back to `active` before spawning. Session is now `active` with a new agent but no orchestrator (orchestrator was killed by `complete`). Session stuck in limbo — agent finishes, `onAllAgentsDone` fires, tries to respawn orchestrator on a session that was supposed to be completed.
- **How to test**: `sisyphus complete & sisyphus spawn "task"` from orchestrator → assert: spawn is rejected after complete, or complete waits for spawn to finish.
- **Tier**: `tmux`

## 22. pane-exited Handler Throws After Unregister

- **What the user does**: Nothing intentional — a bug in `handlePaneExited` throws.
- **What breaks**: server.ts:288-294 calls `unregisterPane(req.paneId)` THEN `handlePaneExited(...)`. If the handler throws, pane is gone from registry permanently. Agent stays `running` in state. No future `pane-exited` event can resolve it (pane already unregistered). Only manual intervention or stuck-session timeout recovers.
- **How to test**: Inject a fault in handlePaneExited (or trigger a code path that throws, e.g., corrupt state.json for that session) → kill agent pane → assert agent doesn't stay `running` forever.
- **Tier**: `tmux` (requires code instrumentation or fault injection)

---

## Priority Matrix

| Scenario | Severity | Likelihood | Tier |
|----------|----------|------------|------|
| 5. Multiple simultaneous submits | Critical | High | tmux |
| 4. External pane kill | Critical | High | tmux |
| 1. Orchestrator crash no yield | Critical | High | tmux |
| 15. Daemon restart mid-session | High | Medium | tmux |
| 19. Concurrent yield + spawn | High | Medium | tmux |
| 21. Spawn re-activates completed | High | Low | tmux |
| 7. Complete while agents running | High | Medium | tmux |
| 2. Submit after kill | Medium | Medium | tmux |
| 6. Double yield | Medium | Low | tmux |
| 18. Pane exits before registration | Medium | Medium | full |
| 9. Restart running agent | Medium | Low | tmux |
| 14. Socket timeout | Medium | Low | base |
| 22. Handler throw after unregister | Medium | Low | tmux |
| 8. Message to completed session | Low | Medium | base |
| 16. Continue non-completed session | Low | Low | tmux |
| 17. Rollback to cycle 0 | Low | Low | tmux |
| 10. Empty task | Low | Low | base |
| 11. Long task (10KB) | Low | Low | tmux |
| 12. Spawn no args | Low | Low | base |
| 13. 50+ agents | Low | Low | full |
| 20. State corruption | Low | Low | base |
| 3. Empty report | Low | Medium | tmux |
