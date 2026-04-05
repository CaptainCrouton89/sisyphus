# Adversarial TUI / NvimBridge / Terminal Rendering Test Scenarios

Based on reading the actual source: `nvim-bridge.ts`, `render.ts`, `app.ts`, `state.ts`, `terminal.ts`, `input.ts`, `panels/nvim-detail.ts`.

---

## 1. No Neovim Installed

- **What the user does**: Launches TUI on a system without neovim
- **What breaks**: `execSync('which nvim')` throws (nvim-bridge.ts:53-59). `available = false`. Detail panel must render text-based fallback instead of nvim embed.
- **How to test**: Docker image with no nvim. Launch TUI, navigate to detail panel, verify text-based rendering works and no crash/hang occurs. Verify compose mode falls back gracefully (no nvim = no compose, or text-based compose).
- **Tier**: Tier 1 (minimal — no neovim needed)

---

## 2. Neovim Crashes Mid-Session

- **What the user does**: Has nvim running in NvimBridge, nvim segfaults or is killed externally
- **What breaks**: PTY `onExit` fires (nvim-bridge.ts:135-142), sets `ready = false`. App auto-respawn logic (app.ts:557-568) triggers if `wasReady && !ready`. If respawn also fails, `nvimEnabled = false` permanently. Risk: user in compose mode when crash happens — signal file polling (input.ts:172) never gets written, compose hangs until timeout.
- **How to test**: Launch TUI, open detail panel with nvim. `kill -9 $(pgrep -f 'nvim.*sisyphus')` from another shell. Verify: (a) respawn occurs, (b) no TUI crash, (c) if in compose mode, compose cancels cleanly.
- **Tier**: Tier 2 (needs working nvim + node-pty)

---

## 3. Neovim Slow Startup (30+ seconds, plugin downloads)

- **What the user does**: Has LazyVim/AstroNvim config that downloads plugins on first launch in a fresh HOME
- **What breaks**: NvimBridge has a 500ms readiness timeout (nvim-bridge.ts:145-154) — it marks `ready = true` after 500ms regardless. But nvim may still be downloading plugins, producing unexpected output in the xterm buffer. The detail panel renders whatever garbage is in the xterm buffer (plugin download progress bars, git clone output). User sees plugin installation UI instead of file content.
- **How to test**: Create a neovim config with `init.lua` that does `vim.fn.system('sleep 30')` or install lazy.nvim pointing at many plugins. Set `XDG_CONFIG_HOME` to that config dir. Launch TUI, open detail panel. Observe what renders during the 30s startup.
- **Tier**: Tier 2 (needs nvim + custom config)

---

## 4. Neovim init.lua Has Syntax Errors

- **What the user does**: Has broken neovim config (syntax error in init.lua)
- **What breaks**: Neovim starts but shows error messages at startup. These appear in the xterm buffer. NvimBridge marks ready after 500ms. The error messages may persist in the buffer and interfere with file rendering. The `-c` post-init commands (laststatus=0, etc.) may not execute if init.lua errors halt startup.
- **How to test**: Create `init.lua` with `this is not valid lua`. Set XDG_CONFIG_HOME. Launch TUI. Check if nvim error messages bleed into detail panel, and whether post-init cosmetic settings still apply.
- **Tier**: Tier 2

---

## 5. XDG_CONFIG_HOME Set to Nonstandard Location

- **What the user does**: Has `XDG_CONFIG_HOME=/weird/path` with nvim config there
- **What breaks**: NvimBridge inherits `process.env` (nvim-bridge.ts:118) so nvim respects XDG. But if the nonstandard path doesn't exist, nvim may error or use defaults. If it points to a config with heavy plugins, see scenario 3. The key risk: NvimBridge suppresses LSP (`vim.lsp.start = function() end`) via `--cmd`, but if user config overrides this later in init.lua, LSP starts anyway, consuming CPU and producing hover popups in the embedded session.
- **How to test**: `XDG_CONFIG_HOME=/tmp/fake-xdg mkdir -p /tmp/fake-xdg/nvim && echo 'print("custom config loaded")' > /tmp/fake-xdg/nvim/init.lua`. Launch TUI. Verify config is loaded. Then test with nonexistent path.
- **Tier**: Tier 2

---

## 6. Terminal Too Small (Below 60x12 Minimum)

