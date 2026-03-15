# Work Breakdown Patterns

Patterns for how the orchestrator should structure roadmap.md for common workflow types. Each pattern shows the plan structure, agent assignments, cycle sequencing, and failure handling.

---

## Bug Fix

### When to use
Something is broken. User reports a bug, test is failing, behavior is wrong.

### Plan structure
```
## Bug Fix: [description]

- [ ] Diagnose root cause of [bug description]
- [ ] Implement fix for [root cause]
- [ ] Validate fix — regression tests pass, bug is resolved
- [ ] Review fix for unintended side effects
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:debug` for diagnosis. Yield.
- **Cycle 2**: Read diagnosis report. If confident root cause found, spawn `sisyphus:implement` for fix with the diagnosis as context. Yield.
- **Cycle 3**: Spawn `sisyphus:validate` for validation. Yield.
- **Cycle 4**: If validation passes, spawn `sisyphus:review` for review. If fails, update plan with failure context and respawn implement. Yield.
- **Cycle 5**: Review results. Complete or address review findings.

### Failure modes
- **Debug inconclusive**: Add more context to plan, respawn debug with narrower scope or different focus areas.
- **Fix breaks other things**: Validation catches this. Feed validation failures back into a new implement cycle.
- **Root cause was wrong**: Update plan with what was learned, respawn debug.

### Parallelization
Usually serial — diagnosis must complete before fix, fix before validation. Exception: if the bug affects multiple independent areas, spawn multiple debug agents in parallel.

---

## Feature Build (Small — 1-3 files)

### When to use
Clear requirements, small scope, no spec needed.

### Plan structure
```
## Feature: [description]

- [ ] Plan implementation for [feature]
- [ ] Implement [feature]
- [ ] Validate implementation
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:plan` for planning. Yield.
- **Cycle 2**: Spawn `sisyphus:implement` with plan path. Yield.
- **Cycle 3**: Spawn `sisyphus:validate` for validation. Yield.
- **Cycle 4**: Complete or fix issues.

### Parallelization
Serial. Too small to benefit from parallel agents.

---

## Feature Build (Medium — 4-10 files)

### When to use
Feature with moderate complexity. Requirements may need clarification. Multiple files across a few modules.

### Plan structure
```
## Feature: [description]

### Spec & Planning
- [ ] Draft spec — investigate codebase, propose approach
- [ ] Create implementation plan from spec
- [ ] Review plan against spec

### Implementation
- [ ] Phase 1 — [foundation/types/interfaces]
- [ ] Phase 2 — [core logic]
- [ ] Phase 3 — [integration/wiring]

### Validation
- [ ] Validate full implementation
- [ ] Review implementation
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:spec-draft` for spec. Yield. (Human iterates on spec between cycles.)
- **Cycle 2**: Spawn `sisyphus:plan` for plan. Yield.
- **Cycle 3**: Spawn `sisyphus:review-plan` for review. If fail, respawn plan with issues. Yield.
- **Cycle 4**: Spawn `sisyphus:implement` for Phase 1. Yield.
- **Cycle 5**: Spawn `sisyphus:implement` for Phase 2 + `sisyphus:validate` for Phase 1 (parallel if independent). Yield.
- **Cycle 6-8**: Continue phases, validate, review.

### Failure modes
- **Spec needs human input**: Mark session as needing human review. Orchestrator notes open questions.
- **Plan fails review**: Feed review issues back, respawn planner.
- **Phase fails validation**: Feed specifics back to implement agent for that phase only.

### Parallelization
Phases without dependencies can run in parallel. Types/interfaces (Phase 1) must complete before implementation phases that consume them.

---

## Feature Build (Large — 10+ files)

### When to use
Cross-cutting feature, multiple domains, needs team coordination. Uses **progressive planning** — high-level outline first, then detail-plan each stage as it's reached.

### Plan structure
```
## Feature: [description]

### Spec
- [ ] Draft spec
- [ ] Review spec

### Stage Outline (high-level only — no file-level detail yet)
1. [domain A foundation] — no deps — ~N cycles
2. [domain B foundation] — no deps — ~N cycles
3. [domain A implementation] — depends on 1 — ~N cycles
4. [domain B implementation] — depends on 2 — ~N cycles
5. [integration layer] — depends on 3, 4 — ~N cycles
6. [integration tests] — depends on all — ~N cycles

### Current Stage: [whichever is active]
See context/plan-stage-N-{name}.md for detail plan.
- [ ] [task-level items from detail plan]
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:spec-draft` for spec. Yield.
- **Cycle 2**: Spawn `sisyphus:plan` for **high-level stage outline only**. Instruction: "Outline stages, dependencies, one-sentence descriptions, cycle estimates. Do not detail any stage — no file-level specifics." Spawn `sisyphus:test-spec` for test properties (parallel). Yield.
- **Cycle 3**: Review outline. Spawn `sisyphus:plan` to **detail-plan stage 1 only** (provide outline as context). Output to `context/plan-stage-1-{name}.md`. Yield.
- **Cycle 4**: Spawn `sisyphus:implement` for stage 1. If stage 2 is independent, spawn `sisyphus:plan` to detail-plan stage 2 in parallel. Yield.
- **Cycle 5**: Validate stage 1. Spawn `sisyphus:implement` for stage 2 (if detail-planned). Detail-plan stage 3 in parallel if independent. Yield.
- **Cycle 6+**: Continue pattern — implement current stage, validate previous, detail-plan next. Each stage follows implement → critique → refine → validate.

