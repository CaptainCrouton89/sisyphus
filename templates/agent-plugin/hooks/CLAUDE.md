# templates/agent-plugin/hooks/

Lifecycle hooks for agent plugin workflows. Enable specialized prompt generation and context handling during agent spawning.

## hooks.json

Schema: `{ "phaseKey": { "hookName": "script-name.sh" } }`

Example:
```json
{
  "plan": {
    "userPrompt": "plan-user-prompt.sh",
    "systemPrompt": "plan-system-prompt.sh"
  }
}
```

- **Keys**: Phase names (e.g., `plan`, `requirements`, `implement`) — must correspond to phase modes in agent spawn workflow
- **Values**: Object mapping hook types to shell script names
- **Hook types**: `userPrompt`, `systemPrompt` (extensible for future hooks)

## Shell Scripts

Each script receives environment variables and outputs text to stdout.

```bash
# Receives: $SISYPHUS_SESSION_ID, $SISYPHUS_AGENT_ID, $INSTRUCTION, $AGENT_TYPE, context files
# Outputs: Full user or system prompt text
```

**Convention**: `{phase}-{hook-type}.sh`

**Inputs**:
- `$SISYPHUS_SESSION_ID` — Session UUID
- `$SISYPHUS_AGENT_ID` — Agent ID (e.g., `agent-001`)
- `$INSTRUCTION` — Task instruction from spawn command
- `$AGENT_TYPE` — Agent type (e.g., `plan`, `requirements`, `implement`)
- Context files at `.sisyphus/sessions/$SISYPHUS_SESSION_ID/context/`

**Output**: Must write complete prompt text to stdout (no errors to stderr)

## Invocation

Hooks are executed during agent spawn when:
1. Agent type matches a plugin agent type (e.g., `--agent-type sisyphus:plan`)
2. Phase has hooks configured in hooks.json
3. Daemon renders prompts before passing to Claude

Output becomes the `--append-system-prompt` or user message content.

## Key Patterns

- **No placeholders in shell scripts** — unlike `.md` templates, scripts perform logic and generate final text
- **Context access**: Scripts can read session state from `$SISYPHUS_SESSION_ID` directory
- **Error handling**: Exit non-zero to fail agent spawn; errors logged to daemon.log
- **Stdout only**: Scripts must output complete prompt to stdout; nothing to stderr