- **What the user does**: Runs TUI in a very small terminal (e.g., 40x10)
- **What breaks**: App detects `cols < 60 || rows < 12` (app.ts:373-378) and shows "Terminal too small — resize to continue". But: what if the terminal is SO small that even the centered message doesn't fit? `writeCenter` writes at `rows/2` — if rows=2, it writes at row 1, which is fine. But the message itself is 40 chars — if cols < 40, it gets clipped by framebuffer width. Also: NvimBridge may have already been spawned with a valid size, then resize arrives — does `resize(Math.max(1,...))` handle the case where `detailW - 4 < 1`?
- **How to test**: `docker run -it --env COLUMNS=40 --env LINES=10 ...` or use `stty rows 10 cols 40` before launching. Verify: message displays, no crash, resize back to normal recovers rendering.
- **Tier**: Tier 1 (no nvim needed for basic test; Tier 2 for nvim resize edge case)

---

## 7. Terminal Resize During Active NvimBridge Session

- **What the user does**: Resizes terminal window while editing a file in nvim embed
- **What breaks**: SIGWINCH → render → `nvimBridge.resize(newW, newH)` (app.ts:714-720). The resize formula is `Math.max(1, detailW - 4)` where `detailW = cols - 36`. If user rapidly resizes (window manager drag), many SIGWINCH signals fire. Each triggers a render + nvim resize. Nvim redraws are expensive — could cause visible lag or frame tearing. The xterm buffer dimensions change but nvim may not have redrawn yet when `getRows()` is called, producing stale content in the framebuffer.
- **How to test**: Launch TUI with nvim detail panel open. Script rapid resize: `for i in $(seq 80 200); do stty cols $i; kill -WINCH $PID; sleep 0.05; done`. Check for: crashes, rendering artifacts, nvim content alignment after resize settles.
- **Tier**: Tier 2

---

## 8. TERM=dumb (No ANSI Support)

- **What the user does**: Launches TUI with `TERM=dumb` or from a non-interactive pipe
- **What breaks**: TUI assumes ANSI support always works — no detection (render.ts uses raw `\x1b[` sequences unconditionally). Synchronized output `\x1b[?2026h/l` is a DEC private mode not supported by dumb terminals. Raw mode setup (`process.stdin.setRawMode(true)`) may throw if stdin is not a TTY. Frame-buffer diffing with cursor positioning `\x1b[{row};1H` produces garbage on dumb terminals.
- **How to test**: `TERM=dumb sisyphus tui`. Also: `echo "" | sisyphus tui` (non-TTY stdin). Verify: graceful error message ("Terminal not supported") rather than garbage output or crash.
- **Tier**: Tier 1

---

## 9. LANG=C / Non-UTF-8 Locale

- **What the user does**: System locale is `LANG=C` (ASCII only) instead of `en_US.UTF-8`
- **What breaks**: TUI uses Unicode box-drawing characters and possibly emoji in status indicators. With `LANG=C`, the terminal may not render multi-byte characters correctly. `displayWidthFast()` in render.ts may miscalculate widths for characters that are multi-byte in UTF-8 but displayed as `?` or replacement chars in C locale. Frame alignment breaks — columns shift, panel borders misalign.
- **How to test**: `LANG=C LC_ALL=C sisyphus tui`. Navigate through panels. Check: box-drawing chars render or degrade, column alignment holds, no crashes from width miscalculation.
- **Tier**: Tier 1

---

## 10. node-pty Prebuilds Without Execute Permission

- **What the user does**: Installs sisyphus but node-pty prebuilt binaries lack +x (common in CI, restrictive umask, or mounted volumes)
- **What breaks**: NvimBridge's dynamic `import('node-pty')` at spawn time (nvim-bridge.ts:68) may succeed (JS loads fine) but the actual PTY spawn fails with EACCES when trying to exec the native addon. The `.catch()` on spawn() (line 61) catches this and sets `available = false`. But: is the error message helpful? Does the user know WHY nvim embed isn't working? Also: this affects ALL node-pty usage, not just nvim — if agent panes use node-pty, those break too.
- **How to test**: `chmod -x node_modules/node-pty/build/Release/pty.node` (or equivalent prebuild path). Launch TUI. Verify: (a) no crash, (b) graceful fallback, (c) `sisyphus doctor` detects and reports this.
- **Tier**: Tier 1 (can test without nvim)

---

## 11. Compose Mode: Nvim Dies During Message Composition

