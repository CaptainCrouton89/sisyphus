# agents/

Agent system prompt templates for crouton-kit plugin agent types.

## Agent Types

Each `.md` file defines a specialized role and strategy:
- `operator.md` — QA/testing agent; browser automation, UI validation, real-world interaction
- `debug.md` — Debug-focused investigation
- `implement.md` — Implementation-focused execution
- `plan.md` — Planning & design
- `spec-draft.md` — Specification drafting
- `review.md` — Code review
- `review-plan.md` — Plan review & critique
- `test-spec.md` — Test specification

## Template Structure

Each agent file starts with YAML frontmatter:
```yaml
name: operator
description: >
  Brief description of agent role and capabilities
model: opus
color: teal
skills: [capture]
permissionMode: bypassPermissions
```

Frontmatter properties:
- `name` — Agent type identifier (matches plugin type: `sisyphus:{name}`)
- `description` — One-line summary for plugin discovery
- `model` — Claude model (`opus`, `sonnet`, etc.)
- `color` — Tmux pane color
- `skills` — Claude Code skills array (e.g., `[capture]`)
- `permissionMode` — Permission mode (`bypassPermissions`, `default`, etc.)

## Prompt Rendering

- **Placeholder substitution**:
  - `{{SESSION_ID}}` → Session UUID (from environment)
  - `{{INSTRUCTION}}` → Task instruction (from `sisyphus spawn --agent-type` call)
- **Passage**: Via `--append-system-prompt "$(cat file.md)"` flag
- **User prompt**: Instruction repeated for clarity

## Conventions

- Keep role definition concise; strategy section should emphasize unique focus
- Define distinct, non-overlapping specialties (operator for QA, debug for investigation, etc.)
- Do not hardcode session IDs or names—use placeholders only
- Prompts should complement (not duplicate) agent-suffix.md shared context
- Frontmatter is required and used by plugin discovery/rendering