### Failure modes
- **Detail-plan agent can't produce quality output**: The stage is still too large. Break it into sub-stages in the outline and detail-plan each sub-stage individually.
- **Integration failures**: Often means contracts between domains don't match. Spawn debug agent targeting the integration seam.
- **Stage N implementation invalidates stage N+1 outline**: Update the high-level outline. This is expected — it's why you don't detail-plan everything upfront.

### Parallelization
Maximize within the progressive pattern. Independent stages run in parallel. Detail-planning the next stage runs alongside implementing the current one. Foundation stages complete before dependent stages. Integration waits for all domain implementations.

---

## Refactor

### When to use
Restructure code without changing behavior. Move files, rename abstractions, consolidate patterns.

### Plan structure
```
## Refactor: [description]

- [ ] Analyze current structure and plan refactor
- [ ] Capture behavioral snapshot (existing tests + manual checks)
- [ ] Execute refactor phase 1 — [structural changes]
- [ ] Execute refactor phase 2 — [update consumers]
- [ ] Validate behavior preserved — all original tests pass
- [ ] Review for missed references, dead code, broken imports
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:plan` for analysis + `sisyphus:validate` to capture baseline (parallel). Yield.
- **Cycle 2**: Spawn `sisyphus:implement` for phase 1. Yield.
- **Cycle 3**: Spawn `sisyphus:implement` for phase 2 + `sisyphus:validate` for phase 1 (parallel). Yield.
- **Cycle 4**: Spawn `sisyphus:validate` for full validation. Yield.
- **Cycle 5**: Spawn `sisyphus:review` for final review. Complete.

### Key principle
**Behavior preservation is the only metric.** The refactor is correct if and only if all existing tests pass and externally observable behavior is unchanged.

### Parallelization
Limited. Refactor phases are often sequential (move before update consumers). Validation can run in parallel with the next phase if they touch different files.

---

## Code Review

### When to use
PR review, pre-merge check, or periodic quality audit.

### Plan structure
```
## Review: [scope]

- [ ] Review [scope] for issues
- [ ] (conditional) Fix critical/high issues found
- [ ] (conditional) Re-review fixes
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:review` for review. Yield.
- **Cycle 2**: If critical/high issues, spawn `sisyphus:implement` for fixes. If clean, complete.
- **Cycle 3**: Spawn `sisyphus:review` for re-review (targeted at fixes only). Complete.

### Parallelization
Review itself parallelizes internally (subagents per concern). Fix cycle is usually serial.

---

## Investigation / Spike

### When to use
Need to understand something before committing to an approach. Prototype, explore, or answer a technical question.

### Plan structure
```
## Investigation: [question/area]

- [ ] Investigate [question/area]
- [ ] Summarize findings and recommendation
```

### Cycle plan
- **Cycle 1**: Spawn `sisyphus:debug` (for code investigation) or `sisyphus:general` (for broader research). Yield.
- **Cycle 2**: Spawn `sisyphus:general` to synthesize findings. Complete.

### Parallelization
If investigating multiple independent areas, spawn parallel agents each exploring a different angle.

---

## Tactician-Driven Implementation

### When to use
The plan exists and you want automated cycle-by-cycle execution without manual orchestrator decisions. The tactician reads the plan, dispatches one phase at a time, and tracks progress.

### Plan structure
```
## Tactician Execution

- [ ] Execute implementation plan at [path] using tactician loop
```

### Cycle plan
This is a single-item pattern. The orchestrator spawns the tactician once:
- **Cycle 1**: Spawn `sisyphus:tactician` with plan path. The tactician internally dispatches implement/validate agents via submit tool actions. The orchestrator's role is minimal — just monitor the tactician's completion report.

### When NOT to use
- When you need human checkpoints between phases
- When phases have external dependencies (waiting on API access, design review, etc.)
- When the task requires creative decisions the tactician shouldn't make alone
