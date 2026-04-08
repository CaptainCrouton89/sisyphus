---
description: Open a standalone Claude Code session outside sisyphus for ad-hoc work
argument-hint: <prompt for the scratch session>
---
# Scratch Session

**Input:** $ARGUMENTS

The user wants to spin up a standalone Claude Code session — outside sisyphus orchestration — for something that came up during this session. This is not an agent; it's an independent session the user controls.

Run the following in bash:

```bash
sisyphus scratch "$ARGUMENTS"
```

This opens a new tmux window in the home session with `claude --dangerously-skip-permissions`. Do not track it, wait for it, or reference it in the roadmap. It's fire-and-forget.

Pass the session a reference to relevant context files and any other additional context that would be helpful for it to complete its task.
