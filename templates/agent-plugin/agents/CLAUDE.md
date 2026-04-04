# agents/

Agent system prompt templates for crouton-kit plugin agent types.

## Agent Types

- `problem.md` — Problem exploration; divergent thinking, challenges assumptions, produces thinking document
- `requirements.md` — Requirements analysis; EARS acceptance criteria, behavioral specs, iterates with user
- `design.md` — Technical design; architecture, flow tracing, trade-off resolution, produces design doc
- `plan.md` — Plan lead; assesses scope and delegates sub-planning to parallel agents
- `review-plan.md` — Plan review coordinator; spawns 4 parallel sub-agent reviewers before implementation
- `operator.md` — QA/testing agent; browser automation, UI validation, real-world interaction
- `debug.md` — Debug-focused investigation
- `implement.md` — Implementation-focused execution
- `review.md` — Code review coordinator; orchestrates parallel sub-agents from `review/`, never edits code
- `test-spec.md` — Test specification

## Sub-Agent Subdirectory Pattern

Subdirectories named after an agent type (e.g., `review/`, `review-plan/`) contain sub-agent definition files. `createAgentPlugin()` in `src/daemon/agent.ts` copies these into the plugin's `agents/` dir at spawn time. **Sub-agents are invisible to the orchestrator** — only the parent agent can spawn them via the Agent tool.

Parent agent prompt contains orchestration logic only (scope determination, dispatch strategy, validation, synthesis). Sub-agent files are self-contained: own frontmatter, domain criteria, search methodology, output format. No orchestration logic in sub-agents.

## Key Behavioral Patterns

**Plan delegation** (`plan.md`): Assesses scope before acting — simple (1-5 files) proceeds solo; medium (6-15 files) delegates to parallel sub-planners sliced by domain/layer; large (15+ files) produces master plan + sub-plans. Synthesizes into <200-line master plan with task table and dependency graph.

**Plan review** (`review-plan.md`): Always spawns all 4 sub-agents (`security`, `requirements-coverage`, `code-smells`, `pattern-consistency`) in parallel. Acts as a gate before implementation — fails if critical/high findings exist. Sub-agents are in `review-plan/`.

**Code review** (`review.md`): Core three sub-agents (`reuse`, `quality`, `efficiency`) always spawn. `security` is added for hotfix/security classifications or sensitive code at any scope. `compliance` added when CLAUDE.md/rules are extensive. For larger scopes, spawns multiple instances of each type scoped to different directories/modules. Sub-agents are in `review/`.

**Validation layer** (`review.md`): After domain sub-agents finish, spawns validation sub-agents (~1 per 3 findings). Bugs/security validated by opus; everything else by sonnet. Includes a dismissal audit: 1-2 dismissed findings per sub-agent are sampled and independently verified. Findings that don't survive validation are dropped.

## Frontmatter

See parent `templates/CLAUDE.md` for frontmatter properties. The `interactive: true` flag marks agents that wait for user sign-off (problem, requirements, design, plan).
