## `systemPrompt: replace`

Agents using `replace` must include a "Baseline Behaviors" block — without it, `replace` strips load-bearing defaults (tool use, scope limits, hooks, destructive-action posture). **Subagent caveat**: `systemPrompt` is only honored for parent agents via the daemon (`src/daemon/agent.ts:240`); in `review/`, `review-plan/`, `spec/`, `research-lead/`, `problem/`, the field is silently ignored — those bodies are consumed as Agent-tool subagent prompts regardless.

## termrender Directive Nesting

Outer directives need more colons than inner: `::::columns` > `:::col` > `:::`. Mermaid: 3–6 nodes, `graph TD` (not LR), group related steps — extra nodes widen and can overflow terminal.

## Review Actions (requirements.json / design.json fields)

- `reviewAction: "approve"` → set `status` to `"approved"` — permanently skipped on re-entry
- Design uses `"agree"` not `"approve"`; `"pick-alt"` → read `selectedAlternative` and revise
- Read both `openQuestions[].response`+`selectedOption` (group-level) AND `questions[].response` (per-requirement inline) — separate fields
- `startedAt`/`completedAt` and `meta.reviewStartedAt`/`meta.reviewCompletedAt` — TUI-owned, never write them
