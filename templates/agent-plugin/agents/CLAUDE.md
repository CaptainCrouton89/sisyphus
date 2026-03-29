# agents/

Agent system prompt templates for crouton-kit plugin agent types.

## Agent Types

Each `.md` file defines a specialized role and strategy:
- `problem.md` — Problem exploration; divergent thinking, challenges assumptions, produces thinking document
- `requirements.md` — Requirements analysis; EARS acceptance criteria, behavioral specs, iterates with user
- `design.md` — Technical design; architecture, flow tracing, trade-off resolution, produces design doc
- `plan.md` — Plan lead; assesses scope and delegates sub-planning to parallel agents for complex features (6+ files), synthesizes into <200-line master plan with task table and dependency graph
- `review-plan.md` — Plan review coordinator; spawns 4 parallel sub-agent reviewers (security, requirements-coverage, code-smells, pattern-consistency) to verify completeness and safety before implementation
- `operator.md` — QA/testing agent; browser automation, UI validation, real-world interaction
- `debug.md` — Debug-focused investigation
- `implement.md` — Implementation-focused execution
- `review.md` — Code review
- `test-spec.md` — Test specification

## Template Structure

Each agent file starts with YAML frontmatter:
```yaml
name: plan
description: >
  Brief description of agent role and capabilities
model: opus
color: yellow
effort: max
interactive: true
skills: [capture]
permissionMode: bypassPermissions
```

Frontmatter properties:
- `name` — Agent type identifier (matches plugin type: `sisyphus:{name}`)
- `description` — One-line summary for plugin discovery
- `model` — Claude model (`opus`, `sonnet`, etc.)
- `color` — Tmux pane color
- `effort` — Complexity estimate (`low`, `medium`, `high`, `max`)
- `interactive` — (optional) `true` if agent waits for user input/sign-off before proceeding
- `skills` — Claude Code skills array (e.g., `[capture]`)
- `permissionMode` — Permission mode (`bypassPermissions`, `default`, etc.)

## Key Patterns

**Plan delegation**: plan.md assesses scope (simple 1-5 files solo; medium 6-15 files with sub-planners; large 15+ files with master + sub-plans). For medium/large, delegates to parallel sub-plan agents sliced by domain/layer, then synthesizes into navigable master plan with task table and dependency graph.

**Plan review**: review-plan.md spawns 4 parallel sub-agent reviewers to verify plan completeness and safety. Reviewers cover security (injection surfaces, auth gaps, race conditions), requirements coverage, code smells (nullability, N+1 queries, error boundaries), and pattern consistency. Acts as gate before implementation — fails if critical/high findings exist.

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
- Interactive agents (problem, requirements, design, plan) may delegate work to specialists and spawn reviewers
