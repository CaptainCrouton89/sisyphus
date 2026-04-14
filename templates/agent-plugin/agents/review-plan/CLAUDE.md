# review-plan/

Sub-agent templates dispatched by `agents/review-plan.md` via Agent tool (`subagent_type`). Not spawnable via `sisyphus spawn` — same constraint as `review/`.

## Dispatch Differences from `review/`

**No validation wave.** `review-plan.md` validates inline (step 5) — it does not spawn per-source validation sub-agents. The dismissed-output format required in `review/` sub-agents is not required here; omitting it does not break anything.

**Coordinator self-validates.** After gathering findings, the coordinator cross-references critical/high findings against the plan and requirements itself before synthesizing.

**One-shot.** `review-plan.md` runs once per plan — there is no re-review loop after revisions. The orchestrator trusts a single careful pass.

## Sub-Agent Scope

These agents review **plan text**, not a diff. They must read codebase files themselves to assess patterns and smells — the coordinator must pass relevant codebase context explicitly (not just document paths).

- `security` — opus; needs requirements + design + plan(s). Only flags risks with a **concrete exploit path** — theoretical attack surfaces without a path are explicitly not findings. Output has a dedicated `Exploit path:` field (separate from `Evidence:`) — coordinator must surface both, not just severity.
- `requirements-coverage` — sonnet; checks two separate dimensions: (1) acceptance criteria → plan sections, and (2) design constraints (API contracts, data models, component boundaries, error handling) → plan sections. Both must be covered. "No findings" is the expected outcome on a well-written plan. Severity: **Critical** = missing entirely, **High** = mentioned but lacks file/function/signature specifics that would force an implementer to stop and ask, **Medium** = partial but non-blocking. Minor wording differences, non-functional requirements, and implementation details intentionally left to the developer are **not** findings at any severity.
- `code-smells` — sonnet; needs codebase context in touched areas. Checks: nullability mismatches (non-null plan assumption vs nullable data source), type conflicts across plans, hidden N+1 queries (per-item DB calls inside loops), over-fetching (loading full records when only a count/subset is needed), missing error boundaries in batch operations, and leaky abstractions (helpers that couple unrelated concerns). Owns **file-level write conflicts** between plans (two plans proposing incompatible changes to the same file).
- `pattern-consistency` — sonnet; needs actual source files for areas the plan touches — plan-in-isolation review is an explicit exclusion. Has **no Critical severity tier** (High/Medium only — affects coordinator pass/fail). Explicitly exempts improvements: a plan proposing a better pattern than existing conventions is not a finding. Each finding must cite `Existing pattern: file:line` — if that field is absent, the reviewer didn't check source. Owns **interface-level disagreements** between plans (shared types or contracts where plans don't align).

## Multi-Plan Constraint

When multiple plans are under review, `code-smells` and `pattern-consistency` produce different signals on shared files:
- `code-smells`: flags files where two plans propose incompatible writes (file-level conflict)
- `pattern-consistency`: flags shared interfaces/types where the plans disagree on shape (contract-level conflict)

A file can surface in both. This is the primary source of inter-plan bugs and gets separate emphasis over single-plan reviews.
