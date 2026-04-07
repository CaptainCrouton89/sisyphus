# spec/

Sub-agent templates orchestrated by `agents/spec.md`. These are **not** top-level spawn targets — `spec.md` spawns them via the Agent tool using `subagent_type`.

## Sub-Agents

- **engineer.md** — Steel-thread designer. Given a topic + stage marker, writes/refines `context/design.md` and `context/design.json` using termrender directives. Two modes: Stage 1 high-level (infra/services altitude) and Stage 3 deepening (component-level + data shapes, no implementation detail).
- **requirements-writer.md** — EARS requirements writer. Given a section name and the path to `context/design-rendered.txt`, produces a single `RequirementsGroup` JSON chunk for that section. Deliberately isolated from design discussion to prevent anchoring bias.

## Key Patterns

**Three-stage flow**: shape → requirements → deepen. Lead infers current stage from artifact existence and `meta.stage` in `requirements.json`. Stage 1 = no `requirements.json` yet. Stage 2 = `meta.stage: 'stage-2-in-progress'`. Stage 3 = `meta.stage: 'stage-2-done'`.

**Engineer-writer isolation**: requirements-writer is dispatched fresh per section with no design discussion context — only the rendered design text. Engineer carries design state across stages via `design.json`/`design.md`. They never share message history. The writer's only view of user intent is whatever the engineer encoded in the rendered design.

**Sequential section drafting**: Stage 2 dispatches one writer per section sequentially — dispatch → wait → merge chunk → launch review TUI → wait → process verdict → next section. v2 may parallelize.

**Termrender as context bridge**: `design.md` is the canonical design artifact authored by the engineer. The lead renders it to `context/design-rendered.txt` via `termrender --no-color` before each writer dispatch. `design-rendered.txt` is the writer's *only* view of the design.

## Scaling

| Stage | Dispatches | Notes |
|-------|-----------|-------|
| Stage 1 — Shape | 1 engineer (+ 1 retry if user requests revision) | Lead signs off verbally; no review TUI |
| Stage 2 — Requirements | 1 writer per section (3–7 typical), 1 review TUI launch per section | Strictly sequential |
| Stage 3 — Deepen | 1 engineer | Reads `requirements.json` to inform deepening |
