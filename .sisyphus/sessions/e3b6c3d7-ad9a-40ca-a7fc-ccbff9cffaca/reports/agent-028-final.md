Added test_tui_rendering and test_tui_input_handling to test/integration/suites/test-full.sh (lines 299-403), registered in run_full_tests().

test_tui_rendering:
- Starts daemon, creates a session ('tui rendering test'), launches 'sisyphus tui' in a named tmux window (tui-render-test:tui) with a real PTY
- Asserts: non-empty output (tui-renders-output), box-drawing border chars ╭/│/╰ (tui-shows-borders), status bar 'navigate'/'quit' hints (tui-shows-keyhints), session task text visible in tree (tui-shows-session-task)
- Cleanup: kill window, stop daemon, kill tmux server

test_tui_input_handling:
- Launches TUI in tui-input-test:tui window, captures initial output to confirm it rendered
- Sends 'q' via tmux send-keys — maps to actions.cleanup() → process.exit(0) in input.ts:897
- Primary pass condition: window closes (process exits). Fallback pass condition: output changed between captures
- Cleanup same pattern

Assertions source anchors:
- borders: render.ts drawBorder() always writes ╭─╮/╰─╯/│ around both tree and detail panels
- keyhints: bottom.ts renderStatusLine() writes 'navigate' and 'quit' in default tree-focused mode
- session task: tree.ts renderNodeContent() for 'session' type uses node.task truncated to ~maxLabel chars (40 max); 'tui rendering test' is 18 chars, safely under limit
- quit: input.ts:897 'if (input === "q") { actions.cleanup(); }'