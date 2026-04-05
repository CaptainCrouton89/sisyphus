Implementation plan saved to context/plan-implementation.md.

Summary:
- 7 files to create (Dockerfile, assert.sh, 3 test suites, harness, GHA workflow)
- 3 parallelizable waves: Foundation → Test Suites → Orchestration
- 25+ test cases across 3 Docker tiers (base/tmux/full)

Key corrections from the design doc:
1. Doctor warn symbol is ! (exclamation), NOT ⚠ — source: doctor.ts:251
2. Doctor always exits 0 — tests must parse stdout, not rely on exit codes
3. sisyphusd has no --help flag — daemon-version test uses binary existence check instead
4. No daemon auto-start on Linux — every test must explicitly call start_daemon/stop_daemon

Implementation concerns documented:
- Daemon lifecycle in containers (socket polling, cleanup between tests)
- Staging directory approach to avoid 500MB+ Docker build context
- tmux server management (start before daemon for status-bar tests)
- sisyphus setup behavior on Linux (start daemon first, verify artifacts)
- GHA macOS launchd limitations (skip or conditionally test plist)