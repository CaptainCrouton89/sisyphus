# spec/

Sub-agent templates for `agents/spec.md` (spawned via Agent tool, never top-level targets). Stage inferred from artifacts + `meta.stage`: Stage 1 = no `requirements.json`. Stage 2 = `meta.stage: 'stage-2-in-progress'`. Stage 3 = `meta.stage: 'stage-2-done'`.

| Stage | Dispatches | Notes |
|-------|-----------|-------|
| Stage 1 — Shape | 1 engineer | Lead signs off verbally; no TUI |
| Stage 2 — Requirements | 1 writer; bounce loops re-dispatch against revised design | One TUI review, one verdict |
| Stage 3 — Deepen | 1 engineer | Reads `requirements.json` |

## requirements-writer Constraints

- **Output**: writes to `requirements.attempt-N.json` (chunk); lead promotes to `requirements.json` after TUI sign-off
- **Atomic write**: `.tmp` → rename mandatory; never write directly to final path
- **Meta-sections** ("locked decisions", "open questions", "file listing") are not feature groups — load-bearing facts from them belong in the group where that behavior lives
- **Safe assumptions**: qualifies only if all three hold — (1) standard domain convention, (2) no user-visible surface change, (3) low cost to undo. Every entry requires `agentNotes`; invalid without one.
- **Target density**: 3–7 groups, 3–6 requirements per group. A 10-requirement group signals over-granularity. Each behavioral fact appears once — pick one home for cross-group behaviors.
- **Bail**: empty/unreadable `design-rendered.txt` → write no chunk, output error only
- **Don't restate the design**: skip requirements for behaviors already explicit in `design-rendered.txt` — not load-bearing. If standard + low-risk, use `safeAssumptions`. Requirement IDs sequential across whole file (`REQ-001`…), not per-group; group IDs: `^[a-z0-9-]+$`

## Engineer-Writer Isolation

Writer input: path to `design-rendered.txt` + output path only. No user goal, no history, no codebase access. Ambiguity → `openQuestion`; never infer intent not documented in the design.
