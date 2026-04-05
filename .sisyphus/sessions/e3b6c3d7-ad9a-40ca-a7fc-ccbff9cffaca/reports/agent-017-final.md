Completed brainstorm of 15 adversarial tmux integration test scenarios. Key findings:

HIGHEST IMPACT (will bite real users):
1. Dots in project directory names silently mangled by tmux → stored name mismatches actual name → all tmux operations fail (scenario 11)
2. tmux kill-server during active session → daemon respawns into invisible server (scenario 6)
3. Powerline/status bar plugins overwrite status-right → sisyphus UI disappears (scenario 10)
4. Custom TMUX_TMPDIR or -L socket → daemon talks to wrong tmux server (scenarios 5, 14)
5. Old tmux (<3.1) missing per-pane user options → raw format strings visible (scenario 9)

NOTABLE CODE ISSUES FOUND:
- tmux.ts:112 — tmuxSessionName() doesn't sanitize dots despite the comment acknowledging tmux converts them. State stores dotted name, tmux uses underscored name. This is a real bug.
- status-bar.ts — statusRightInjected is never re-checked. Any external status-right overwrite is permanent.
- notify.ts — hardcoded /tmp/tmux-{uid}/default socket path (already noted in CLAUDE.md)

All 15 scenarios saved to context/brainstorm-tmux-adversarial.md