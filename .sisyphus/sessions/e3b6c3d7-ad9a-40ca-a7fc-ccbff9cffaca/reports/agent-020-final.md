Completed brainstorm: 20 adversarial integration test scenarios covering state corruption, filesystem edge cases, and recovery. Saved to context/brainstorm-state-adversarial.md.

Key findings from reading the actual code:
- **PID lock is TOCTOU-vulnerable** (src/daemon/index.ts:55-62): readPid() then writeFileSync() with no atomic lock — two simultaneous starts can both succeed
- **atomicWrite never cleans up temp files** (src/daemon/state.ts:34-39): if writeFileSync succeeds but renameSync fails (or process dies between them), .state.*.tmp files accumulate with no cleanup
- **getSession has incomplete schema normalization** (src/daemon/state.ts:77-90): normalizes activeMs and agent.repo but not messages array — appendMessage on a legacy session missing messages field would crash at session.messages.push()
- **Session lock is in-memory only** (src/daemon/state.ts:19): survives within a process but lost on daemon restart — concurrent CLI calls immediately after restart could race
- **restoreSnapshot can leave partial state** (src/daemon/state.ts:304-333): state.json is restored atomically, but roadmap copy happens after — if roadmap copy throws, state is already changed but roadmap is stale

Scenarios span Tier 1 (14 scenarios, basic Docker) and Tier 2 (6 scenarios, need tmpfs/multi-fs/full tmux lifecycle).