- **What the user does**: Enters compose mode (opens nvim for message editing), nvim crashes
- **What breaks**: Compose uses a signal file mechanism (input.ts:172): nvim writes "1" on BufWritePost (submit) or "cancel" on QuitPre. If nvim crashes, neither event fires. The polling loop (`checkCompose` in input.ts) checks every 100ms for the signal file. Without the signal, compose hangs indefinitely. The `onExit` handler (nvim-bridge.ts:135) sets `ready = false` but doesn't write the signal file. The raw bypass handler (input.ts:108-113) returns `false` when `!ready`, so input re-processes normally — but the compose state may still be active.
- **How to test**: Enter compose mode. Kill nvim process. Verify: compose cancels within a reasonable timeout, user can continue using TUI, no orphaned temp files.
- **Tier**: Tier 2

---

## 12. Very Large Terminal (200+ Columns, 80+ Rows)

- **What the user does**: Uses ultrawide monitor, terminal at 300x80
- **What breaks**: Frame-buffer allocates `width * height` strings. At 300x80 = 24000 cells, this is fine for memory. But: `clipAnsi()` pads every line to exact width with spaces (render.ts:102-132). At 300 cols, each line has up to 300 chars of padding. The `flushFrame` diff sends entire lines when any char changes — at 300 cols, that's more bytes per line. Performance may degrade with many changed lines. NvimBridge detail panel gets `300 - 36 - 4 = 260` cols — nvim renders fine but xterm buffer parsing (getRows at nvim-bridge.ts:302-440) processes wider lines with more SGR sequences.
- **How to test**: `stty cols 300 rows 80`. Launch TUI with a session. Navigate panels. Measure render time / CPU usage. Compare with 80x24.
- **Tier**: Tier 1 (no nvim needed for basic perf); Tier 2 for nvim detail

---

## 13. NvimBridge LSP Suppression Bypass

- **What the user does**: Has neovim config that starts LSP via mechanism other than `vim.lsp.start` (e.g., nvim-lspconfig uses `vim.lsp.start_client` on older versions, or user has custom LSP setup)
- **What breaks**: NvimBridge suppresses LSP with `--cmd 'lua vim.lsp.start = function() end'` (nvim-bridge.ts:108). But `vim.lsp.start` was added in nvim 0.8+. Older nvim versions use `vim.lsp.start_client`. Configs using that function bypass suppression. LSP processes spawn inside the embedded session, consuming CPU, producing diagnostics, hover popups, and code actions that interfere with the clean file view. On bleeding-edge nightly, the API may have changed again.
- **How to test**: Create nvim config that uses `vim.lsp.start_client()` directly. Launch TUI, open a file with matching LSP server available. Check if LSP starts, check CPU usage, check for diagnostic popups in the rendered output.
- **Tier**: Tier 2

---

## 14. Synchronized Output Not Supported

- **What the user does**: Uses a terminal emulator that doesn't support DEC synchronized output (`\x1b[?2026h/l`) — e.g., older xterm, Terminal.app, some SSH configurations
- **What breaks**: `flushFrame()` wraps all output in `\x1b[?2026h` ... `\x1b[?2026l` (render.ts:78-90). Terminals that don't support this ignore the sequences — which is fine, they're designed to be ignored. But without sync, rapid multi-line updates cause visible flicker as each line paints sequentially. This is cosmetic, not functional, but degrades UX significantly on fast-updating panels (log streaming, agent status changes).
- **How to test**: `TERM=xterm` (not xterm-256color) in a basic xterm build without sync support. Launch TUI with active session. Watch for flicker during status updates. Compare with a modern terminal (kitty, wezterm, ghostty).
- **Tier**: Tier 1

---

## 15. Non-Interactive Shell Launch

- **What the user does**: Launches TUI from a script, cron, or other non-interactive context where stdin is not a TTY
- **What breaks**: `process.stdin.setRawMode(true)` throws `ERR_INVALID_ARG_TYPE` if stdin is not a TTY (terminal.ts:41-67). `process.stdout.columns` / `process.stdout.rows` are `undefined` — defaults to 80x24, but SIGWINCH never fires. If stdout is not a TTY, ANSI sequences write to a pipe/file, producing garbage. The TUI should detect non-interactive context and refuse to start with a clear error.
- **How to test**: `sisyphus tui < /dev/null`, `sisyphus tui | cat`, `echo "" | sisyphus tui`. Verify: clean error message, non-zero exit code, no stack trace.
- **Tier**: Tier 1

