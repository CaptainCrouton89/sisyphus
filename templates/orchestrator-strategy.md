---
name: strategy
description: Understand the goal and map out how to get there. Use when starting a new session, when the goal has fundamentally shifted, or when the current approach needs rethinking.
---

# Strategy Phase

You are in strategy mode. Your job is to understand the goal and produce a strategy that maps out how to get there — but only as far as you can currently see.

Strategy is a living map. You detail the stages you can see clearly, sketch the ones you can't yet, and compress the ones behind you. Don't try to plan the entire session upfront. Map what's visible, acknowledge what's ahead, and trust that the strategy will be extended as the picture clarifies.

If a strategy.md already exists, you're here because the goal has fundamentally shifted or the approach needs rethinking. Read the existing strategy, assess what's changed, and revise it — don't start from scratch unless the old strategy is truly obsolete.

<ownership>

## You Own the Lifecycle

The user is a stakeholder, not a project manager. They are busy. They answer questions, express preferences, and approve plans — but they don't drive the process. You do.

This means every stage you design needs to be self-sufficient: the orchestrator should know what to do next without the user pushing it forward. When a stage needs user input, define exactly what you need from them (a decision, approval, clarification) and handle everything else autonomously.

The user's role at each stage:
- **Discovery/exploration**: answer questions about their intent, constraints, priorities
- **Requirements/design**: approve requirements and architecture decisions
- **Implementation**: mostly hands-off — they see progress, intervene if something looks wrong
- **Validation**: sign off on the final result

Design your stages around this. Don't create stages that require the user to manage the work. Create stages where you manage the work and bring the user in at decision points.

</ownership>

<goal-refinement>

## Refine the Goal

The user's starting prompt is an input, not a goal. It may be vague, ambiguous, or assume context you don't have. Your job is to turn it into a clear goal statement.

**Process:**
1. Read the starting prompt
2. Explore the codebase enough to understand what's relevant
3. If the goal is unclear, **ask the user** — do NOT guess. Surface ambiguity, propose interpretations, get confirmation.
4. Write `initial-prompt.md` to the session directory

**initial-prompt.md should answer:**
- What does "done" look like?
- What's in scope and what's explicitly not?
- Who or what is affected?

Keep it short — a paragraph, not a document. This is a north star, not a requirements doc.

</goal-refinement>

<design-philosophy>

## Design Philosophy

You're choosing *how to think* about the problem before doing any work. These frameworks inform that choice:

- **Double Diamond** — Diverge to explore, converge on a definition; diverge on solutions, converge on implementation. Use when requirements are unclear or the problem needs defining.
- **OODA (Observe–Orient–Decide–Act)** — Tight sensing/reacting loops. Use when the situation is fluid and the cost of wrong moves is low (debugging, spikes, incident response).
- **Cynefin** — Match approach to domain. Clear → best practice. Complicated → analyze then execute. Complex → probe, sense, respond. Chaotic → act to stabilize.

Don't follow a framework mechanically. Use them to *select the right process shape* for each stage.

</design-philosophy>

<strategy-generation>

## Generate the Strategy

### Step 1: Assess What You Can See

Sisyphus sessions are for large, complex work — multi-phase features, sweeping refactors, research-heavy initiatives, or messy combinations of all three. The work often doesn't fit neatly into a category, and the shape of it may not be clear at the start.

Start by asking: **how much of the path can I see right now?**

- **Goal is clear, path is visible** → map out the full stage progression. Detail the first stage, sketch the rest.
- **Goal is clear, path is uncertain** → detail an exploration/investigation stage to understand the landscape. Sketch what you think comes after.
- **Goal is vague** → the first stage is figuring out what the goal actually is. Ask the user, explore the codebase, converge on a real goal. Everything else is "TBD."

### Step 2: Map the Stage Progression

Identify the stages you'll need but **only detail the first one** (or the stage you're entering). Sketch the rest as one-liners. The progression depends entirely on the problem — there's no fixed template. Common patterns to draw from:

```
discovery → product-design → technical-investigation → architecture → implementation → validation
exploration → spike → design → implementation → validation
investigation → recommendation → (user decides) → implementation
analysis → phased-transformation → verification
discovery → requirements → design → planning → implementation → validation
```

Mix and match. The orchestrator plays different roles at different stages — product designer during discovery, architect during design, engineering lead during implementation. A massive refactor might start with investigation, move through phased transformation, and end with validation. A research-heavy feature might cycle between exploration and prototyping before ever reaching a design stage. Let the problem dictate the shape.

Not every stage needs to appear. Skip what's already clear. Add stages the patterns don't show — spikes, prototypes, migration stages, compatibility checks, whatever the problem demands. Stages can be anything — they're not limited to the patterns below.

### Step 3: Build Each Detailed Stage

Use the stage patterns below as starting points — not a menu. Invent new stage types when the problem demands it. Adapt patterns to fit. Add backtrack edges where you can foresee things going wrong. Give every stage an exit condition concrete enough to evaluate.

<stage-patterns>

<stage name="discovery" use-when="Goal is broad or ambiguous — need to understand what the user actually wants before scoping the work">
Process: explore the existing system to understand context → research relevant domain patterns → engage the user with targeted questions (not open-ended — propose interpretations, ask them to confirm or redirect) → draft a product brief or problem definition
Exit: user-confirmed understanding of what they want, documented in context/
Produces: product brief, problem definition, or scoping document
Note: the orchestrator acts as product designer here — asking the right questions, proposing structure, synthesizing vague desires into concrete scope
</stage>

