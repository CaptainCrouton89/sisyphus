# Daemon Behavior in Headless/Minimal Environments

## 1. Can `sisyphusd` start without tmux installed?

**Yes.** The daemon startup sequence (`src/daemon/index.ts:215-258`) does:
1. Node 22 version check (line 1-5)
2. `ensureDirs()` — creates `~/.sisyphus/` (line 217)
3. `loadConfig()` (line 219)
4. Optional auto-update check (line 220-222)
5. `acquirePidLock()` — writes PID file (line 224)
6. `startServer()` — creates Unix socket at `~/.sisyphus/daemon.sock` (line 233)
7. `startMonitor()` — starts pane poller (line 234)
8. `recoverSessions()` — attempts tmux reconnection for existing sessions (line 236)

**No tmux check at startup.** The daemon creates its socket and listens without touching tmux. Tmux is only invoked during:
- Session recovery (`recoverSessions` calls `sessionExists()` and `listPanes()` from `./tmux.ts`) — but these are wrapped in try/catch per-session, so failures just skip that session
- Actual session operations (start, spawn, resume)

**Hard requirements for daemon startup**: Node 22+, writable `~/.sisyphus/` directory, ability to bind a Unix socket.

## 2. What happens when `sisyphus start "test"` is called without tmux?

The CLI (`src/cli/commands/start.ts:21-34`) checks **before** contacting the daemon:

1. If `$TMUX` env var is unset AND `--no-tmux-check` wasn't passed:
   - Calls `isTmuxInstalled()` (`src/cli/tmux.ts:3-9`) which runs `which tmux`
   - If tmux not installed: prints error "tmux is not installed" and `process.exit(1)` — **never contacts daemon**
   - If tmux installed but not in a session: prints error "Not running inside a tmux session" and `process.exit(1)` — **never contacts daemon**

2. With `--no-tmux-check`: skips the check, sends `start` request to daemon. The daemon's `sessionManager.startSession()` will then fail when it tries to create a tmux session (via `tmux.ts` calls).

**Key insight**: The tmux gate is CLI-side, not daemon-side. The daemon trusts that the CLI validated tmux availability.

## 3. Can the daemon run in Docker (no TTY, no display)?

**Yes, for socket operations.** The daemon has no TTY or display requirements for:
- Starting up and listening on the socket
- Responding to `status` requests (no session ID)
- Responding to `list` requests
- Processing protocol messages

**No TTY needed.** The daemon runs as a background process (`process.title = 'sisyphusd'`, line 260). No stdin/stdout interaction required.

**No display needed.** No GUI dependencies. The native notification helper (`SisyphusNotify.app`) is macOS-only and best-effort.

**Docker-specific concerns:**
- Unix socket at `~/.sisyphus/daemon.sock` — works in Docker
- PID file at `~/.sisyphus/daemon.pid` — works in Docker
- `isLaunchdManaged()` (`src/daemon/index.ts:64-71`) calls `launchctl list` — will fail silently (returns false) on Linux, which is correct behavior
- Auto-update (`updater.ts`) runs `npm install -g` — may need to be disabled via `config.autoUpdate: false`

## 4. Simplest smoke test for daemon liveness

Connect to socket, send a bare `status` request (no sessionId):

```javascript
// Minimal smoke test
const net = require('net');
const socket = net.connect('/root/.sisyphus/daemon.sock'); // or ~/.sisyphus/daemon.sock
socket.on('connect', () => {
  socket.write(JSON.stringify({ type: 'status' }) + '\n');
});
socket.on('data', (chunk) => {
  const response = JSON.parse(chunk.toString().trim());
  // Expected: { ok: true, data: { message: 'daemon running' } }
  console.log(response.ok ? 'PASS' : 'FAIL');
  socket.destroy();
});
```

This is handled at `src/daemon/server.ts:129-149`. When `req.type === 'status'` and no `req.sessionId`, it returns `{ ok: true, data: { message: 'daemon running' } }` (line 149). No tmux, no sessions, no side effects.

**Alternative via CLI**: `sisyphus status` (with no session ID) would also work but adds the CLI retry/auto-install overhead.

## 5. CLI auto-start on Linux (no launchd)

From `src/cli/client.ts:9-73`:

```
sendRequest() retry logic:
- 5 attempts, 2s between retries
- On ENOENT/ECONNREFUSED:
  - macOS (line 28-31): calls ensureDaemonInstalled() + waitForDaemon(5000) on first failure
  - non-macOS: just retries with stderr message
- After all retries fail on non-macOS (line 39-71):
  - Prints "Sisyphus daemon is not running"
  - On Linux: suggests `sisyphusd &`, `nohup`, or systemd unit
  - Throws error — does NOT auto-start
```

**Critical finding: There is NO auto-start on Linux.** The daemon must be started manually or via systemd. The CLI only auto-installs on macOS via launchd. On Linux, after 5 failed connection attempts (~10s), it throws with instructions.

For Docker tests, the daemon must be started explicitly before any CLI commands:
```bash
node dist/daemon.js &
sleep 1  # wait for socket
```

## 6. Protocol messages that work without tmux

**Safe (no tmux):**
| Message Type | Notes |
|---|---|
| `status` (no sessionId) | Returns `{ message: 'daemon running' }` — `server.ts:149` |
| `status` (with sessionId) | Reads state.json from disk — `server.ts:131-148` |
| `list` | Reads state files from disk — `server.ts:153-180` |
| `companion` | Reads/writes `companion.json` — `server.ts:325-331` |
| `message` | Writes to state + optional file — `server.ts:295-322` |
| `update-task` | Writes to state — `server.ts:288-292` |
| `delete` | Removes session directory — `server.ts:258-273` |

**Requires tmux (will error):**
| Message Type | Why |
|---|---|
| `start` | `sessionManager.startSession()` creates tmux session |
| `spawn` | Creates tmux pane for agent |
| `resume` | Creates/reuses tmux session |
| `submit` | Needs `tracking.windowId` — `server.ts:96` |
| `yield` | Orchestrator lifecycle, needs tmux |
| `complete` | Kills tmux session |
| `kill` | Kills tmux panes/session |
| `kill-agent` | Kills tmux pane |
| `restart-agent` | Spawns new tmux pane |
| `rollback` | Kills running agent panes |
| `reopen-window` | Creates tmux window |
| `pane-exited` | Pane lifecycle |

**Note on `submit`**: Even though it writes to disk, it checks `tracking.windowId` (line 96) and returns error if missing. The window ID is set during `start`/`resume` which require tmux.

## Summary for Docker Integration Tests

**Minimum viable daemon test:**
1. Install Node 22+
2. `node dist/daemon.js &` (no tmux needed)
3. Connect to `~/.sisyphus/daemon.sock`, send `{"type":"status"}\n`
4. Assert response `{"ok":true,"data":{"message":"daemon running"}}`

**To test session operations**, tmux must be installed and a server running. The daemon doesn't check for tmux at startup, but `sessionManager.startSession()` will call tmux commands that fail without it.

**Config recommendation for Docker**: Set `autoUpdate: false` in `~/.sisyphus/config.json` to skip npm update checks.
