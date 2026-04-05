# agents/

Agent system prompt templates for crouton-kit plugin agent types.

## Agent Types

- `problem.md` — Problem exploration; divergent thinking, challenges assumptions, produces `context/problem.md`
- `explore.md` — Codebase exploration; read-only, saves to `context/explore-{topic}.md`. Never spawned directly by orchestrator — only spawned by `problem.md` and `design.md` via Agent tool
- `requirements.md` — Requirements analysis; EARS acceptance criteria, iterates with user
- `design.md` — Technical design; architecture, flow tracing, trade-off resolution
- `plan.md` — Plan lead; assesses scope and delegates sub-planning to parallel agents
- `review-plan.md` — Plan review gate; spawns 4 parallel sub-agent reviewers, blocks implementation on critical/high findings
- `review.md` — Code review coordinator; orchestrates parallel sub-agents from `review/`, never edits code
- `debug.md` — Root-cause investigation only; no code changes **except reproduction tests** (explicit carve-out). Scales: Simple → solo; Medium (2-3 modules) → parallel sub-agents (data-flow tracer, assumption auditor, change investigator); Hard (intermittent/race) → 3-5 teammate agents that actively challenge each other's theories
- `operator.md` — Real-world product interaction via `capture` skill; spawns sub-agents using **Task tool** (not Agent tool)
- `test-spec.md` — Behavioral property checklist (not test code); saves to `context/test-spec-{topic}.md`
- `research-lead.md` — Deep web research coordinator; sub-agents in `research-lead/`

## Sub-Agent Subdirectory Pattern

Subdirectories named after an agent type (e.g., `review/`, `review-plan/`) contain sub-agent definition files. `createAgentPlugin()` in `src/daemon/agent.ts` copies these into the plugin's `agents/` dir at spawn time. **Sub-agents are invisible to the orchestrator** — only the parent agent can spawn them via the Agent tool.

Parent agent prompt contains orchestration logic only (scope determination, dispatch strategy, validation, synthesis). Sub-agent files are self-contained: own frontmatter, domain criteria, search methodology, output format.

## Context Chain

Interactive agents pass artifacts through `$SISYPHUS_SESSION_DIR/context/`. Ordering dependency:

```
problem.md       →  context/problem.md  +  context/explore-{area}.md
requirements.md  →  context/requirements.json + context/requirements.md   (reads problem.md if present; falls back to instruction)
design.md        →  context/design.json + context/design.md  (context/requirements.md is *required* — fails without it)
plan.md          →  context/plan-{topic}.md        (reads all of context/ for prior findings)
test-spec.md     →  context/test-spec-{topic}.md   (reads requirements + plan at provided paths)
research-lead.md →  context/research-{topic}.md    (standalone; can be spawned at any phase)
```

`explore.md` depth modes: `quick` (surface), `standard` (default — 2-3 layers), `deep` (exhaustive + git history). Signal depth in the instruction; without it, `standard` is assumed.

## Key Behavioral Patterns

**Requirements flow** (`requirements.md`): Four phases: (1) investigate context + check for existing `requirements.json` — if present and related → continuation (increment `meta.draft`), if unrelated → delete and start fresh; (2) **map the territory** — present 3–7 areas, wait for alignment; (3) draft one group at a time via conversation (ASCII flow → criteria table → feedback); (4) **once all areas are conversationally approved**, save `requirements.json` + `requirements.md`. JSON is saved once per cycle at the end, not per group.

Schema is `groups[]`, not flat. **`ears` is a typed object, never a flat string** — key varies by EARS pattern: `{"when":"…","shall":"…"}` / `{"while":"…","shall":"…"}` / `{"if":"…","shall":"…"}` / `{"where":"…","shall":"…"}`. A string value silently breaks TUI rendering. **`status: "question"`** is a pause sentinel distinct from `"draft"`.

After saving JSON, run `sisyphus requirements --wait --session-id $SISYPHUS_SESSION_ID` via Bash `run_in_background: true` — blocks until user exits, prints feedback to stdout. `reviewAction: "approve"` → set `status` to `"approved"`; `"comment"` → read `userComment`. Read both `openQuestions[].response`+`selectedOption` (group-level) and `questions[].response` (per-requirement inline — separate field). Approved items are skipped in TUI — never re-draft.

**Design flow** (`design.md`): Six phases: (1) Investigate — codebase + check `design.json`; for 6+ files spawn explore agents in parallel; for large designs spawn adversarial reviewers (feasibility, scope) **before** presenting to user; (2) Orient — one ASCII diagram + 3–7 areas, wait for alignment; (3) Walk Through Decisions — one per turn, trade-offs as named-lens table; (4) Deep-Dive Components — interfaces, data model, contracts; (5) Flow Trace — preconditions, state changes, failure modes; (6) Save and Review. Primary artifact: `design.json`. Schema is `sections[]` each with `items[]` ordered narratively. **`item.decision`** only present when there's a trade-off. After saving, run `sisyphus design --wait` same as requirements. `"agree"` → approved; `"pick-alt"` → read `selectedAlternative` and revise. Reuse first: reference existing code (`state.ts:SessionState`) rather than listing files at end.

**Test spec** (`test-spec.md`): Produces behavioral invariants (what must be true), not test implementations. Each property has `Verify by:` — a concrete validation method agnostic to implementation structure. Submits `{ "testsNeeded": false }` for purely mechanical changes with nothing to verify; otherwise `{ "testsNeeded": true }` after writing the file.

**Plan delegation** (`plan.md`): Simple (1-5 files) → solo; medium (6-15) → parallel sub-planners by domain/layer; large (15+) → master plan + sub-plans. After synthesis, spawns adversarial reviewers (`code-smells`, `edge-cases`, `ambiguity`) — iterates until findings are resolved, never dismisses them. Output: <200-line master plan with task table and dependency graph.

**Plan review** (`review-plan.md`): Always spawns all 4 sub-agents (`security`, `requirements-coverage`, `code-smells`, `pattern-consistency`) in parallel. Gate before implementation — fails if critical/high findings exist. **Multi-plan constraint**: type definitions must have exactly one owner — flag any file touched by 2+ plans; establish execution order when plans have dependencies.

**Code review** (`review.md`): Core three (`reuse`, `quality`, `efficiency`) always spawn. `security` (opus) added for hotfix/security classifications or any sensitive code. `compliance` when CLAUDE.md/rules are extensive. Larger scopes spawn multiple instances per type scoped to different directories. Validation layer spawns ~1 validator per 3 findings; dismissal audit samples 1-2 dismissed findings per sub-agent. Findings that don't survive validation are dropped.

**Operator** (`operator.md`): Uses `capture` skill for browser CDP automation (`capture --help` for CLI reference). Spawns sub-agents via **Task tool** for parallel coverage. "Cannot test because of environment/config/auth" is a failed report — operator unblocks itself. Only acceptable blocker is broken code. **Requires user approval before**: wiping/dropping DB tables, deleting/creating accounts in production, resetting shared state.

**Deep research** (`research-lead.md`): FIFO question queue — initial decomposition populates it, critic gap questions push to front. WARP pattern: living draft at `context/research-{topic}.md` evolves each round; draft gaps drive next dispatches. Critic is always a fresh agent (never the researcher reviewing own findings). Final synthesis is a single-pass rewrite of the living draft.

## Frontmatter

See parent `templates/CLAUDE.md` for frontmatter properties. The `interactive: true` flag marks agents that wait for user sign-off: `problem`, `requirements`, `design`, `plan`, `operator`.