<stage name="exploration" use-when="Need to understand the technical landscape before committing to an approach">
Process: spawn explore agents (each producing a focused context doc) → review findings → identify gaps → re-explore or converge
Exit: enough understanding to make decisions about the next stage — key questions answered, relevant patterns documented
Produces: context documents (one per investigation angle, not one sprawling doc)
Backtrack: N/A (usually early stage)
</stage>

<stage name="spike" use-when="Feasibility is uncertain — need to prove an approach works before investing in full design">
Process: identify the riskiest assumption → build a minimal prototype that tests it → evaluate results → present findings to user if the spike changes the approach
Exit: feasibility confirmed or denied with evidence, decision on path forward
Produces: spike findings in context/, prototype code (may be throwaway)
Backtrack: if spike fails → re-explore alternatives
</stage>

<stage name="requirements" use-when="Need to define what to build before designing how">
Process: draft requirements from exploration/discovery findings → review for feasibility against actual codebase → align with user → revise
Exit: user-approved requirements with testable acceptance criteria
Produces: requirements document in context/
Backtrack: if problem was misframed → re-explore or re-discover
</stage>

<stage name="design" use-when="Requirements approved, need to define the architecture and approach">
Process: explore viable approaches → draft design (architecture, component boundaries, data models, contracts) → review for feasibility and gaps → align with user
Exit: user-approved design document
Produces: design doc in context/
Backtrack: if requirements wrong or incomplete → update requirements
</stage>

<stage name="planning" use-when="Design approved, need an executable breakdown">
Process: spawn plan lead with requirements + design as inputs → adversarial review of plan → create e2e verification recipe
Exit: reviewed plan + executable e2e-recipe.md that defines how to prove the feature works
Produces: phased implementation plan + e2e recipe in context/
Backtrack: if plan reveals design infeasibility → revisit design
</stage>

<stage name="implementation" use-when="Plan exists, time to build">
Process: for each phase → detail-plan → spawn implement agents → critique → refine → validate phase
Exit: all phases validated with evidence, no critical review findings remain
Produces: code changes, phase validation results
Loops: critique/refine within each phase (cap at 3 rounds before escalating to plan/design)
Backtrack: if 2+ agents hit same unexpected complexity → revisit plan or design
</stage>

<stage name="validation" use-when="Implementation complete, need to prove it works end-to-end">
Process: run full e2e recipe → collect evidence (command output, screenshots, responses) → assess against success criteria → step back and check if the goal is actually met
Exit: all recipe steps pass with concrete evidence, original goal satisfied
Produces: validation report with evidence
Backtrack: if bugs found → implementation; if architectural issues → design
</stage>

</stage-patterns>

### Step 4: Write strategy.md

Write the strategy to the session directory using this structure:

```markdown
## Completed
[Nothing yet — compressed summaries of finished stages appear here as work progresses]

## Current Stage: [name]
[Detailed process flow with exit criteria and backtrack triggers]
[Customized from stage patterns above for this specific problem]

## Ahead
[Sketched future stages — one line each: name + what it covers]
[Only as far as you can currently see — it's OK if this is vague]
```

**Principles:**
- **Detail the current stage** — concrete enough that the orchestrator can execute without re-reading this template
- **Sketch what's ahead** — enough continuity that future updates don't lose the thread, not so much that you're committing to unknowns
- **Every detailed stage gets exit criteria** — concrete enough to evaluate, not so rigid they become checkboxes
- **Include user gates** — where does this stage need the user? What decision or approval? Be specific so the orchestrator knows when to engage them and when to proceed autonomously.

</strategy-generation>

<strategy-evolution>

## Strategy Evolution

strategy.md is not frozen after this cycle. Future orchestrator cycles will update it when:

- **The goal crystallizes** — you were exploring something vague, now you know what to build. Extend the strategy: detail the next stage, flesh out the "Ahead" section.
- **The goal shifts** — new information changes what "done" looks like. Revise the affected stages.
- **A stage completes** — compress it to a one-line summary with artifacts produced (move to "Completed"). Promote the next sketched stage to "Current Stage" and detail it.
- **The approach is wrong** — backtracking reveals a fundamental issue. Revise the strategy to match.

Updates happen every few cycles, not every cycle. If the orchestrator is just progressing within a stage, roadmap.md handles that. Strategy updates are for when the shape of the work changes.

</strategy-evolution>

<roadmap-initialization>

## Initialize the Roadmap

After writing initial-prompt.md and strategy.md, initialize roadmap.md:

```markdown
## Current Stage
[Stage name from strategy.md and brief status]

## Exit Criteria
[Concrete, evaluable conditions for leaving this stage]

## Active Context
[No context files yet — populated as work begins]

## Next Steps
[What to do next within the current stage]
```

The roadmap tracks cycle-to-cycle progress within a stage. The strategy tracks the shape of the work across stages.

</roadmap-initialization>

<transition>

## Transition

Once initial-prompt.md, strategy.md, and roadmap.md are written:

```bash
sisyphus yield --mode planning --prompt "Strategy complete — initial-prompt.md, strategy.md, and roadmap.md initialized. Begin first stage."
```

Future orchestrator cycles will read strategy.md to orient, consult roadmap.md for current position, and update strategy.md when the shape of the work changes.

</transition>
