# Doctor Check Matrix for Docker Environment Tiers

Source: `src/cli/commands/doctor.ts:1-296`

## Exit Code

**Doctor does NOT set a process exit code.** The action is `async () => { ... }` with no `process.exit()` call. For CI assertions, you'd need to parse stdout or patch doctor to exit non-zero on failures.

## All Checks (in execution order)

| # | Check Name | What It Probes | ok | warn | fail |
|---|-----------|---------------|-----|------|------|
| 1 | Node.js | `process.versions.node` major >= 22 | version shown | — | < 22 |
| 2 | Claude CLI | `which claude` (line 26) | found on PATH | — | not found |
| 3 | git | `git --version` (line 40) | version shown | — | not found |
| 4 | tmux | `which tmux` then `tmux list-sessions` (lines 117-128) | running | installed, no server | not found |
| 5 | tmux version | `tmux -V`, parse float >= 3.2 (lines 48-61) | >= 3.2 | < 3.2 or unparseable | — (never fails) |
| 6 | Terminal | `process.platform` + `TERM_PROGRAM` env (line 193) | non-macOS → "skipped"; macOS iTerm | macOS non-iTerm | — (never fails) |
| 7 | Right Option Key | macOS + iTerm only; reads plist (line 208) | **omitted entirely on Linux** | — | — |
| 8 | Data directory | `existsSync(~/.sisyphus)` (line 184) | exists | doesn't exist yet | — (never fails) |
| 9 | Daemon plist/setup | macOS: `existsSync(~/Library/LaunchAgents/com.sisyphus.daemon.plist)` (line 65); Linux: `existsSync(~/.sisyphus/daemon.pid)` (line 77) | plist/pid found | — | not found |
| 10 | Daemon process | `existsSync(pid)` + `test -S ~/.sisyphus/daemon.sock` (lines 89-113) | socket exists | pid but no socket | no pid file |
| 11 | Cycle script | `existsSync(~/.sisyphus/bin/sisyphus-cycle)` + executable bit (lines 131-153) | exists + executable | — | missing or not executable |
| 12 | Tmux keybind (M-s) | `tmux list-keys` for M-s binding OR `existsSync(~/.sisyphus/tmux.conf)` (lines 155-182) | bound to sisyphus | conf exists but not active; or bound to something else | not bound, no conf |
| 13 | /begin command | `existsSync(~/.claude/commands/sisyphus/begin.md)` (line 227) | exists | not installed | — (never fails) |
| 14 | nvim | `which nvim` (line 238) | found + version | not installed | — (never fails) |

## Environment Tier Matrix

All tiers run on **Linux Docker** (not macOS). This affects checks 6, 7, 9.

| Check | base | +tmux | +nvim | +claude-mock | +full |
|-------|------|-------|-------|-------------|-------|
| Node.js | **ok** | **ok** | **ok** | **ok** | **ok** |
| Claude CLI | fail | fail | fail | **ok** | **ok** |
| git | fail¹ | **ok** | **ok** | **ok** | **ok** |
| tmux | fail | **warn**² | **warn**² | **warn**² | **warn**² |
| tmux version | warn³ | **ok**⁴ | **ok**⁴ | **ok**⁴ | **ok**⁴ |
| Terminal | **ok**⁵ | **ok**⁵ | **ok**⁵ | **ok**⁵ | **ok**⁵ |
| Right Option Key | *omitted* | *omitted* | *omitted* | *omitted* | *omitted* |
| Data directory | **warn**⁶ | **warn**⁶ | **warn**⁶ | **warn**⁶ | **warn**⁶ |
| Daemon plist/setup | fail⁷ | fail⁷ | fail⁷ | fail⁷ | fail⁷ |
| Daemon process | fail⁸ | fail⁸ | fail⁸ | fail⁸ | fail⁸ |
| Cycle script | fail⁹ | fail⁹ | fail⁹ | fail⁹ | fail⁹ |
| Tmux keybind (M-s) | fail¹⁰ | fail¹⁰ | fail¹⁰ | fail¹⁰ | fail¹⁰ |
| /begin command | **warn** | **warn** | **warn** | **warn** | **warn** |
| nvim | **warn** | **warn** | **ok** | **ok** | **ok** |

### Notes

1. **git in base**: Task says "no git maybe" — if git is absent it fails. If present, ok.
2. **tmux warn**: tmux is installed but no server running (`tmux list-sessions` fails in fresh container) → warn "Installed but no server running". To get **ok**, start a tmux server before running doctor (`tmux new-session -d`).
3. **tmux version in base**: tmux not installed, `tmux -V` throws → warn "Could not determine version". The tmux check (row above) already caught the missing binary as fail.
4. **tmux version**: Depends on distro package version. Most current distros ship tmux >= 3.2. If < 3.2, warn.
5. **Terminal on Linux**: Always returns ok with detail "Non-macOS (skipped)" (line 193-194).
6. **Data directory**: `~/.sisyphus` won't exist in a fresh container → warn. Created on first daemon start or first command.
7. **Daemon plist/setup on Linux**: Checks `~/.sisyphus/daemon.pid` — won't exist → fail.
8. **Daemon process**: No PID file → fail.
9. **Cycle script**: `~/.sisyphus/bin/sisyphus-cycle` won't exist unless `sisyphus setup-keybind` has run → fail.
10. **Tmux keybind**: No tmux server + no `~/.sisyphus/tmux.conf` → fail.

## macOS-Only Checks

- **Terminal** (line 193): On non-macOS, returns ok "Non-macOS (skipped)" — always passes on Linux.
- **Right Option Key** (line 208-209): Returns `null` on non-macOS → entirely omitted from check list.
- **Daemon plist/setup** (line 65): On macOS checks launchd plist; on Linux checks PID file instead. Different logic paths, same check name changes to "Daemon setup" on Linux (line 79).

## Claude CLI Mock Requirements

The check at line 26 is simply:
```ts
execSync('which claude', { stdio: 'pipe' });
```

**`which claude` succeeding is sufficient.** Doctor does not invoke `claude` with any arguments or check its output. A zero-byte executable or symlink to `/bin/true` on PATH would pass.

Minimal mock: `echo '#!/bin/sh' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`

Note: Other parts of sisyphus (the daemon/orchestrator) DO invoke `claude` with real arguments, but doctor does not.

## Daemon State on First Run

When doctor runs in a fresh container:
- **Daemon plist/setup**: fail (no PID file on Linux, no plist on macOS)
- **Daemon process**: fail (no PID file → "No PID file found")

These are expected failures in test containers. To make them pass, start the daemon first: `node dist/daemon.js &` (creates PID file + socket).

## Checks That Can Never Fail (only ok/warn)

- tmux version (warn at worst)
- Terminal (always ok on Linux)
- Data directory (warn at worst)
- /begin command (warn at worst)
- nvim (warn at worst)

## Checks That Can Never Warn (only ok/fail)

- Node.js
- Claude CLI
- git
