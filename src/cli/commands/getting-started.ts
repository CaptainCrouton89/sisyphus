import type { Command } from 'commander';
import { isTmuxInstalled } from '../tmux.js';
import { isNvimAvailable } from '../onboard.js';

function isClaudeCode(): boolean {
  return !!process.env['CLAUDECODE'];
}

function printNonClaudeMessage(): void {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   sisyphus getting-started — Interactive Tutorial ║
  ╚══════════════════════════════════════════════════╝

  This command provides an interactive tutorial best experienced
  inside Claude Code. Claude will walk you through setup step by step.

  To start:
    1. Open Claude Code:  claude
    2. Run:               sisyphus getting-started

  If you just want the quick reference, run:
    sisyphus --help
    sisyphus doctor
`);
}

function printStep0(): void {
  const tmuxInstalled = isTmuxInstalled();
  const inTmux = !!process.env['TMUX'];
  let tmuxSession: string | null = null;
  if (process.env['TMUX']) {
    const segments = process.env['TMUX'].split(',');
    const pathPart = segments[0];
    if (pathPart) {
      const parts = pathPart.split('/');
      tmuxSession = parts[parts.length - 1] || null;
    }
  }

  console.log(`
<claude-instructions>
# Sisyphus Getting Started — Step 0: Entry & Tmux Gate

## Environment Data
- tmuxInstalled: ${tmuxInstalled}
- inTmux: ${inTmux}
- tmuxSession: ${tmuxSession ?? 'none'}

## Tutorial Overview

This tutorial has 5 steps. Share this overview so the user knows what's coming and can skip ahead:

| Step | Topic | Command |
|------|-------|---------|
| 0 | Entry & tmux gate (you are here) | \`sisyphus getting-started\` |
| 1 | Tmux basics — sessions, panes, navigation | \`--tutorial 1\` |
| 2 | Nvim basics — open, save, quit (optional) | \`--tutorial 2\` |
| 3 | Sisyphus concepts — session model & keybinds | \`--tutorial 3\` |
| 4 | Live demo — launch and observe a real session | \`--tutorial 4\` |

Tell the user they can skip to any step with \`sisyphus getting-started --tutorial <N>\`.

## Instructions for Claude

You are guiding a user through the Sisyphus interactive tutorial.

### First: Ask if they want the tutorial

Ask the user if they'd like the interactive walkthrough. If they decline, give this quick summary and stop:

> Sisyphus is a multi-agent orchestrator for Claude Code. Start a session with \`sisyphus start "task"\`,
> monitor with \`sisyphus dashboard\`, and check health with \`sisyphus doctor\`.

### If they want the tutorial:

**Case 1: tmux is NOT installed (tmuxInstalled: false)**
- Explain what tmux is in 2-3 sentences: "tmux is a terminal multiplexer — it lets you split your terminal into multiple panes and keep sessions running in the background. Sisyphus uses it to give each agent its own workspace."
- Show this ASCII diagram:

\`\`\`
  Regular terminal:          With tmux:
  ┌──────────────┐          ┌──────┬──────┐
  │              │          │ Agent│ Agent│
  │   one view   │          │  001 │  002 │
  │              │          ├──────┼──────┤
  │              │          │ Agent│ Orch │
  └──────────────┘          │  003 │      │
                            └──────┴──────┘
\`\`\`

- Tell them to install tmux:
  - macOS: \`brew install tmux\`
  - Linux: \`apt install tmux\` or their package manager
- After install, re-run: \`sisyphus getting-started --tutorial 0\` to verify

**Case 2: tmux installed but NOT in a tmux session (inTmux: false)**
- Tell the user they need to be inside a tmux session for the tutorial
- Have them run: \`tmux new-session\`
- Then resume the conversation with Claude in the new tmux session: \`claude\`
- Then re-run: \`sisyphus getting-started --tutorial 0\` to verify

**Case 3: In tmux (inTmux: true)**
- Tell the user they're all set — tmux is running
- Proceed by running: \`sisyphus getting-started --tutorial 1\`
</claude-instructions>
`);
}

