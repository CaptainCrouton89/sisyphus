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
- `research-lead.md` — Deep web research coordinator; decomposes questions, dispatches parallel researcher sub-agents, iterates with critic, synthesizes cited report. Sub-agents in `research-lead/`.
- `review.md` — Code review coordinator; orchestrates parallel sub-agents from `review/`, never edits code
- `test-spec.md` — Test specification

## Sub-Agent Subdirectory Pattern

Subdirectories named after an agent type (e.g., `review/`, `review-plan/`) contain sub-agent definition files. `createAgentPlugin()` in `src/daemon/agent.ts` copies these into the plugin's `agents/` dir at spawn time. **Sub-agents are invisible to the orchestrator** — only the parent agent can spawn them via the Agent tool.

Parent agent prompt contains orchestration logic only (scope determination, dispatch strategy, validation, synthesis). Sub-agent files are self-contained: own frontmatter, domain criteria, search methodology, output format. No orchestration logic in sub-agents.

## Context Chain

Interactive agents pass artifacts through `$SISYPHUS_SESSION_DIR/context/`. The implicit ordering dependency:

```
problem.md  →  context/problem.md  +  context/explore-{area}.md
requirements.md  →  context/requirements.json + context/requirements.md   (reads problem.md if present; falls back to instruction)
design.md   →  context/design.md              (context/requirements.md is marked *required* — design fails without it)
plan.md     →  context/plan-{topic}.md        (reads all of context/ for prior findings)
research-lead.md  →  context/research-{topic}.md  (standalone; can be spawned at any phase for investigative questions)
```

`explore.md` is a sub-agent spawned by `problem.md` and `design.md` (never directly by orchestrator) — it saves to `context/explore-{topic}.md`. Design can also spawn additional explore agents mid-session.

## Key Behavioral Patterns

**Requirements flow** (`requirements.md`): Three phases before any formal EARS criteria: (1) investigate context + check for existing `requirements.json` (if present → continuation, not fresh start; read `questions[].response`, `userNotes`, `status`, `criteria.checked`, increment `meta.draft`), (2) **map the territory** — present 3–7 areas as a scope map, wait for alignment, (3) draft one area at a time: ASCII flow diagram → acceptance criteria table → feedback → next area. Primary artifact is `requirements.json`; `requirements.md` is a human-readable copy. **`ears` is a typed object, never a flat string** — key varies by EARS pattern: `{"when":"…","shall":"…"}` / `{"while":"…","shall":"…"}` / `{"if":"…","shall":"…"}` / `{"where":"…","shall":"…"}`. The viewer renders condition and behavior as separate visual components — a string value silently breaks rendering. `agentNotes` is read-only in the viewer (agent reasoning); `userNotes` is the user's write-back field; `criteria[].checked` starts `false` — user marks confirmed criteria. **`status: "question"`** is a pause sentinel — set when user input is needed before a requirement can be formalized; distinct from `"draft"`. On continuation: `approved` → don't re-draft; `rejected` → remove or ask why; `deferred` → skip. After each JSON save, tell the user to edit `requirements.json` directly (fill in `questions[].response`, `userNotes`, change statuses), then return. Don't re-draft without reading the updated JSON back first.

**Plan delegation** (`plan.md`): Assesses scope before acting — simple (1-5 files) proceeds solo; medium (6-15 files) delegates to parallel sub-planners sliced by domain/layer; large (15+ files) produces master plan + sub-plans. Synthesizes into <200-line master plan with task table and dependency graph.

**Plan review** (`review-plan.md`): Always spawns all 4 sub-agents (`security`, `requirements-coverage`, `code-smells`, `pattern-consistency`) in parallel. Acts as a gate before implementation — fails if critical/high findings exist. Sub-agents are in `review-plan/`.

**Code review** (`review.md`): Core three sub-agents (`reuse`, `quality`, `efficiency`) always spawn. `security` is added for hotfix/security classifications or sensitive code at any scope. `compliance` added when CLAUDE.md/rules are extensive. For larger scopes, spawns multiple instances of each type scoped to different directories/modules. Sub-agents are in `review/`.

**Validation layer** (`review.md`): After domain sub-agents finish, spawns validation sub-agents (~1 per 3 findings). Bugs/security validated by opus; everything else by sonnet. Includes a dismissal audit: 1-2 dismissed findings per sub-agent are sampled and independently verified. Findings that don't survive validation are dropped.

**Deep research** (`research-lead.md`): FIFO question queue — initial decomposition populates it, critic gap questions push to front. Write-as-you-research (WARP) pattern — living draft at `context/research-{topic}.md` evolves with each researcher round, draft gaps drive next dispatches. Cross-agent critique only — researchers never review their own findings, critic is always a fresh agent. Researchers return compressed structured findings (not raw content). Final synthesis is a single-pass rewrite of the living draft. Sub-agents in `research-lead/`.

## Frontmatter

See parent `templates/CLAUDE.md` for frontmatter properties. The `interactive: true` flag marks agents that wait for user sign-off (problem, requirements, design, plan).
