# Strategy Reference

Reference material for writing and updating strategy.md — the document that maps the shape of the work across stages.

## strategy.md Format

```markdown
## Completed
[Compressed summaries of finished stages — delete detail, keep outcomes]

## Current Stage: [name]
[Detailed process flow with exit criteria and backtrack triggers]

## Ahead
[Sketched future stages — one line each: name + what it covers]
[Only as far as you can currently see — it's OK if this is vague]
```

**Principles:**
- **Detail the current stage** — concrete enough that the orchestrator can execute without re-reading this skill
- **Sketch what's ahead** — enough continuity that future updates don't lose the thread, not so much that you're committing to unknowns
- **Every detailed stage gets exit criteria** — concrete enough to evaluate, not so rigid they become checkboxes
- **Include user gates** — where does this stage need the user? What decision or approval?

## Choosing Process Shape

The progression depends entirely on the problem — there's no fixed template. Common patterns to draw from:

```
discovery → spec → planning → implementation → validation
exploration → spike → design → implementation → validation
investigation → recommendation → (user decides) → implementation
analysis → phased-transformation → verification
discovery → product-design → technical-investigation → architecture → implementation → validation
```

Mix and match. Not every stage needs to appear — skip what's already clear. Add stages the patterns don't show — spikes, prototypes, migration stages, compatibility checks. Stages can be anything.

## Stage Patterns

Use these as starting points. Invent new stage types when the problem demands it. Add backtrack edges where you can foresee things going wrong.

### exploration
**Use when:** Need to understand the technical landscape before committing to an approach.
- Process: spawn explore agents (each producing a focused context doc) → review findings → identify gaps → re-explore or converge
- Exit: enough understanding to make decisions — key questions answered, relevant patterns documented
- Produces: context documents (one per investigation angle, not one sprawling doc)

### spike
**Use when:** Feasibility is uncertain — need to prove an approach works before investing in full design.
- Process: identify the riskiest assumption → build a minimal prototype that tests it → evaluate results → present findings to user if the spike changes the approach
- Exit: feasibility confirmed or denied with evidence, decision on path forward
- Produces: spike findings in context/, prototype code (may be throwaway)
- Backtrack: if spike fails → re-explore alternatives

### spec
**Use when:** Need to define what to build and how, in a single interactive session.
- Process: spawn sisyphus:spec → lead explores codebase, asks user questions, dispatches engineer for design and a single writer for requirements → user reviews via TUI → lead deepens design with findings
- Exit: user-approved design + requirements with testable acceptance criteria
- Produces: context/design.md + context/design.json + context/requirements.json + context/requirements.md
- Backtrack: if problem was misframed → re-explore or re-discover

### planning
**Use when:** Design approved, need an executable breakdown.
- Process: spawn plan lead with spec outputs (requirements + design) as inputs → adversarial review of plan → create e2e verification recipe
- Exit: reviewed plan + executable e2e-recipe.md that defines how to prove the feature works
- Produces: phased implementation plan + e2e recipe in context/
- Backtrack: if plan reveals design infeasibility → revisit spec

### implementation
**Use when:** Plan exists, time to build.
- Process: for each phase → detail-plan → spawn implement agents → single critique pass → refine → validate phase
- Exit: all phases validated with evidence, no critical review findings remain
- Loops: none within a phase — review runs once, fixes land, then validation. If review surfaces architectural issues, backtrack to plan; otherwise advance.
- Backtrack: if 2+ agents hit same unexpected complexity → revisit plan or spec; if review finds architectural issues → revisit plan

### validation
**Use when:** Implementation complete, need to prove it works end-to-end.
- Process: run full e2e recipe → collect evidence (command output, screenshots, responses) → assess against success criteria → step back and check if the goal is actually met
- Exit: all recipe steps pass with concrete evidence, original goal satisfied
- Produces: validation report with evidence
- Backtrack: if bugs found → implementation; if architectural issues → spec

## Design Philosophy

Frameworks to inform process shape selection — use them to *choose the right shape*, not to follow mechanically:

- **Double Diamond** — Diverge to explore, converge on a definition; diverge on solutions, converge on implementation. Use when requirements are unclear or the problem needs defining.
- **OODA (Observe–Orient–Decide–Act)** — Tight sensing/reacting loops. Use when the situation is fluid and the cost of wrong moves is low (debugging, spikes, incident response).
- **Cynefin** — Match approach to domain. Clear → best practice. Complicated → analyze then execute. Complex → probe, sense, respond. Chaotic → act to stabilize.