function printStep1(): void {
  console.log(`
<claude-instructions>
# Sisyphus Getting Started — Step 1: Tmux Basics

## Instructions for Claude

Teach the user tmux fundamentals. Be conversational and encouraging.

### 1. Explain the concepts with diagrams

**Sessions, Windows, and Panes:**

\`\`\`
tmux session "work"
├── window 1: "code"
│   ┌──────────┬──────────┐
│   │  pane 1  │  pane 2  │
│   │  (editor)│  (tests) │
│   └──────────┴──────────┘
└── window 2: "servers"
    ┌──────────────────────┐
    │       pane 1         │
    │    (dev server)      │
    └──────────────────────┘
\`\`\`

- **Session**: A collection of windows. Persists even if you close the terminal.
- **Window**: Like a tab. Each window fills the screen.
- **Pane**: A split within a window. Sisyphus puts each agent in its own pane.

### 2. Hands-on: Create a test split

Run this command for the user:
\`\`\`
tmux split-window -h
\`\`\`

Tell them: "I just split your terminal. You should see two panes side by side."

Explain navigation:
- \`Ctrl-b\` then \`→\` (right arrow): move to the right pane
- \`Ctrl-b\` then \`←\` (left arrow): move to the left pane
- The prefix \`Ctrl-b\` is always pressed first, then released, then the arrow key

Ask them to try navigating between panes.

### 3. Clean up the test pane

Once they confirm they can navigate, close the extra pane:
\`\`\`
tmux kill-pane -t {the other pane}
\`\`\`

Or tell them they can type \`exit\` in the extra pane to close it.

### 4. Teach essential commands

- **Detach**: \`Ctrl-b d\` — leaves tmux running in background, returns to normal terminal
- **Reattach**: \`tmux attach\` (or \`tmux a\`) — reconnects to the running session
- **Scroll mode**: \`Ctrl-b [\` — lets you scroll up through output. Press \`q\` to exit scroll mode.

### 5. Verification

Ask the user to confirm: "Can you navigate between panes with Ctrl-b + arrow keys?"

Once confirmed, proceed:
\`\`\`
sisyphus getting-started --tutorial 2
\`\`\`
</claude-instructions>
`);
}

function printStep2(): void {
  const nvimInstalled = isNvimAvailable();

  console.log(`
<claude-instructions>
# Sisyphus Getting Started — Step 2: Nvim Basics

## Environment Data
- nvimInstalled: ${nvimInstalled}

## Instructions for Claude

This step is OPTIONAL. Nvim is useful for reviewing agent work in tmux panes but not required.

### If nvim is NOT installed (nvimInstalled: false)

Ask the user: "Neovim is handy for reviewing files in tmux panes. Want me to install it, or skip this step?"

- **Install**: Run \`brew install neovim\` (macOS) or suggest their package manager
- **Skip**: That's fine — they can use \`cat\`, \`less\`, or any editor they prefer. Proceed to step 3.

### If nvim IS installed (nvimInstalled: true)

Teach exactly 3 things — no more:

1. **Open a file**: \`nvim filename.txt\`
2. **Save and close**: \`ZZ\` (capital Z twice — hold Shift, press Z twice)
3. **Quit without saving**: \`:q!\` (colon, q, exclamation mark, Enter)

### Hands-on exercise

Create a temporary file for practice:
\`\`\`
echo "Hello from the sisyphus tutorial!" > /tmp/sisyphus-tutorial-test.txt
\`\`\`

Walk them through:
1. Open it: \`nvim /tmp/sisyphus-tutorial-test.txt\`
2. Look around (they're in normal mode — arrow keys work for navigation)
3. Close it: type \`ZZ\`

Tell them: "That's all you need. When you jump into a sisyphus agent's pane, you can use \`nvim\` to inspect files the agent is working on."

### Verification

Ask if they were able to open and close the file (or if they skipped).

Proceed:
\`\`\`
sisyphus getting-started --tutorial 3
\`\`\`
</claude-instructions>
`);
}

function printStep3(): void {
  console.log(`
<claude-instructions>
# Sisyphus Getting Started — Step 3: Sisyphus Concepts & Keybinds

## Instructions for Claude

### 1. Explain the session model

This is the KEY concept. Use the diagram and be clear:

\`\`\`
  YOUR tmux session ("work")        Sisyphus tmux session ("sisyphus-abc123")
  ┌─────────────────────┐          ┌──────────┬──────────┬──────────┐
  │                     │          │  Orch    │  Agent   │  Agent   │
  │  Your normal work   │   ←──→  │  (yellow)│  (blue)  │  (green) │
  │  + dashboard        │          │          │          │          │
  │                     │          │  Plans & │  Writes  │  Writes  │
  │                     │          │  assigns │  code    │  tests   │
  └─────────────────────┘          └──────────┴──────────┴──────────┘
\`\`\`

Key points:
- Sisyphus creates its OWN tmux session — it doesn't clutter yours
- The **orchestrator** (yellow pane) plans work and spawns agents
- **Agents** (colored panes) work in parallel on subtasks
- Your session stays clean — you get a **dashboard** for monitoring
- You can jump between your session and the sisyphus session to observe

### 2. Teach keybinds

Two keybinds to remember:

| Keybind | Action |
|---------|--------|
| \`M-s\` (Option+s) | Cycle through sisyphus sessions |
| \`M-S\` (Option+Shift+s) | Jump back to dashboard |

"M" means "Meta" which is the Option key on macOS. So \`M-s\` = hold Option, press s.

### 3. Verify keybinds are installed

Run \`sisyphus doctor\` and check the output. Look for:
- "Cycle script" — should be ✓
- "Tmux keybind" — should be ✓

If either is missing, run: \`sisyphus setup-keybind\`

### 4. Test the keybind

Have the user try pressing \`Option+s\`. Nothing should happen yet (no sisyphus session running) — and that's fine. The important thing is it doesn't error.

If they get a special character (like ß) instead of the keybind firing, explain:
- Their terminal needs to send Option as Esc+ (Meta)
- iTerm2: Settings → Profiles → Keys → Right Option Key → Esc+
- Other terminals: look for "Meta key" or "Option sends" in preferences

### 5. Verification

Confirm:
- They understand the two-session model (their session vs sisyphus session)
- \`sisyphus doctor\` shows keybinds installed
- Option+s doesn't produce a special character

Proceed:
\`\`\`
sisyphus getting-started --tutorial 4
\`\`\`
</claude-instructions>
`);
}

