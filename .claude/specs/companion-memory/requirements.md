# Companion Memory System

*EARS Behavioral Spec*

Draft 1 — 2026-04-07T10:23:43.939Z

---

Qualitative observation system for the sisyphus companion — rule-based detectors and Haiku-generated impressions produce session sentiments, repo impressions, user patterns, and notable moments, stored in a separate memory file, surfaced via CLI and injected into commentary.

## Component Topology

Defines the five named components of the companion memory system, their individual roles, and the directed data flow between them.

The companion memory system is structured as five components with a linear data flow: Session Completion Hook triggers the Observation Engine, which produces records written to the Memory Store. The Memory Store feeds two consumers: Commentary Enrichment (for generating richer commentary) and the CLI Inspector (for user-facing inspection). Rule Detectors are a sub-component of the Observation Engine, running threshold/pattern checks against quantitative data.

### REQ-001: Observation Engine triggers on session completion

**Status:** approved

When a session completes and onSessionComplete() fires after stat updates, the system shall invoke the observation engine to run rule-based detectors and dispatch a Haiku call for a qualitative summary

**Acceptance Criteria:**

- [ ] Observation engine runs after stat updates during session completion
- [ ] Both rule-based detectors and Haiku call are initiated in the same session-completion cycle

**Agent Notes:**

The design explicitly sequences the observation engine after stat updates (flow narrative step 2). The design allows parallel or sequential execution of detectors and Haiku call but requires both to run. "During session completion" covers the precise call chain: the engine is invoked fire-and-forget from the session-completion handler in the daemon after `onSessionComplete()` and `saveCompanion()` return, via a thin `runPostSessionObservations` wrapper exported from `companion.ts` (see REQ-023). The `onSessionComplete` function itself remains synchronous to respect the daemon CLAUDE.md hazard "never close over a captured companion reference across an await." **User-approved cycles 2 + 4** (re-confirmed cycle 4 to close prior-review HI-1).

### REQ-002: Rule detectors emit at most one observation per session

**Status:** draft

When rule detectors run against companion stats, repo memory, and session history, the system shall allow each detector to emit zero or one observation per session

**Acceptance Criteria:**

- [ ] No single detector can emit more than one observation in a single session-completion cycle
- [ ] Detectors that find no matching condition stay silent (emit zero observations)

**Agent Notes:**

The design states explicitly: 'Each detector can emit zero or one observation per session.' This is a cardinality constraint on detector output.

### REQ-003: Memory Store is a separate file from companion.json

**Status:** approved

Where the companion memory store is persisted, the system shall write observations to ~/.sisyphus/companion-memory.json as a file separate from companion.json

**Acceptance Criteria:**

- [ ] companion-memory.json is stored at ~/.sisyphus/companion-memory.json
- [ ] No observation data is written into companion.json

**Agent Notes:**

This is a locked decision in the design: 'Memory store is a separate file (~/.sisyphus/companion-memory.json), not embedded in companion.json.'

### REQ-004: Memory Store supports append, prune, and category/repo query

**Status:** draft

While observations are being stored or retrieved, the system shall support appending new observation records, pruning old or low-value observations, and querying by category or by repo

**Acceptance Criteria:**

- [ ] Observations can be appended to the store
- [ ] The store can prune entries to remain within a size budget
- [ ] Observations can be queried filtered by category
- [ ] Observations can be queried filtered by repo

**Agent Notes:**

The design lists these three operations explicitly in the Memory Store role column. The retention/pruning policy specifics are flagged as an open question by the design.

### REQ-005: Commentary Enrichment injects observations as a memory context block

**Status:** approved

When commentary generation runs, the system shall query the memory store for relevant observations and inject them into the commentary prompt as a memory context block (delimited by `## Recent observations` … `## End observations`) alongside existing personality, state, and variety sections

**Acceptance Criteria:**

- [ ] The commentary prompt includes a memory context block (delimited by `## Recent observations` … `## End observations`) when observations are available
- [ ] The memory context block is added to the existing prompt structure without replacing personality, state, or variety sections
- [ ] companion-commentary.ts is modified to perform this injection

**Agent Notes:**

Both the component table and the locked decisions confirm the memory context approach. The commentary selection strategy (count, recency vs variety vs relevance) is bounded at 5 observations, recency-first, scoped to current repo (see REQ-042). The original `<memory>` XML wording was clarified to a Markdown-delimited form (`## Recent observations` … `## End observations`) as the C1 prompt-injection fix from review reports/agent-002-final.md — non-XML delimiters cannot be closed by injected `</memory>` tags. **User-approved cycle 4** (no product behavior change — same attachment point, same selection, same scoping, same omit-if-empty rule).

### REQ-006: CLI Inspector exposes observations via companion memory subcommand

**Status:** draft

When the user invokes sisyphus companion memory, the system shall read the memory store and render observations grouped by category

**Acceptance Criteria:**

- [ ] sisyphus companion memory is a subcommand of the existing companion command
- [ ] Output groups observations by category (session sentiments, repo impressions, user patterns, notable moments)
- [ ] The command reads from companion-memory.json

**Agent Notes:**

Locked decision confirms: 'CLI inspection via sisyphus companion memory subcommand on the existing companion command.' Grouping by category is stated in the component table.

### REQ-007: Four observation categories are supported

**Status:** approved

Where observations are tagged and stored, the system shall classify every observation into one of four categories: session sentiments, repo impressions, user patterns, or notable moments

**Acceptance Criteria:**

- [ ] Every observation record carries a category tag matching one of the four defined categories
- [ ] No categories outside the four defined ones are accepted

**Agent Notes:**

Locked decision: 'Four observation categories: session sentiments, repo impressions, user patterns, notable moments.' This is explicitly locked.

### REQ-008: Haiku generates one qualitative observation per session completion

**Status:** draft

When the observation engine runs at session completion, the system shall dispatch a Haiku call that produces a short qualitative observation — a one-sentence impression capturing tone, effort, or trajectory — for the completed session

**Acceptance Criteria:**

- [ ] At most one Haiku call is attempted per session-completion cycle (zero when Haiku is globally disabled or in its 5-minute cooldown after a 401/403)
- [ ] The Haiku output is a single-sentence qualitative impression
- [ ] When the Haiku call succeeds, the resulting observation is appended to the memory store alongside rule-based observations

**Agent Notes:**

The design describes 'a one-sentence impression' in the flow narrative. Whether Haiku produces one observation or multiple per session is flagged as an open question — this requirement captures the stated default of one. "Exactly one" was softened to "at most one" because the existing daemon-wide Haiku gate (5-minute cooldown after auth failure, plus a global disable flag) can legitimately suppress the call. This is identical to the behavior of every other Haiku caller in the daemon and is intentional.

### Safe Assumptions

### REQ-009: Memory store uses atomic temp+rename writes

**Status:** approved

Where the memory store is written to disk, the system shall use the same atomic temp-file-then-rename pattern used by saveCompanion()

**Acceptance Criteria:**

- [ ] Writes to companion-memory.json go via a temp file and atomic rename

**Agent Notes:**

Safe: this is a locked decision in the design ('Persistence follows the same atomic temp+rename pattern'), it's a standard convention with no UX surface, and it's trivially verifiable.

### REQ-010: Observation records include timestamps and category tags

**Status:** approved

When observations are appended to the memory store, the system shall tag each observation with an ISO timestamp and a category label

**Acceptance Criteria:**

- [ ] Each stored observation has a timestamp field
- [ ] Each stored observation has a category field matching one of the four defined categories

**Agent Notes:**

Safe: the design states 'appended to the memory store with timestamps and category tags' in the flow narrative (step 4). This is a direct statement, not an inference, and is a standard data-persistence convention with no UX change.

### REQ-011: New types for memory system are added to companion-types.ts

**Status:** approved

Where memory-related TypeScript types are defined, the system shall add memory-related types to src/shared/companion-types.ts

**Acceptance Criteria:**

- [ ] companion-types.ts is modified to include observation record and memory store types

**Agent Notes:**

Safe: explicitly listed in the FILES section of the design as a modification. Standard TypeScript convention for shared types, no user-visible surface.

### Open Questions

**oq1:** Should the Haiku call at session end produce one observation (tagged to a single category) or multiple observations each tagged to a different category?

- **Single observation:** One Haiku call produces one observation record tagged to the most relevant category. Simpler schema, predictable storage growth.
- **Multiple observations:** One Haiku call produces N observations, one per applicable category. Richer data but more complex prompt design and faster storage growth.

**Response:** Single observation

**oq2:** What is the retention/pruning policy for the memory store: a fixed count, a time window, or category-specific limits?

- **Fixed count (e.g., last 200):** Simple FIFO eviction. Predictable file size, but may lose important old observations.
- **Time window (e.g., 90 days):** Age-based pruning. Keeps recent context fresh, but file can grow unbounded within the window.
- **Category-specific limits:** Each category has its own cap. More complex but ensures balanced coverage across observation types.

**Response:** Fixed count (e.g., last 200)

**oq3:** When injecting memory into the commentary prompt, how many observations should be included and what is the selection strategy?

- **Recency-based:** Include the N most recent observations. Simple, but may cluster around one category.
- **Category-diverse:** Pick observations spread across categories. Better variety but more complex selection logic.
- **Repo-relevant:** Prioritize observations from the current repo. Most contextual but may miss cross-repo patterns.

**Response:** Recency based for this particular repo

**oq4:** Should sisyphus companion memory accept a --repo filter to scope output, or always show all observations?

- **Always show all:** Simpler CLI surface. User can grep output manually if needed.
- **Support --repo filter:** First-class repo scoping. More useful for users with many repos but adds CLI complexity.

**Response:** (unanswered)

**oq5:** Should the user be able to delete or edit individual observations via the CLI, or is read-only inspection sufficient?

- **Read-only:** Simpler to implement. Users can manually edit the JSON file if needed.
- **Delete support:** Allow deleting observations but not editing. Covers the main use case (removing bad data) without full CRUD.
- **Full edit support:** Allow both editing and deleting. Most flexible but significantly more CLI surface area.

**Response:** Read-only



## End-to-End Flow

Covers the sequencing of events from session completion through observation collection, memory persistence, pruning, and injection into the next commentary generation call.

This section specifies the behavioral contract for the end-to-end pipeline that runs each time a session completes. The pipeline has two parallel branches (rule detectors and Haiku call), a single collection point, an append+prune write to the memory store, and a read path that feeds the next commentary generation. The design leaves several policy decisions open — retention limits, Haiku observation count, and commentary selection strategy — which are captured as open questions.

### REQ-012: Observation engine triggered on session completion

**Status:** draft

When onSessionComplete() fires in companion.ts and stat updates have completed, the system shall invoke the observation engine during session completion, without blocking completion on engine failure

**Acceptance Criteria:**

- [ ] The observation engine is invoked after stat and baseline updates, not before
- [ ] A failure in the observation engine does not prevent session completion from succeeding (non-blocking on failure)

**Agent Notes:**

The design states 'After stat updates, the observation engine runs' (flow narrative step 2). The ordering constraint — after stats, not before — is explicit. The design does not specify error handling, so non-blocking behavior on failure is an open area; captured in criteria for user review. The engine is invoked fire-and-forget from the session-completion handler in `session-manager.ts` (after `onSessionComplete` and `saveCompanion` return) via a `runPostSessionObservations` wrapper exported from `companion.ts`. This preserves the synchronous nature of `onSessionComplete` while allowing the engine's async Haiku branch.

### REQ-013: Rule detectors and Haiku call run at session end

**Status:** draft

When the observation engine runs at session completion, the system shall execute all rule-based detectors against the updated stats, repo memory, and session history, and dispatch a Haiku call to generate a qualitative session observation

**Acceptance Criteria:**

- [ ] Rule detectors run against the post-update stats (not pre-update)
- [ ] Each rule detector emits zero or one observation per session
- [ ] The Haiku call produces at most one qualitative observation capturing tone, effort, or trajectory (zero on failure or cooldown)
- [ ] Rule detector results and the Haiku result (or `null` on Haiku failure) both resolve before observations are appended to the store

**Agent Notes:**

The flow diagram and narrative both show rule detectors and Haiku call as parallel branches (flow step 2 and 3). 'In parallel (or sequentially)' is quoted directly from the design — the design does not commit to parallelism, so 'complete before appending' is the firm constraint regardless of ordering. The 4th AC clarifies that Haiku's failure mode is null-return (caught inside `runHaikuObservation`), not a thrown promise — both branches always resolve to a value before the merged append fires.

### REQ-014: Observations appended to memory store with metadata

**Status:** draft

When observations are collected from rule detectors and the Haiku call for a session, the system shall append all observations to the memory store with timestamps and category tags

**Acceptance Criteria:**

- [ ] Each observation record includes a timestamp
- [ ] Each observation record includes a category tag (one of: session sentiments, repo impressions, user patterns, notable moments)
- [ ] Observations from both rule detectors and the Haiku call are appended in the same write pass

**Agent Notes:**

Flow narrative step 4 explicitly states 'appended to the memory store with timestamps and category tags'. The four category names are locked decisions from the design.

### REQ-015: Memory store pruned after append

**Status:** draft

When new observations are appended to the memory store, the system shall prune old or low-value observations to keep the store within a size budget

**Acceptance Criteria:**

- [ ] Pruning runs after every append, not on a separate schedule
- [ ] The pruning policy enforces a defined upper bound on stored observations

**Agent Notes:**

Flow narrative step 5 states 'The store prunes old or low-value observations to stay within a size budget.' The retention policy (fixed count, time window, or category-specific limits) is an open question captured below — this requirement records only the invariant that pruning happens and enforces a budget.

### REQ-016: Commentary generation queries memory store for relevant observations

**Status:** draft

When commentary generation runs, the system shall query the memory store for relevant observations by repo, recency, and category, and inject them into the Haiku prompt as a memory context block delimited by `## Recent observations` … `## End observations`

**Acceptance Criteria:**

- [ ] The memory query filters by at least repo and recency
- [ ] Injected observations are placed in a memory context block delimited by `## Recent observations` … `## End observations` alongside the existing personality, state, and variety sections in the commentary prompt
- [ ] Commentary generation still completes if the memory store is empty or unavailable

**Agent Notes:**

Flow narrative step 6 specifies the query dimensions (repo, recency, category) and the injection point. The original wording said `<memory>` XML tags; this was clarified to a Markdown-delimited block (`## Recent observations` … `## End observations`) as the C1 prompt-injection fix from review reports/agent-002-final.md — non-XML delimiters cannot be closed by injected `</memory>` tags. No product behavior change. The number of observations to inject is bounded at 5 (see REQ-042).

### Safe Assumptions

### REQ-017: Memory store written atomically via temp+rename

**Status:** draft

When the memory store is written (append or prune), the system shall write to a temporary file and rename it to the target path atomically

**Acceptance Criteria:**

- [ ] No partial write is ever visible to readers of the memory store

**Agent Notes:**

Safe assumption: the design explicitly locks this as a decision ('Persistence follows the same atomic temp+rename pattern used by saveCompanion()'). Standard convention in this codebase, low cost to revisit, no user-visible surface change.

### REQ-018: Observation engine errors are logged and do not crash the daemon

**Status:** draft

If the observation engine (rule detectors or Haiku call) throws an error during session completion, then the system shall log the error and allow session completion to proceed without crashing the daemon process

**Acceptance Criteria:**

- [ ] Errors from the observation pipeline are logged to the daemon log
- [ ] A failing observation engine does not prevent companion stats from being saved

**Agent Notes:**

Safe assumption: standard error-isolation convention for optional enrichment pipelines. The observation engine is additive; crashing the daemon on a Haiku call failure would be a regression. Not user-visible, low cost to revisit.

### Open Questions

**OQ-flow-001:** What is the retention policy for the memory store? Should pruning use a fixed observation count (e.g., last 200), a time window (e.g., 90 days), or category-specific limits?

- **Fixed count:** Keep the N most recent observations regardless of category (e.g., last 200). Simple to implement and predict.
- **Time window:** Discard observations older than a rolling window (e.g., 90 days). Better reflects memory decay but may leave the store sparse after long inactive periods.
- **Category-specific limits:** Each category (session sentiments, repo impressions, user patterns, notable moments) has its own cap. More expressive but adds configuration surface.

**Response:** (unanswered)

**OQ-flow-002:** How many observations should the Haiku call produce per session? One observation tagged to the most relevant category, or multiple observations each tagged to a different category?

- **One observation per session:** Haiku produces a single one-sentence qualitative impression per session completion. Simpler prompt, predictable store growth.
- **Multiple observations per session:** Haiku produces one observation per relevant category it detects. Richer coverage but more variable output and harder to prompt reliably.

**Response:** (unanswered)

**OQ-flow-003:** When injecting memory into the commentary prompt, how many observations should be included, and what selection strategy should be used — recency, variety across categories, or relevance to the current repo?

- **Recency-first:** Always inject the N most recent observations. Predictable and cheap to implement.
- **Variety across categories:** Include one or two observations per category. Ensures the companion draws on all memory dimensions.
- **Repo-relevance-first:** Prioritize observations tagged to the current repo, then fill remaining slots from global observations by recency.

**Response:** (unanswered)



## Files and Directories

Describes the new and modified source files and the new persistent store file that together implement the companion memory system.

The companion memory system touches five source files (two new, three modified) and introduces one new runtime data file at `~/.sisyphus/companion-memory.json`. The locked decisions mandate that the memory store is physically separate from `companion.json` and must be written with the same atomic temp+rename discipline used throughout the companion subsystem.

### REQ-019: Create companion-memory.ts module

**Status:** draft

When the companion memory system is implemented, the system shall introduce a new file `src/daemon/companion-memory.ts` that contains the observation engine, rule detectors, and memory store logic

**Acceptance Criteria:**

- [ ] File `src/daemon/companion-memory.ts` exists and is the sole location for observation engine, rule detector, and memory store code
- [ ] No memory-engine logic is added directly to companion.ts or companion-commentary.ts

**Agent Notes:**

The design explicitly lists this as a NEW file in the FILES section and assigns it the three concerns: observation engine, rule detectors, and memory store. Keeping them in one file is a design decision, not just a file-placement choice.

### REQ-020: Memory store stored separately from companion.json

**Status:** draft

Where the companion memory store is persisted to disk, the system shall write observations to `~/.sisyphus/companion-memory.json` and not embed them in `~/.sisyphus/companion.json`

**Acceptance Criteria:**

- [ ] A file named `companion-memory.json` is created at `~/.sisyphus/` on first write
- [ ] `companion.json` is never modified to contain observation data
- [ ] Pruning operations target `companion-memory.json` exclusively

**Agent Notes:**

This is a locked decision stated in both the FILES section and the Locked Decisions panel: separate file, no bloating of companion.json, allows independent pruning.

### REQ-021: Memory store writes use atomic temp+rename pattern

**Status:** draft

When the system writes or updates `companion-memory.json`, the system shall write to a temporary file first and then rename it to the final path, using the same atomic pattern as `saveCompanion()`

**Acceptance Criteria:**

- [ ] No direct in-place write to `companion-memory.json` — all mutations go through a temp file followed by rename
- [ ] A partial write that crashes mid-way does not corrupt the existing store

**Agent Notes:**

Explicitly required in Locked Decisions: 'Persistence follows the same atomic temp+rename pattern used by saveCompanion()'. This is a user-visible durability guarantee, not merely a coding convention, so it is load-bearing.

### REQ-022: Modify companion-commentary.ts to include memory context block

**Status:** draft

When commentary generation runs, the system shall inject a memory context block delimited by `## Recent observations` … `## End observations` into the Haiku commentary prompt via modifications to `src/daemon/companion-commentary.ts`

**Acceptance Criteria:**

- [ ] `companion-commentary.ts` is modified to accept and embed a memory context block delimited by `## Recent observations` … `## End observations` alongside the existing personality, state, and variety sections
- [ ] The memory context block is populated from observations queried from the memory store

**Agent Notes:**

The FILES section marks companion-commentary.ts as MODIFIED with the explicit note 'add memory context block to commentary prompt'. The Locked Decisions confirm: 'Memory feeds into commentary via a new memory context section in the existing commentary prompt structure.' The original `<memory>` XML wording was clarified to Markdown-delimited form (`## Recent observations` … `## End observations`) as the C1 prompt-injection fix — non-XML delimiters cannot be closed by injected `</memory>` tags. No product behavior change.

### REQ-023: Modify companion.ts to invoke observation engine on session completion

**Status:** draft

When `onSessionComplete()` in `companion.ts` finishes updating stats and baselines, the system shall call the observation engine from `src/daemon/companion-memory.ts` to run rule detectors and trigger Haiku observation generation

**Acceptance Criteria:**

- [ ] `companion.ts` exposes a `runPostSessionObservations(companion, session, prev)` wrapper that calls the observation engine in `companion-memory.ts`
- [ ] The observation engine invocation happens after — not before — the existing stat and baseline update logic
- [ ] The `runPostSessionObservations` wrapper is invoked from the session-completion handler in `session-manager.ts` (after `onSessionComplete` and `saveCompanion` return) so the engine's async branch does not run inside synchronous `onSessionComplete`

**Agent Notes:**

The FILES section marks companion.ts as MODIFIED with the note 'call observation engine from onSessionComplete()'. The flow narrative (step 2) confirms the ordering: stat updates happen first, then the observation engine runs. The literal "call from companion.ts" is satisfied via a thin async wrapper exported from companion.ts that imports and calls the engine; the wrapper's caller is the session-completion handler in `session-manager.ts`. This split is necessary because `onSessionComplete` itself is synchronous (per the daemon CLAUDE.md hazard) and the engine has an async Haiku branch.

### REQ-024: Add memory-related types to companion-types.ts

**Status:** draft

When the companion memory system is implemented, the system shall define all memory-related TypeScript types in `src/shared/companion-types.ts` rather than in feature-local files

**Acceptance Criteria:**

- [ ] `src/shared/companion-types.ts` is modified to include types for observation records, the memory store structure, and the four observation categories
- [ ] Memory types are importable by both `companion-memory.ts` and `companion-commentary.ts` via the shared module

**Agent Notes:**

The FILES section explicitly places memory type additions in `src/shared/companion-types.ts` (marked MODIFIED). Locating shared types in the shared layer is consistent with the project's architecture convention and is explicitly documented in the design.

### REQ-025: Add memory subcommand to companion CLI

**Status:** draft

When the user runs `sisyphus companion memory`, the system shall read the memory store and render observations grouped by category

**Acceptance Criteria:**

- [ ] `src/cli/commands/companion.ts` is modified to register a `memory` subcommand under the `companion` command
- [ ] Output groups observations by the four categories: session sentiments, repo impressions, user patterns, notable moments
- [ ] The subcommand reads from `~/.sisyphus/companion-memory.json`

**Agent Notes:**

The FILES section marks `src/cli/commands/companion.ts` as MODIFIED for the `memory` subcommand. The Locked Decisions confirm: 'CLI inspection via sisyphus companion memory subcommand on the existing companion command.' The Components table states it 'renders observations grouped by category.'

### Safe Assumptions

### REQ-026: companion-memory.json initialized with empty observations on first run

**Status:** draft

If `companion-memory.json` does not yet exist when the observation engine first attempts to append, then the system shall create the file with an empty observations structure rather than erroring

**Acceptance Criteria:**

- [ ] First-run creates the file rather than throwing a file-not-found error

**Agent Notes:**

Standard boundary initialization convention for persistent stores. Low cost to undo, not a user-visible surface change, universally expected for append-on-first-use stores.

### REQ-027: companion-memory.json path follows the existing global daemon data directory convention

**Status:** draft

Where `companion-memory.json` is located, the system shall resolve its path using the same path helper that resolves `companion.json` (`~/.sisyphus/`)

**Acceptance Criteria:**

- [ ] Path is derived from the same helper as other global daemon files, not hardcoded as a separate constant

**Agent Notes:**

Standard convention for the project: global daemon files go in `~/.sisyphus/` and are resolved through the shared path helper. The design names the location explicitly. Using the same helper is a low-risk, easily-reversed implementation detail.

### Open Questions

**OQ-files-01:** The design does not specify whether `companion-memory.ts` should export the memory store as a class, a module-level singleton, or a set of pure functions. Which interface shape is preferred?

- **Pure functions (functional style):** Export stateless functions like `appendObservation(store, obs)` that take and return the store value — consistent with immutable state patterns.
- **Module-level singleton:** Export functions that operate on a shared in-memory cache loaded once at daemon start — consistent with how companion.ts currently manages companion state.
- **Class-based store:** Export a `MemoryStore` class instance — useful if the store needs lifecycle methods (open, flush, close).

**Response:** (unanswered)



## Locked Decisions

Non-negotiable design constraints explicitly committed to in the design: storage layout, persistence pattern, observation taxonomy, observation sources, commentary integration, and CLI surface.

These requirements encode the six locked decisions from the design. They are not aspirational — they represent explicit, non-negotiable commitments. Each one must be implemented exactly as stated. Open questions about retention policy, Haiku granularity, memory editing, repo filtering, and commentary selection strategy are tracked separately and do not affect these requirements.

### REQ-028: Memory store is a separate file from companion.json

**Status:** draft

When the system persists companion memory observations, the system shall write them to ~/.sisyphus/companion-memory.json and never embed them in ~/.sisyphus/companion.json

**Acceptance Criteria:**

- [ ] companion-memory.json exists as a distinct file under ~/.sisyphus/ independent of companion.json
- [ ] No observation data is written to or read from companion.json
- [ ] companion.json file size is unaffected by memory store growth

**Agent Notes:**

Directly stated as a locked decision: 'Memory store is a separate file (~/.sisyphus/companion-memory.json), not embedded in companion.json'. The rationale given is avoiding bloat and enabling independent pruning, but the constraint itself is the locked item.

### REQ-029: Memory store persistence uses atomic temp+rename pattern

**Status:** draft

When the system writes or updates the companion memory store, the system shall use the same atomic temp-file-then-rename pattern used by saveCompanion()

**Acceptance Criteria:**

- [ ] Writes to companion-memory.json always go to a temp file first, then atomically renamed to the target path
- [ ] No partial writes to companion-memory.json are possible if the process is interrupted mid-write
- [ ] The implementation mirrors the saveCompanion() pattern already used for companion.json

**Agent Notes:**

Explicitly locked: 'Persistence follows the same atomic temp+rename pattern used by saveCompanion()'. This is a specific implementation constraint, not a general best practice — the reference to saveCompanion() makes it load-bearing.

### REQ-030: Observations use exactly four categories

**Status:** draft

When the system creates or stores an observation, the system shall tag it with exactly one of four categories: session sentiments, repo impressions, user patterns, or notable moments

**Acceptance Criteria:**

- [ ] Every observation record carries a category field constrained to the four named values
- [ ] No observation is created without a category, and no categories outside these four are permitted
- [ ] The CLI inspector groups observations by these four categories when rendering

**Agent Notes:**

Locked decision: 'Four observation categories: session sentiments, repo impressions, user patterns, notable moments — matching the companion roadmap.' The design states these match the companion roadmap, making them a committed taxonomy, not an initial default.

### REQ-031: Rule-based detectors produce observations per session

**Status:** draft

When the observation engine runs at session completion, the system shall execute rule-based detectors against companion stats, repo memory, and session history, with each detector emitting zero or one observation per session

**Acceptance Criteria:**

- [ ] Rule-based detectors run as part of the observation engine at every session completion
- [ ] Each individual detector emits at most one observation per session invocation
- [ ] Detectors are deterministic and threshold-driven, operating against quantitative data

**Agent Notes:**

Locked decision: 'Two observation sources: rule-based detectors (deterministic, threshold-driven)'. The per-session, zero-or-one emission cap per detector is stated in the Components table: 'Each detector can emit zero or one observation per session.'

### REQ-032: Haiku produces one qualitative observation per session completion

**Status:** draft

When the observation engine runs at session completion, the system shall invoke a Haiku call that generates at most one qualitative observation about the session

**Acceptance Criteria:**

- [ ] At most one Haiku call is attempted as part of observation engine execution at each session completion
- [ ] When the Haiku call succeeds, it produces one qualitative observation — a short impression capturing tone, effort, or trajectory
- [ ] The Haiku-generated observation, when produced, is appended to the memory store alongside rule-based observations

**Agent Notes:**

Locked decision: 'Two observation sources: ... Haiku-generated (qualitative, one per session completion)'. The flow narrative specifies 'a one-sentence impression that captures tone, effort, or trajectory.' The open question about whether Haiku should produce multiple tagged observations is tracked separately — the locked commitment is at most one per session. "At most one" replaces the original "exactly one" because the daemon-wide Haiku 5-minute cooldown after auth failure can legitimately suppress the call to zero. This mirrors REQ-008.

### REQ-033: Memory injects into commentary prompt as a memory context block

**Status:** draft

When the commentary generation system builds a Haiku prompt, the system shall inject relevant observations from the memory store as a memory context block delimited by `## Recent observations` … `## End observations` within the existing commentary prompt structure

**Acceptance Criteria:**

- [ ] The commentary prompt contains a memory context block delimited by `## Recent observations` … `## End observations` when observations are available
- [ ] The memory context block is injected alongside the existing personality, state, and variety sections — not replacing them
- [ ] Observations are queried from the memory store before each commentary generation run (or per event batch — see implementation plan §3 M7 for the prebuilt-once-per-batch optimization)

**Agent Notes:**

Locked decision: 'Memory feeds into commentary via a new memory context section in the existing commentary prompt structure.' The original `<memory>` XML tag name was clarified to a Markdown-delimited form (`## Recent observations` … `## End observations`) as the C1 prompt-injection fix from review reports/agent-002-final.md — non-XML delimiters cannot be closed by injected `</memory>` tags. The integration with the existing prompt structure (not a rewrite) is preserved.

### REQ-034: Memory is inspectable via sisyphus companion memory subcommand

**Status:** draft

When a user runs the sisyphus companion memory subcommand, the system shall read the memory store and render observations grouped by category

**Acceptance Criteria:**

- [ ] The subcommand is named 'memory' and is accessible as a subcommand of the existing 'sisyphus companion' command
- [ ] Output groups observations by the four defined categories
- [ ] The subcommand reads from companion-memory.json, not from companion.json

**Agent Notes:**

Locked decision: 'CLI inspection via sisyphus companion memory subcommand on the existing companion command.' This surfaces the memory as a read path for the user; write/edit capability is an open question and is not locked.

### Safe Assumptions

### REQ-035: Memory store is created on first write if absent

**Status:** draft

If companion-memory.json does not exist when the observation engine first attempts to write, then the system shall create the file, initializing it with an empty observations structure

**Acceptance Criteria:**

- [ ] First-run bootstrap creates companion-memory.json without requiring manual setup

**Agent Notes:**

Safe: standard file-initialization convention — create-on-first-write is the universal pattern for daemon-managed state files. No new UX surface; entirely internal. Cheap to undo.

### REQ-036: Observation records include a timestamp

**Status:** draft

When the system appends an observation to the memory store, the system shall include an ISO 8601 timestamp recording when the observation was created

**Acceptance Criteria:**

- [ ] Every observation in companion-memory.json has a timestamp field

**Agent Notes:**

Safe: timestamps on persisted records are a universal convention for any store that requires recency-based querying or pruning — both of which the design explicitly describes. Not user-visible beyond CLI output. Trivial to change the format if needed.

### Open Questions

**OQ-LD-001:** Should the Haiku call and rule-based detectors run in parallel at session completion, or sequentially? The flow narrative says 'In parallel (or sequentially)' — the design leaves this unresolved.

- **Parallel:** Haiku call and rule detectors run concurrently, reducing latency at session end.
- **Sequential:** Rule detectors run first, then the Haiku call. Simpler error handling; Haiku could potentially use rule detector output as context.

**Response:** (unanswered)



## Open Questions

Behavioral requirements implied by each unresolved design decision, paired with the open questions the user must resolve before implementation.

The design flags five unresolved decisions that affect observable system behavior. Each requirement below captures what the system *must* do regardless of which way the question resolves. The paired open questions present the concrete options for the user to choose from.

### REQ-037: Memory Store Retention Enforcement

**Status:** draft

When the memory store is written after a session completes, the system shall enforce a retention policy that prevents unbounded growth of the observation store

**Acceptance Criteria:**

- [ ] The store does not grow without bound across sessions
- [ ] Observations beyond the retention limit are removed or de-prioritized during the prune step
- [ ] The retention policy is applied consistently at every write, not only on-demand

**Agent Notes:**

The design mandates a prune step (flow step 5) and a 'size budget' but does not specify the policy. This requirement captures the invariant that is true under any retention policy the user selects. The specific limit or window is deferred to the open question.

### REQ-038: Haiku Observation Output Per Session

**Status:** draft

When a session completes and the Haiku qualitative call is dispatched, the system shall persist all observations returned by Haiku with category tags and timestamps to the memory store

**Acceptance Criteria:**

- [ ] Every observation returned by Haiku is written to the memory store with a category tag
- [ ] If Haiku returns multiple observations in a single call, all are stored individually
- [ ] If Haiku returns one observation, it is stored with the appropriate category

**Agent Notes:**

The design specifies that Haiku produces observations at session completion but leaves the count (one vs. multiple) unresolved. This requirement captures the invariant storage contract regardless of count. The granularity choice is deferred to the open question.

### REQ-039: CLI Memory Inspection

**Status:** draft

When the user runs the sisyphus companion memory subcommand, the system shall display the observation store contents grouped by category

**Acceptance Criteria:**

- [ ] Output is grouped by the four defined categories: session sentiments, repo impressions, user patterns, notable moments
- [ ] The command exits with a non-zero status if the memory store file cannot be read
- [ ] An empty store renders without error

**Agent Notes:**

The design locks in read access via CLI (Locked Decisions, line 125). Whether write/delete capabilities are also exposed is the open question. This requirement covers the locked behavior only.

### REQ-040: Memory Store Mutability Contract

**Status:** draft

If the user is permitted to delete or edit individual observations via CLI, then the system shall persist the mutation atomically using the same temp+rename pattern as all other memory store writes

**Acceptance Criteria:**

- [ ] Any CLI-initiated mutation uses atomic temp+rename write semantics
- [ ] A failed or interrupted mutation does not corrupt the store file

**Agent Notes:**

Whether editing/deletion is exposed at all is unresolved. This requirement is conditional on that choice and ensures that if it is enabled, the atomic-write constraint (a Locked Decision) is respected.

### REQ-041: Repo Scoping for Memory Display

**Status:** draft

When the user runs sisyphus companion memory, the system shall support a mechanism to scope the displayed observations to a specific repository

**Acceptance Criteria:**

- [ ] A repo-scoped query returns only observations tagged with that repo
- [ ] An unscoped query returns observations for all repositories
- [ ] Repo filter is applied before rendering — it does not merely visually highlight

