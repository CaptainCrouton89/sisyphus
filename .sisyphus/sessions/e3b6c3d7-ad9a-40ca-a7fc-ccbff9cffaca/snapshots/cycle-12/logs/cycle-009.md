# Cycle 9 — Test Expansion Planning

User reviewed the initial 28-test suite and asked for more rigorous, e2e tests. Designed expanded suite of ~55 assertions covering:
- Protocol robustness (invalid JSON, unknown types, concurrent connections)
- Daemon resilience (stale socket, stale PID, double start)
- CLI surface (help output, unknown commands, doctor exit code)
- Session lifecycle via raw protocol (create→state→list→message→kill→delete)
- Multi-session isolation
- Complete lifecycle (create→complete→verify status+report)
- Update-task e2e

Wrote detailed plan in `context/plan-test-expansion.md` with exact code for all new helpers and tests.

Spawning 3 parallel agents:
1. assert.sh + test-base.sh (new helpers + base tier tests)
2. test-tmux.sh (session lifecycle + multi-session)
3. test-full.sh (complete lifecycle + update-task)

Transitioned from completion back to implementation mode.
