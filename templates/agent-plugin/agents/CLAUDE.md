# agents/

## Non-Obvious Agent Constraints

- `explore.md` — Never spawned directly by orchestrator; only `problem.md` and `design.md` can spawn it
- `operator.md` — Spawns sub-agents via **Task tool** (not Agent tool) — the only parent agent that does this
- `design.md` — `context/requirements.md` is a hard prerequisite; no graceful fallback, it fails without it
- `debug.md` — May write reproduction tests despite "no code changes" stance; explicit carve-out, not inconsistency

## Context Chain

Artifacts flow through `$SISYPHUS_SESSION_DIR/context/`. Ordering dependency:

```
problem.md       →  context/problem.md  +  context/explore-{area}.md
requirements.md  →  context/requirements.json + context/requirements.md   (reads problem.md if present; falls back to instruction)
design.md        →  context/design.json + context/design.md  (context/requirements.md is *required*)
plan.md          →  context/plan-{topic}.md        (reads all of context/ for prior findings)
test-spec.md     →  context/test-spec-{topic}.md   (reads requirements + plan at provided paths)
research-lead.md →  context/research-{topic}.md    (standalone; spawnable at any phase)
```

`explore.md` depth: `quick` / `standard` (default, 2-3 layers) / `deep` (exhaustive + git history). Absent signal → `standard`.

## Key Behavioral Patterns

**Problem exploration** (`problem.md`): Opens with an **opinionated reframing** after codebase exploration — never raw findings, never naked questions without a provisional take. **Perspective agents** (all 8: First Principles, User Empathy, Simplifier, Systems Thinker, Contrarian, Time Traveler, Adversarial, Precedent) are spawned **proactively** `run_in_background: true` once understanding starts to converge but before conclusions harden — not as a last resort when stuck. Wrong timing: opening move (no shared framing yet) or after conversation stalls (framing already too narrow). Write a shared 2-3 sentence problem statement before spawning so outputs are comparable. In-conversation plateau breakers (flip positions, zoom out/in, name the tension) are separate techniques used throughout — not a gate before spawning agents. Convergence = signal; surprises = potential breakthroughs. Saves `context/problem.md` after user confirms. **Key Insight** is one sentence — the non-obvious understanding that emerged, not a summary. **`termrender --tmux`** opens a rendered markdown side pane (not inline output) — use for synthesis after perspective agents return, comparison tables, and the final problem landscape; inline ASCII suffices for quick mid-conversation sketches. Write to `$SISYPHUS_SESSION_DIR/context/visual.md` first, then `termrender --tmux "$SISYPHUS_SESSION_DIR/context/visual.md"`. **Mermaid diagrams**: 3–6 nodes max with descriptive labels (2–5 words each); prefer `graph TD`; don't split concepts into many tiny nodes — group related steps into single nodes and use panels for detail. **Directive nesting**: use variable colons (`::::columns` > `:::col`) so closers are unambiguous; backtick fence syntax (`` ```{panel} ``) also works.

**Requirements flow** (`requirements.md`): Existing `requirements.json` check: related → increment `meta.draft`; unrelated → delete and start fresh. `ears` field is a **typed object**, never a flat string — a string silently breaks TUI rendering. Condition key varies by EARS pattern: `{"when":"…","shall":"…"}` / `{"while":"…","shall":"…"}` / `{"if":"…","shall":"…"}` / `{"where":"…","shall":"…"}` — always use the matching key. `status: "question"` is a pause sentinel distinct from `"draft"`. JSON saved once at end of cycle, not per group. After save, run `sisyphus requirements --wait` via `run_in_background: true`. `reviewAction: "approve"` → set `status` to `"approved"` — approved items are permanently skipped on re-entry. Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields. `startedAt`/`completedAt` on items and `meta.reviewStartedAt`/`meta.reviewCompletedAt` are set by the TUI — never write them.

**Design flow** (`design.md`): Existing `design.json`: related → increment `meta.draft`; unrelated → delete and start fresh. For 6+ files, spawn explore agents in parallel before presenting to user. For large designs, spawn adversarial reviewers (feasibility, scope) **before** the Orient step, not after. `design.json` schema: `sections[]` with `items[]` ordered narratively; `item.decision` only present when there's a genuine trade-off. Review actions diverge from requirements: `"agree"` (not `"approve"`) → set `status` to `"approved"` — approved items skipped on re-entry; `"pick-alt"` → read `selectedAlternative` and revise. Same `--wait` loop and `openQuestions[].response`+`selectedOption` reading as requirements. `startedAt`/`completedAt` on items and `meta.reviewStartedAt`/`meta.reviewCompletedAt` are TUI-owned — never write them.

**Plan review** (`review-plan.md`): Multi-plan constraint — any file touched by 2+ plans must have a single type-definition owner assigned; flag and establish execution order before implementation.

**Code review** (`review.md`): Validation layer spawns ~1 validator per 3 findings. Findings that don't survive validation are **dropped**, not downgraded. Dismissal audit samples 1-2 dismissed findings per sub-agent.

**Deep research** (`research-lead.md`): Critic gap questions push to the **front** of the FIFO queue, ahead of initial decomposition questions. Critic must always be a fresh agent — never the researcher reviewing their own work.

## Sub-Agent Subdirectory Pattern

Subdirectories (e.g., `review/`, `review-plan/`) contain sub-agent files copied into the plugin's `agents/` dir at spawn time via `createAgentPlugin()` in `src/daemon/agent.ts`. Sub-agents are invisible to the orchestrator — only the parent can spawn them. See `.claude/rules/agent-prompts.md` for when to extract domain logic into sub-agents vs. keeping it in the parent prompt.
