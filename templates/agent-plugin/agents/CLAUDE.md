# agents/

## Non-Obvious Agent Constraints

- `explore.md` — Never spawned directly by orchestrator; only `problem.md` can spawn it
- `operator.md` — Spawns sub-agents via **Task tool** (not Agent tool) — the only parent agent that does this
- `debug.md` — May write reproduction tests despite "no code changes" stance; explicit carve-out, not inconsistency
- `problem.md` — `systemPrompt: replace` (base prompt dropped). Draft → `context/problem.draft.md`; `mv` to final on sign-off only. One chat message after rendering: "Draft is in the pane — anything off?" — never paste. **No alternatives section** in the problem document; they stay in the conversation. Sections are vocabulary not checklist — skip ones that don't earn their place, add ones that do. Perspective agents: spawn all 8 `run_in_background: true` after conversation has substance; shared 2–3 sentence framing first; form your own take before spawning. `TaskCreate` for parallel work — mark each task completed immediately.
- `implementor.md` — Bail via `sisyphus report` on false assumptions; never "make it work". Unrelated build failures: note and continue; related-but-unexpected: STOP, no workarounds. Only lints/typechecks files it changed. Coherence with co-running implementors before speed. Explicit permission to break existing code ("pre-production").
- `review.md` — Spawns sub-agents via **Agent tool** (`subagent_type`: `reuse`, `quality`, `efficiency`, `security`, `compliance`) — `sisyphus spawn --agent-type sisyphus:quality` fails silently. Dispatch is scope-only (diff + file boundaries): **no hypotheses, no suspicions** — sub-agents anchored on a leading conclusion miss independent findings. Validation spawns **1 sub-agent per source sub-agent that produced findings** (not 1 total, not 1 per finding): bugs/security at opus, everything else at sonnet, plus a dismissal-audit sub-agent (sonnet) that samples 1–2 dismissed entries per source agent — omitting dismissed output breaks this audit pass. See `review/CLAUDE.md` for sub-agent constraints.

## termrender Directive Nesting

Outer directives need more colons than inner: `::::columns` > `:::col` > `:::`. Mermaid: 3–6 nodes, `graph TD` (not LR), group related steps — extra nodes widen and can overflow terminal.

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

- **Master plan hard limit: 200 lines.** Exceeding it means stage detail leaked — move it to a sub-plan file.
- **No code in plans.** Use pattern references: "Follow the pattern in `src/jobs/index.ts`."
- Adversarial review agents spawn after synthesis, before delivery. Scale to complexity (1 for 5-file, 2-3 for 30-file). Findings must be fixed or dismissed.

## Review Actions

- `reviewAction: "approve"` → set `status` to `"approved"` — permanently skipped on re-entry
- Design uses `"agree"` not `"approve"`; `"pick-alt"` → read `selectedAlternative` and revise
- Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields
- `startedAt`/`completedAt` and `meta.reviewStartedAt`/`meta.reviewCompletedAt` — TUI-owned, never write them

## spec.md Non-Obvious Behavior

**Two termrender modes:**
- `termrender --tmux design.md` — Stage 1/3 user review and bounce re-presentation; never paste in chat
- `termrender --no-color design.md > design-rendered.txt` — Stage 2 writer input only; exit non-zero → bail immediately, don't silently continue

**Writer isolation**: dispatch contract is exactly 3 fields — `design-rendered.txt` path, chunk output path, atomic-write requirement. Never add goal/exploration/conversation. On bounce re-runs: same 3-field contract; writer re-extracts from revised design with no memory of prior pass.

**Bounce flow**: engineer revises design → `termrender --tmux` re-sign-off → THEN re-render to text → re-dispatch writer (sign-off before re-rendering is easy to skip). Three TUI exits: (1) no bounces → Stage 3; (2) ≥1 bounce-to-design → bounce flow; (3) comments only / not yet approved → re-dispatch writer, same 3-field contract, incremented attempt N. Third path easy to miss. After TUI exit: re-read `requirements.json`, scan `reviewAction === 'bounce-to-design'` — never parse stdout.

**Stage 3**: engineer receives `requirements.json` path (all Stage 2 clarifications). `sisyphus requirements --export` runs synchronously — not `run_in_background` (contrast Stage 2 TUI: `run_in_background: true`). `meta.bounceIterations` never decrements — cumulative; `> 3` → bail. Delete `requirements.attempt-*.json` on startup if unparseable or `requirements.json` already has groups.

**Resume state machine**: no files → Stage 1 fresh; `design.json` only → Stage 1 sign-off pending; `stage-2-in-progress` → re-dispatch writer + TUI; `stage-2-done` → Stage 3; `stage-3-done` → submit (sanity-check `design.json.meta.draft < 2` first).

**Stage 1 readiness** (all three): name 3–7 major components; sketch 1-paragraph description not corrected on most recent turn; codebase contradictions resolved. Cap at 3 rounds — unmet → bail.
