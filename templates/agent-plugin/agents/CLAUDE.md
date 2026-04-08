# agents/

## Non-Obvious Agent Constraints

- `explore.md` — Never spawned directly by orchestrator; only `problem.md` can spawn it
- `operator.md` — Spawns sub-agents via **Task tool** (not Agent tool) — the only parent agent that does this
- `debug.md` — May write reproduction tests despite "no code changes" stance; explicit carve-out, not inconsistency
- `problem.md` — Uses `systemPrompt: replace` (base prompt dropped; only interactive agent that does this). Draft → `context/problem.draft.md`; promoted via `mv` on explicit sign-off only. Draft rendered via `termrender --tmux`, **never pasted in chat** — one chat message: "Draft is in the pane — anything off?". Visual sketches write to `context/visual.md` then `termrender --tmux`. Uses `TaskCreate` to track parallel work (explore agents, perspective agents) — mark each task completed immediately, don't batch.
- `implementor.md` — Bail via `sisyphus report` when task makes false assumptions; never "make it work". Build failure split: unrelated → note and continue; related-but-unexpected → STOP, no workarounds. **Only lints/typechecks files it changed** — never runs full builds. Parallel execution: pattern/naming coherence with co-running implementors takes priority over speed. Explicit permission to break existing code ("pre-production").

## termrender Directive Nesting

Outer directives need more colons than inner: `::::columns` > `:::col` > `:::`. Backtick fence also works: `` ```{panel} ``. Mermaid: keep to 3–6 nodes, use `graph TD` (not LR), group related steps into one node — extra nodes widen ASCII output and can overflow the terminal.

## problem.md Perspective Agents

8 sub-agents spawned simultaneously with `run_in_background: true`. Spawn after conversation has substance but before conclusions harden. Write a 2-3 sentence shared framing before spawning (what's happening, what's been considered, what a good outcome looks like) — makes outputs comparable across all 8. Form your own take first; they challenge convergence.

## Context Chain

Artifacts flow through `$SISYPHUS_SESSION_DIR/context/`. Ordering dependency:

```
problem.md       →  context/problem.md  +  context/explore-{area}.md
spec.md          →  context/design.json + context/design.md + context/requirements.json + context/requirements.md
plan.md          →  context/plan-{topic}.md  (reads all of context/ for prior findings)
test-spec.md     →  context/test-spec-{topic}.md   (reads requirements + plan at provided paths)
research-lead.md →  context/research-{topic}.md    (standalone; spawnable at any phase)
```

## plan.md Constraints

- **Master plan hard limit: 200 lines.** Exceeding it means stage detail leaked into the master — move it to a sub-plan file.
- **No code in plans.** Use pattern references: "Follow the pattern in `src/jobs/index.ts`."
- Adversarial review agents spawn after synthesis, before delivery. Scale to complexity (1 for 5-file plans, 2-3 for 30-file plans). Findings must be fixed or dismissed.

## Review Actions

- `reviewAction: "approve"` → set `status` to `"approved"` — permanently skipped on re-entry
- Design uses `"agree"` not `"approve"`; `"pick-alt"` → read `selectedAlternative` and revise
- Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields

## TUI-Owned Fields

`startedAt`/`completedAt` on items and `meta.reviewStartedAt`/`meta.reviewCompletedAt` are set by TUI — never write them.

## spec.md Non-Obvious Behavior

**Two termrender modes:**
- `termrender --tmux design.md` — Stage 1/3 user review and bounce re-presentation; scrollable side pane, never paste in chat
- `termrender --no-color design.md > design-rendered.txt` — Stage 2 writer input only; strips formatting for isolation

**Bounce verdict source**: after TUI exit, re-read `requirements.json` and scan for `reviewAction === 'bounce-to-design'`. The stdout feedback text printed after TUI is human-readable only — the lead never parses it.

**Three-way TUI exit**: (1) no bounces → Stage 3; (2) ≥1 bounce-to-design → bounce flow; (3) comments only / not yet approved → re-dispatch writer, same three-field contract, incremented attempt N. Third path easy to miss.

User comments flow to engineer (revises design); writer re-extracts from revised `design-rendered.txt` with no memory of prior pass — user comment text never flows directly to the writer.

`meta.bounceIterations` **never decrements** — cumulative across restarts. `> 3` → bail. `sisyphus requirements --export` (Stage 3) runs synchronously — not `run_in_background`. Contrast: TUI launch in Stage 2 uses `run_in_background: true`.

**Resume state machine:**

| Disk state | Action |
|---|---|
| No `requirements.json`, no `design.json` | Stage 1 fresh |
| No `requirements.json`, `design.json` present | Stage 1 sign-off pending — re-render and ask |
| `meta.stage === 'stage-2-in-progress'` | Re-render to text, re-dispatch writer, launch TUI |
| `meta.stage === 'stage-2-done'` | Resume into Stage 3 |
| `meta.stage === 'stage-3-done'` | Submit — sanity-check `design.json.meta.draft` first |

**Orphan chunk cleanup** runs on every startup, before resume — glob `requirements.attempt-*.json`, delete if unparseable or if `requirements.json` already has groups.

**Stage 1 readiness** (all three required): (1) can name 3–7 major components; (2) can write 1-paragraph description not corrected on most recent turn; (3) codebase contradictions resolved. Cap at 3 question rounds — unmet → bail.

**Resume sanity check**: `meta.stage === 'stage-3-done'` but `design.json.meta.draft < 2` → ask before submitting (Stage 3 engineer sets it to 2; if it didn't run, something is inconsistent).
