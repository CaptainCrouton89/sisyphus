# Cycle 2 — Exploration Complete → Design → Plan

## Findings
All 3 exploration agents completed successfully:
- **node-pty**: No Linux prebuilds, always compiles from source. Use `node:22` (includes build tools). No Alpine (musl lacks libutil).
- **Daemon headless**: Starts fine without tmux. Socket smoke test works. CLI gates tmux check client-side. No auto-start on Linux — must start daemon explicitly.
- **Doctor matrix**: 14 checks mapped. Always exits 0. Claude mock just needs `which claude`. Several checks naturally fail/warn in containers (expected).

## Design Produced
Wrote `context/design-integration-tests.md` directly (had enough codebase understanding from reading setup.ts, tmux-setup.ts, onboard.ts, dashboard.ts, status-bar.ts, doctor.ts).

Key decisions:
- **3 tiers** (base/tmux/full), not 5 — nvim and claude-mock don't justify separate images
- **Single multi-stage Dockerfile** — layers share cache
- **Shell-based test suites** with minimal assertion library
- **Tarball installation** via `npm pack` → COPY into Docker → `npm install -g`
- **Raw socket daemon test** — cleaner than CLI (avoids retry overhead)
- **GHA**: Linux (Docker harness) + macOS (launchd, Swift, doctor) as separate jobs

Also read user message (msg-001): emphasis on testing hooks, status line, dashboard, daemon, updater, edge cases. "Not testing theater — real tests." Design covers all these except full TUI screen testing (out of scope for integration tests).

## Agents Spawned
- **agent-004** (plan-integration): Turn design into implementation plan with file-level detail and parallelizable task waves

## Next Cycle
Review plan, transition to implementation mode.
