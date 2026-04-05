#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --model 'sonnet' --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-001-plugin" --session-id "f82f24e8-627e-410b-8315-4be91abbe944" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-present-command plan-present-explore c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/prompts/agent-001-system.md')" 'Write a detailed implementation plan for `sisyphus present` to `context/plan-present.md` in the session directory.

## What to Build

A new CLI command `sisyphus present <file.md>` that:
1. Takes a termrender-flavored markdown file as input
2. Runs `termrender <file.md>` to produce ANSI-styled Unicode output
3. Saves the rendered output to a temp file AND keeps a copy as the "original"
4. Opens the temp file in neovim in a new tmux window
5. Blocks until the user saves and closes (`:wq`)
6. On close: strips ANSI from original and edited, diffs plain text, wraps user insertions in `<!-- -->` comment tags
7. Prints the annotated version to stdout (for the calling agent to capture)

## Codebase Pattern to Follow

Study `src/cli/commands/review.ts` — specifically the `runReviewTui()` function. The key blocking pattern:

```
const channel = `review-${randomBytes(4).toString('\''hex'\'')}`;
const cmd = `node ${binaryPath} ${targetPath}; tmux wait-for -S ${channel}; exit`;
const windowId = execSync(`tmux new-window -n ${windowName} -P -F "#{window_id}"`).trim();
execSync(`tmux send-keys -t ${windowId} ${cmd} Enter`);
// blocks:
execSync(`tmux wait-for ${channel}`);
// unblocked — read result
```

For `present`, the command running in the tmux window should be `nvim <temp-file>` instead of the node TUI. When nvim exits (`:wq`), the `;` chain continues to `tmux wait-for -S` which unblocks the caller.

## Registration

- New file: `src/cli/commands/present.ts` exporting `registerPresent(program: Command)`
- Register in `src/cli/index.ts` (import + call `registerPresent(program)`)
- NO protocol types, NO daemon handler — this is purely CLI-side

## Key Implementation Details to Plan

### 1. CLI Options
- Positional `<file>` argument (required — the markdown file)
- `--width <n>` — pass through to `termrender --width`
- The command always blocks (no `--wait` flag needed — blocking IS the behavior)

### 2. Termrender Invocation
- Use `execSync('\''termrender <file>'\'')` or `execFileSync` to capture stdout
- Handle error if termrender is not installed (clear error message)
- Capture the ANSI output as a Buffer/string

### 3. Temp File Management
- Write rendered output to a temp file (e.g., `/tmp/sisyphus-present-{random}.txt`)
- Also keep the original rendered content in memory for later comparison
- Clean up temp file after processing

### 4. Tmux Window + Neovim
- Create a new tmux window with `tmux new-window -n "present" -P -F "#{window_id}"`
- Send command: `nvim <temp-file>; tmux wait-for -S <channel>; exit`
- Block on `tmux wait-for <channel>`

### 5. ANSI Stripping
- Strip ANSI escape sequences from both original and edited content
- Regex pattern: `/\x1b\[[0-9;]*[a-zA-Z]/g` (covers SGR, cursor movement, etc.)
- Also strip: `/\x1b\][^\x07]*\x07/g` (OSC sequences) and `/\x1b[()][AB012]/g` (charset)

### 6. Diff + Annotation Logic (THE HARD PART — think carefully)
- Compare ANSI-stripped original lines vs ANSI-stripped edited lines
- Use a simple line-based diff (longest common subsequence or similar)
- For each line in the edited version that is NEW (not in original): wrap in `<!-- user: -->` and `<!-- /user -->`
- For contiguous blocks of insertions, wrap the block (not each line)
- Return the annotated ANSI-stripped edited text

Consider: what about MODIFICATIONS (user changed existing text)? The goal says "insertions" specifically — but modified lines should probably also be marked. Plan for both: inserted lines AND modified lines get comment markers.

### 7. Output
- Print annotated text to stdout
- Agent captures it from `sisyphus present` stdout

## File to Write
Save the plan to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/fcfeb129-4a68-4231-b9f3-0381a2a47ee0/context/plan-present.md

Include:
- File-by-file changes needed
- Implementation order
- The diff algorithm approach (be specific — pseudo-code or algorithm description)
- Edge cases (empty file, no changes, termrender not installed, user quits without saving)
- The exact ANSI strip regex patterns to use

IMPORTANT: Read `src/cli/commands/review.ts` and `src/cli/index.ts` before writing the plan. The plan must match real codebase patterns.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %402