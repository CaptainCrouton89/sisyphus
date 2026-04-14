# orchestration skill

## File Role Disambiguation

`strategy.md` here is **authoring guidance** for writing the runtime `context/strategy.md` file that orchestrators maintain. The filename matches the artifact it describes — don't confuse the two.

## `sisyphus:spec` Is Human-Interactive

Unlike every other agent type, `sisyphus:spec` includes synchronous human interaction inside its session. The orchestrator yields after spawning spec; the human iterates inside the pane. Progressing to the next cycle before the spec agent has reported means the human hasn't had their input session yet.

## Tactician Internal Dispatch

`sisyphus:tactician` dispatches implement/validate sub-agents via internal submit tool calls — not `sisyphus spawn`. The orchestrator spawns it once and receives a single completion report that spans multiple internal cycles. Do not expect per-cycle yields when using the tactician pattern.

## `yield --mode` Must Be Explicit at Transitions

`sisyphus yield --mode discovery`, `--mode validation`, etc. must be specified explicitly at mode-transition cycles. Omitting the flag doesn't error — it defaults to `implementation` mode, silently skipping discovery or validation guardrails that the subsequent orchestrator cycle expects to be in place.

## Verification Checkpoint Placement

Checkpoints in `task-patterns.md` are placed based on "how much subsequent work depends on this stage" — not as a fixed end-phase. Foundation stages get a light critique; core logic gets critique + validate; integration gets full e2e. Adding end-of-project-only validation to any of these patterns defeats the cascade-prevention purpose.

## Progressive Planning (Large Features)

For 10+ file features, the cycle-2 plan agent must be instructed to produce a **high-level stage outline only** — stage names, one-sentence descriptions, dependency arrows, and cycle estimates. Requesting file-level implementation detail at this stage is wrong: early stages will invalidate later detail plans before they're used.

Detail plans are generated progressively: spawn a `sisyphus:plan` agent to detail-plan stage N into `context/plan-stage-N-{name}.md` *while simultaneously implementing* stage N-1. The overlap is intentional — detail-planning the next stage runs as a parallel agent alongside the current implementation, not as a separate preceding cycle.

If a stage is still too large for a single detail-plan agent to handle well, break it into sub-stages in the high-level outline and detail-plan each sub-stage individually. Do not widen the plan agent's scope — the outline is the unit of adjustment.

## Refactor: Baseline Capture Timing

In the refactor pattern, `sisyphus:validate` runs in **cycle 1 in parallel with** `sisyphus:plan` — not after planning, and not after implementation. The validate agent's job in cycle 1 is to capture the pre-refactor behavioral baseline (existing tests, observable outputs). Running it after implementation means you no longer have a before-state to compare against.

## Tactician: When Not to Use

Tactician handles automated cycle-by-cycle execution, but it cannot pause for interruptions. Do not use it when:
- Phases need human review or sign-off between them (use per-cycle orchestration with `sisyphus:spec` or human-paced yields)
- A phase is gated on external access (API keys, environment setup, third-party approval) that may not be ready
- The task requires creative decisions about approach mid-execution (the tactician will commit to the existing plan)

In these cases, the orchestrator must manage cycles manually so it can handle the interruption point.

## `sisyphus:test-spec` Timing

In the large feature pattern, `sisyphus:test-spec` spawns in parallel with the high-level plan agent at Cycle 2 — not after implementation. Test properties must be derived from the design and requirements, not reverse-engineered from the code. Spawning it post-implementation causes test-spec to describe what the code does rather than what it should do.

## Investigation Agent Selection

For investigation/spike tasks, agent type determines orientation — not just capability:
- `sisyphus:debug` — for **code investigation**: tracing execution paths, reading existing code, diagnosing why something behaves a certain way
- `sisyphus:general` — for **broader research**: evaluating libraries, exploring external approaches, synthesizing findings across sources

Using `sisyphus:debug` for research produces narrow code-centric output; using `sisyphus:general` for code investigation produces shallow surface-level analysis without deep tracing.
