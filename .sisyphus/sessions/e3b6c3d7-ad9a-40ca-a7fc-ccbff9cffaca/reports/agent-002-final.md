Findings saved to explore-daemon-headless.md. Key results:

1. Daemon starts and creates socket WITHOUT tmux — no tmux check at startup (src/daemon/index.ts:215-258)
2. CLI gates tmux check BEFORE contacting daemon (src/cli/commands/start.ts:21-34), exits with error
3. Daemon runs fine in Docker — needs only Node 22+ and writable ~/.sisyphus/. No TTY/display required
4. Simplest smoke test: connect to socket, send {type:'status'}, expect {ok:true, data:{message:'daemon running'}} (server.ts:149)
5. NO auto-start on Linux — CLI retries 5x then throws with manual start instructions (client.ts:39-71). Must start daemon explicitly in Docker
6. Safe without tmux: status, list, companion, message, update-task, delete. Everything session-lifecycle (start/spawn/resume/yield/complete/kill) needs tmux

Recommendation: disable autoUpdate in config for Docker tests