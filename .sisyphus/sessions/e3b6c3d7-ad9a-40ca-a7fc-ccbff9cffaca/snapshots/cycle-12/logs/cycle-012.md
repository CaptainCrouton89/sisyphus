# Cycle 12 — Synthesize brainstorm reports, spawn adversarial test implementers

## What happened
All 7 brainstorm/exploration agents completed with rich findings:
- **tmux adversarial** (agent-017): 15 scenarios, found real bug — dots in dir names mangle tmux session names, causing stored name to mismatch actual name
- **plugins adversarial** (agent-018): 15 scenarios, found path traversal in agent type names, inline YAML skills silently dropped
- **tui adversarial** (agent-019): 20 scenarios, compose mode crash hangs, no TTY detection, respawn race
- **state adversarial** (agent-020): 20 scenarios, PID lock TOCTOU, atomicWrite temp leak, incomplete schema normalization, in-memory lock lost on restart
- **lifecycle adversarial** (agent-021): 22 scenarios, double orchestrator respawn race, pane-exited unregister ordering, orchestrator crash with zero agents
- **daemon failures** (agent-022): 17 failure modes from code reading, top: missing .catch() on handleRequest, pane unregistered before state update, messageCounter reset on restart
- **cli/tui failures** (agent-023): 5 actionable findings, top: execSafe has no timeout blocks daemon forever, homedir() empty on Linux

## Synthesis decisions
Filtered 92+ scenarios down to ~55 new assertions organized by what's deterministically testable in Docker:
- **Base tier** (~14 new): config robustness, SIGKILL recovery, HOME unset, empty task, protocol edge cases
- **Tmux tier** (~27 new): state corruption, rollback invalid, message to killed session, dotted directory name (documents real bug), session name collision, external pane kill, daemon restart recovery, concurrent messages, CWD isolation
- **Full tier** (~14 new): agent type resolution, malformed frontmatter, setup idempotency, TUI no-TTY detection, doctor all-checks

## Agents spawned
- agent-024: base tier adversarial tests + assert.sh helpers (edits assert.sh + test-base.sh)
- agent-025: tmux tier adversarial tests (edits test-tmux.sh only)
- agent-026: full tier adversarial tests (edits test-full.sh only)

No file conflicts — each agent owns different files.
