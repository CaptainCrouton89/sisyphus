# templates/agent-plugin/hooks/

## hooks.json is generated at spawn time

There is no static `hooks.json` in this directory — `src/daemon/agent.ts` generates it per-agent at spawn time and copies only the scripts it needs. Editing scripts here has no effect on running agents; they need to be respawned.

## Adding a new `{type}-user-prompt.sh` hook

The `{type}-user-prompt.sh` naming convention does **not** auto-register the hook. There is a hardcoded map in `src/daemon/agent.ts` (`userPromptHooks`) — add an entry there or the script is never copied or wired. Only `require-submit.sh` and `intercept-send-message.sh` are copied unconditionally for every agent.

## `interactive` frontmatter suppresses the Stop hook

If an agent's `.md` frontmatter has `interactive: true`, `require-submit.sh` is not added to the Stop phase. Interactive agents are designed for user back-and-forth and must not be blocked at stop time.

## Shell Scripts

- Receive `$SISYPHUS_SESSION_ID`, `$SISYPHUS_AGENT_ID`, `$SISYPHUS_SESSION_DIR`, `$INSTRUCTION`, `$AGENT_TYPE` as env vars
- Must write complete prompt text to stdout
- Exit non-zero to fail agent spawn; errors logged to `daemon.log`
- **No placeholders** — unlike `.md` templates, scripts perform logic and generate final text directly

## Output format differs by hook type

- **Prompt hooks** (`userPrompt`, `systemPrompt`): write raw text to stdout
- **Pre-tool hooks** (e.g. `intercept-send-message.sh`): write JSON `{"decision":"block","reason":"..."}` or exit 0 to allow

## Passthrough guard is required

Claude Code invokes these scripts unconditionally — not only during sisyphus sessions. Always guard:
```bash
if [ -z "$SISYPHUS_SESSION_ID" ]; then exit 0; fi
```
Stop hooks also need `$SISYPHUS_AGENT_ID` for per-agent state; guard both.

## Every-message vs single-fire for `userPrompt` hooks

`userPrompt` fires on **every** user message. Two patterns:

- **Every-message (default):** behavioral reinforcement hints — inject on every turn. Guard only `$SISYPHUS_SESSION_ID`. Most hooks use this.
- **Single-fire:** initial priming with context that shouldn't repeat (e.g., multi-stage session instructions). Guard both `$SISYPHUS_SESSION_ID` and `$SISYPHUS_AGENT_ID`, then:
```bash
FLAG_FILE="/tmp/sisyphus-hooks/${SISYPHUS_SESSION_ID}/${SISYPHUS_AGENT_ID}-{name}"
[ -f "$FLAG_FILE" ] && exit 0
mkdir -p "$(dirname "$FLAG_FILE")" && touch "$FLAG_FILE"
```

## Prompt hook bodies use XML wrapper tags

All `userPrompt`/`systemPrompt` hooks wrap output in `<{agent-type}-reminder>` tags (e.g. `<review-reminder>`, `<explore-reminder>`). This lets Claude distinguish injected meta-instructions from real user messages. Tag name should match the agent type the hook targets.

## Heredoc delimiter must be single-quoted unless interpolating

Use `<<'HINT'` for static prose — unquoted delimiters silently expand `$INSTRUCTION`, backticks, and `$SISYPHUS_*` vars inside the body. When you need to interpolate a path or derived value: assign a local var before the heredoc (`CONTEXT_DIR="${SISYPHUS_SESSION_DIR}/context"`), then use unquoted `<<HINT` with `${CONTEXT_DIR}` inline. Never put raw `$SISYPHUS_*` or `$INSTRUCTION` directly inside an unquoted heredoc body.

## Stop hooks read stdin

Stop hooks receive hook input JSON on stdin (`stop_hook_active`, `transcript_path`, etc.). Read it once into a variable before any other processing. If `stop_hook_active` is true, exit 0 immediately — otherwise blocking produces an infinite retry loop.

`transcript_path` from stdin points to the agent's JSONL conversation log. Stop hooks that need to assess completion state can parse it — e.g. scanning for launched vs completed background task IDs to avoid blocking an agent that still has pending work. See `require-submit.sh` for the full pattern.

## Submitted-state signal for stop hooks

`${SISYPHUS_SESSION_DIR}/reports/${SISYPHUS_AGENT_ID}-final.md` exists when an agent has called `sisyphus submit`. Stop hooks should check this file before scanning the transcript — it's cheaper and avoids re-blocking agents that already submitted cleanly.
