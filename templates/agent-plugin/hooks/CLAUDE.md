# templates/agent-plugin/hooks/

## hooks.json

Schema: maps phase names to hook-type → script-name objects. Hook types: `userPrompt`, `systemPrompt`.

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

## Single-fire pattern for `userPrompt` hooks

`userPrompt` fires on **every** user message, not just the first. Use a flag file to fire only once:
```bash
FLAG_FILE="/tmp/sisyphus-hooks/${SISYPHUS_SESSION_ID}/${SISYPHUS_AGENT_ID}-{name}"
[ -f "$FLAG_FILE" ] && exit 0
mkdir -p "$(dirname "$FLAG_FILE")" && touch "$FLAG_FILE"
```

## Heredoc delimiter must be single-quoted

Use `<<'HINT'` (not `<<HINT`) in all prompt-body heredocs. Unquoted delimiters expand `$INSTRUCTION`, backticks, and any `$SISYPHUS_*` vars inside the body — silently corrupting static prose. To interpolate an env var, assign it before the heredoc and emit it via a separate `printf` after.

## Stop hooks read stdin

Stop hooks receive hook input JSON on stdin (`stop_hook_active`, `transcript_path`, etc.). Read it once into a variable before any other processing. If `stop_hook_active` is true, exit 0 immediately — otherwise blocking produces an infinite retry loop.
