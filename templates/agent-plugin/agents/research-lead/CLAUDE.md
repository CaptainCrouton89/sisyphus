# research-lead/

Sub-agent templates orchestrated by `agents/research-lead.md`. These are **not** top-level spawn targets — `research-lead.md` spawns them via the Agent tool using `subagent_type`. Only the parent research lead can dispatch them.

## Sub-Agents

- **researcher.md** — Iterative web searcher. Given a specific sub-question, searches (WebSearch), reads deeply (WebFetch), refines queries, and returns structured findings with citations. Prefers authoritative primary sources over shallow aggregators. Returns compressed summaries, not raw content.
- **critic.md** — Draft and findings reviewer. Identifies gaps (missed questions, uncovered angles), contradictions (conflicting claims across sources), and weak spots (thin evidence, single-source claims). Returns actionable feedback, not validation.

## Key Patterns

**FIFO question queue**: The research lead maintains a flat queue of sub-questions. Initial decomposition populates it. Critic gap questions push to the front. No recursive sub-question trees — shared context across all researchers prevents knowledge isolation between branches.

**Write-as-you-research (WARP)**: The research lead maintains a living draft at `context/research-{topic}.md` that evolves with each researcher round. The draft's gaps drive the next round of dispatches. Final synthesis overwrites the draft in a single pass.

**Cross-agent critique**: Researchers never critique their own findings. The critic is always a separate agent with fresh context. This prevents the self-validation failure mode where agents confirm their own work.

**Intermediate compression**: Researchers return structured summaries with citations — never raw page content. This keeps the research lead's context clean and prevents token bloat (deep research generates 15x more tokens than normal queries).

## Scaling

| Query complexity | Round 1 researchers | Critic | Round 2 (targeted) | Total agents |
|-----------------|--------------------:|:------:|--------------------:|-------------:|
| Narrow/factual  | 1-2                 | skip   | 0-1                 | 1-3          |
| Standard        | 3-4                 | yes    | 1-2                 | 5-7          |
| Complex         | 5-6                 | yes    | 2-3                 | 8-10         |