**Agent Notes:**

The design flags whether a --repo filter should exist as an open question. The query-by-repo capability is referenced in the Memory Store component description (line 47) as a planned feature. This requirement captures the behavior if the filter is added; the open question resolves whether to expose it via CLI.

### REQ-042: Commentary Memory Injection Budget

**Status:** draft

When commentary generation runs and the memory store is non-empty, the system shall select a bounded subset of observations and inject them into the commentary prompt as a memory context block delimited by `## Recent observations` … `## End observations`

**Acceptance Criteria:**

- [ ] The injected memory context block is bounded — it does not include the entire store
- [ ] The selection strategy is deterministic and documented in code
- [ ] If the store is empty, the memory context block is omitted rather than injected as empty

**Agent Notes:**

The design states memory is injected into the commentary prompt (Locked Decision, line 123) but leaves the selection strategy (count, recency vs. variety vs. relevance) unresolved. This requirement captures the bounded-injection invariant that holds under any selection strategy. The original `<memory>` XML wording was clarified to a Markdown-delimited form (`## Recent observations` … `## End observations`) as the C1 prompt-injection fix from review reports/agent-002-final.md — non-XML delimiters cannot be closed by injected `</memory>` tags. No product behavior change.

### Safe Assumptions

### REQ-043: Invalid or Missing Memory Store Handled Gracefully

**Status:** draft

If the memory store file does not exist or cannot be parsed, then the system shall treat the store as empty rather than crashing or blocking session completion

**Acceptance Criteria:**

- [ ] A missing store file initializes a fresh empty store on first write
- [ ] A corrupted store file is logged and treated as empty, not surfaced as a fatal error

**Agent Notes:**

Safe assumption: graceful degradation on missing/corrupt storage is standard convention for file-backed persistence. It is not a user-facing surface change and is trivially reversible if the user prefers strict error handling instead.

### REQ-044: Observation Engine Does Not Block Session Completion

**Status:** draft

While the observation engine (rule detectors and Haiku call) is running after session completion, the system shall not block the session from being marked complete in the daemon state

**Acceptance Criteria:**

- [ ] Session state is updated to complete before or independently of the observation engine finishing
- [ ] A timeout or failure in the Haiku call does not leave the session in an indefinite pending state

**Agent Notes:**

Safe assumption: it is standard practice in event-hook architectures to not let side-effect hooks block the primary event outcome. Not a UX surface change and low cost to revisit.

### Open Questions

**OQ-001:** Retention policy: How should the memory store limit its size over time?

- **Fixed count (e.g., last 200 observations):** Keep the most recent N observations across all categories. Simple to implement and reason about. May under-represent older categories if one category dominates.
- **Time window (e.g., last 90 days):** Discard observations older than a rolling window. Ensures temporal recency but can result in a very small store during quiet periods.
- **Category-specific limits:** Each of the four categories has its own cap (e.g., 50 per category). Ensures balanced representation across categories. More complex to configure and maintain.

**Response:** (unanswered)

**OQ-002:** Observation granularity for the Haiku call: How many observations should one Haiku call produce per session?

- **One observation per session:** Haiku produces a single sentence capturing the overall session impression. Simple prompt, predictable token cost, but only covers one category per session.
- **Multiple observations, one per applicable category:** Haiku produces up to four observations (one per category) in a single call. Richer output per session; requires structured output and a more complex prompt.

**Response:** (unanswered)

**OQ-003:** Memory editing: Should the CLI allow the user to delete or edit individual observations, or is read-only inspection sufficient?

- **Read-only inspection only:** sisyphus companion memory displays observations but provides no mutation commands. Simpler implementation; the pruning policy is the sole way observations are removed.
- **Delete individual observations via CLI:** User can remove specific observations (e.g., by ID or interactively). Adds user control but requires ID-stable observation records and additional CLI surface.
- **Delete and edit observations via CLI:** Full CRUD over individual observations. Maximum control; highest implementation cost; requires stable IDs and validation on edited content.

**Response:** (unanswered)

**OQ-004:** Repo scoping: Should sisyphus companion memory accept a --repo filter flag?

- **No filter — always show all observations:** Output is always global. Simpler command interface. Useful when the user wants a cross-repo view of patterns.
- **Optional --repo filter:** User can pass --repo <name> to narrow output to observations tagged with that repo. Requires repo tags on all relevant observations. More targeted for users working across many repos.
- **Auto-detect current repo, with --all override:** Default to filtering by the current working directory's repo (if detectable), with --all to show everything. Most ergonomic for single-repo workflows but adds detection logic.

**Response:** (unanswered)

**OQ-005:** Commentary selection strategy: How should the system choose which observations to inject into the commentary prompt?

- **Most recent N observations:** Select the N most recently written observations regardless of category or repo. Simple; biased toward recent sessions.
- **Recency-weighted with category variety:** Select the most recent observation from each category, then fill remaining slots by recency. Balances freshness and breadth.
- **Relevance to current repo, then recency:** Prioritize observations tagged to the current repo, then fill with recent cross-repo observations. Most contextually relevant but requires repo tagging on all observations.

**Response:** (unanswered)