function printStep4(): void {
  console.log(`
<claude-instructions>
# Sisyphus Getting Started — Step 4: Demo Session

## Instructions for Claude

This is the grand finale — a live demo session.

### 1. Health check

Run \`sisyphus doctor\` first. If any checks are failing, help the user fix them before proceeding.
All core checks (tmux, daemon, keybinds) should be ✓.

### 2. Launch the demo

Run this command:
\`\`\`
sisyphus start "Tutorial demo: explore this repository's structure, identify the main entry points, and write a brief summary of what each top-level directory contains" -c "This is a tutorial demo session. Be extra verbose in your planning and reports so the user watching can understand what's happening. Keep the scope small — 2-3 agents max, 1-2 cycles."
\`\`\`

### 3. Walk through what's happening

Guide the user through observing the session in real-time:

**Step A: Dashboard**
- The dashboard should auto-open. If not, run \`sisyphus dashboard\`
- Point out: session status, cycle number, agent list
- Tell them: "Watch the roadmap section — it updates as the orchestrator plans"

**Step B: Jump to sisyphus session**
- Have them press \`M-s\` (Option+s) to cycle to the sisyphus tmux session
- They should see the orchestrator (yellow) working — reading files, planning
- Point out: "Each pane is a separate Claude instance working independently"

**Step C: Jump back**
- Press \`M-S\` (Option+Shift+s) to jump back to the dashboard
- Or \`M-s\` to cycle through

**Step D: Watch the lifecycle**
- As agents spawn, they'll appear in both the dashboard and the sisyphus session
- Agents submit reports when done
- The orchestrator respawns each cycle with fresh context
- Eventually the session completes

### 4. After completion

Once the session shows "completed":

- Run \`sisyphus status\` to see the final state
- Show them the session directory: \`ls .sisyphus/sessions/\` → find the session → show \`roadmap.md\`
- Explain: "Every session creates a roadmap, agent reports, and logs — all in .sisyphus/sessions/"

### 5. Congratulations!

Wrap up with:

> You've completed the Sisyphus tutorial! Here's what you learned:
> - tmux basics (sessions, panes, navigation)
> - How sisyphus creates separate sessions for orchestrator + agents
> - How to monitor with the dashboard and keybinds
> - What a real session lifecycle looks like
>
> **Ready for real work?**
> \`sisyphus start "your actual task here"\`
>
> **Tips:**
> - Write requirements in a file and reference them: \`sisyphus start "Implement @requirements.md"\`
> - Monitor actively — agents can get stuck. Use the dashboard's \`m\` key to message the orchestrator.
> - Check \`sisyphus --help\` for all commands.
</claude-instructions>
`);
}

const STEPS: Array<() => void> = [printStep0, printStep1, printStep2, printStep3, printStep4];

export function registerGettingStarted(program: Command): void {
  program
    .command('getting-started')
    .description('Interactive tutorial (best with Claude Code)')
    .option('--tutorial <step>', 'Tutorial step (0-4)', parseInt)
    .action((opts) => {
      if (opts.tutorial !== undefined) {
        const step = opts.tutorial as number;
        if (step < 0 || step > 4 || Number.isNaN(step)) {
          console.error(`Invalid tutorial step: ${opts.tutorial}. Must be 0-4.`);
          process.exit(1);
        }
        STEPS[step]!();
        return;
      }
      if (!isClaudeCode()) {
        printNonClaudeMessage();
        return;
      }
      printStep0();
    });
}
