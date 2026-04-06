# templates/agent-plugin/hooks/

## hooks.json

Schema: maps phase names to hook-type → script-name objects. Hook types: `userPrompt`, `systemPrompt`.

## Shell Scripts

- Receive `$SISYPHUS_SESSION_ID`, `$SISYPHUS_AGENT_ID`, `$INSTRUCTION`, `$AGENT_TYPE` as env vars
- Must write complete prompt text to stdout
- Exit non-zero to fail agent spawn; errors logged to `daemon.log`
- **No placeholders** — unlike `.md` templates, scripts perform logic and generate final text directly