---

## 16. Old Neovim Version (0.7, 0.8)

- **What the user does**: Has neovim 0.7 or 0.8 installed (common on stable Debian/Ubuntu LTS)
- **What breaks**: NvimBridge uses Lua APIs that may not exist: `vim.lsp.start` (added 0.8), various `vim.api` calls. The `--cmd` lua inline may fail on 0.7 which had limited `--cmd lua` support. The `-c` post-init commands use `set fillchars` with values that changed across versions. If nvim 0.7 doesn't understand a command, it shows an error and may enter a weird state. The 500ms timeout marks ready regardless.
- **How to test**: `apt install neovim=0.7.2-*` in Docker (or build from source). Launch TUI. Check: nvim starts, no error messages bleed into render, file content displays correctly. Repeat with 0.8.
- **Tier**: Tier 2

---

## 17. Cursor Style Leak from NvimBridge

- **What the user does**: Uses nvim in detail panel (which changes cursor to block/beam via DECSCUSR), then navigates back to tree panel
- **What breaks**: NvimBridge captures `\x1b[(\d+) q` cursor style sequences (nvim-bridge.ts:123-132) and stores them. But does the TUI restore the original cursor style when focus leaves the detail panel? If not, the user's terminal cursor remains as nvim's cursor shape (e.g., block instead of beam) even in the tree panel or after exiting the TUI entirely.
- **How to test**: Launch TUI. Enter detail panel (nvim renders with block cursor). Press Tab to go back to tree. Check cursor shape. Exit TUI. Check cursor shape in parent shell.
- **Tier**: Tier 2

---

## 18. Race: Render During NvimBridge Respawn

- **What the user does**: Nvim crashes, auto-respawn triggers, render fires during respawn
- **What breaks**: Respawn (nvim-bridge.ts:162-171) disposes xterm, kills pty, nulls refs, then calls `spawn()`. If a render fires between disposal and spawn completion, `getRows()` accesses null xterm/pty. The `ready` flag should be `false` during this window, and the render path checks `nvimBridge?.ready` (app.ts:570). But: is there a race where `ready` is set to `true` (from previous session) before it's reset during respawn? The respawn sets `ready = false` only implicitly through `dispose()` — need to verify the flag is reliably false before spawn completes.
- **How to test**: Add artificial delay in spawn() (or mock). Kill nvim. Trigger manual render during respawn window. Check for null pointer exceptions or rendering artifacts.
- **Tier**: Tier 2 (requires code instrumentation)

---

## 19. Framebuffer Row Count Mismatch

- **What the user does**: Has a session with many agents (10+), making the tree panel taller than the detail/log panels
- **What breaks**: Panel rendering in app.ts concatenates tree, detail, and log rows. All panels must produce exactly `contentHeight` rows (app.ts). If any panel produces fewer or more rows, the framebuffer has misaligned lines — text from one panel bleeds into another's visual region. The `buildPanelRows()` function should pad/truncate to exact height, but edge cases with very tall trees or empty detail panels may not be covered.
- **How to test**: Create session with 15+ agents. Resize terminal to various heights (13 rows minimum to 100 rows). Check: no visual bleeding between panels, all borders align, scroll works correctly in all panels.
- **Tier**: Tier 1 (can mock session data) or Tier 2 (with real agents)

---

## 20. Multiple SIGWINCH During Single Render

- **What the user does**: Window manager tiles/untiles rapidly, or user drags resize handle
- **What breaks**: SIGWINCH handler calls `requestRender()` (terminal.ts:263-274). `requestRender()` deduplicates via `setImmediate` (state.ts:70-84) — only one render per event loop tick. But: `process.stdout.columns/rows` is read at render time (app.ts:365-368), not at signal time. Between signal and render, another SIGWINCH may have changed the size again. The render uses the LATEST size, which is correct. However, the NvimBridge resize uses the rendered size — if nvim is slow to process the resize, and another render fires with a new size before nvim finished, the xterm buffer dimensions and nvim's internal state diverge temporarily, causing content misalignment in `getRows()`.
- **How to test**: Script: rapidly alternate between 80x24 and 200x50 every 50ms for 5 seconds while TUI is showing nvim detail. Check for: crashes, permanent misalignment after resizing stops, memory leaks from accumulated resize events.
- **Tier**: Tier 2
