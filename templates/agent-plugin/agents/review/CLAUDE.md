# review/

Sub-agent templates orchestrated by `agents/review.md`. These are **not** top-level spawn targets — `review.md` spawns them via the Agent tool using `subagent_type`. Running `sisyphus spawn --agent-type sisyphus:quality` will fail; only the parent review coordinator can dispatch them.

## Sub-Agents

- **quality.md** — Flags redundant state, parameter sprawl, copy-paste blocks, leaky abstractions, stringly-typed code, unnecessary wrapper nesting, and unnecessary comments (what-comments, change narration, task references)
- **reuse.md** — Searches for existing utilities/helpers that make new code unnecessary; will not flag without citing an existing alternative at `file:line`
- **efficiency.md** — Redundant computation, missed concurrency, hot-path bloat, no-op updates, TOCTOU, memory issues, overly broad operations
- **security.md** — Injection surfaces, auth/authz gaps, data exposure, race conditions, unsafe deserialization; always spawned at opus for hotfix/security classifications. All findings require a concrete exploit path — exploit path is not an output field, it's the gate; no exploit path = not a finding (applies to every category, not just TOCTOU)
- **compliance.md** — CLAUDE.md conventions, `.claude/rules/*.md` constraints, requirements conformance (haiku — mechanical rule-matching)

## Non-Obvious Patterns

**Scope contract**: All sub-agents scope strictly to changed code. Flagging pre-existing issues that the diff doesn't introduce or worsen is an explicit exclusion — not a preference. The parent validation pass will reject pre-existing flags.

**`reuse` citation requirement**: A potential match that the agent can't confirm at `file:line` must be dismissed, not flagged. Incompatibility must be confirmed by reading the existing utility's implementation — inferring mismatch from the consumer side alone is grounds for dismissal.

**Dismissed output format**: `quality`, `efficiency`, `compliance`, and `reuse` record dismissed findings as `- **Dismissed**: file:line — reason`. `security` is the exception — it produces no dismissed entries (a concern either has a concrete exploit path or it doesn't; there is no "investigated and ruled out" output). The validation wave's dismissal-audit sub-agent skips security for this reason.

**`reuse` dismissed format difference**: `reuse`'s dismissed entry cites `existing-file:line` (the existing utility evaluated) — not `file:line` (the new code). All other sub-agents cite the new code's location. The validation wave parses these differently.

**`quality` reads before framing**: The agent is instructed to form its own assessment of what code *does* before reading comments, commit messages, or naming that frames intent. This prevents anchoring on stated intent when reviewing code with misleading or wrong framing.

**`efficiency` wrapper/updater pattern**: When a wrapper function accepts an updater or reducer callback, the wrapper must pass through the "no change" signal (typically a same-reference return). If it doesn't, callers' early-return no-ops are silently swallowed — downstream consumers re-render or re-fire on every cycle even when nothing changed. `efficiency` explicitly checks for this.

**`efficiency` cite-or-no-flag rule**: Each finding must cite the specific sequential or redundant operations at `file:line`. A suspicion without a concrete code reference must be dismissed, not flagged — this matches the same bar as `reuse`'s citation requirement.

**`compliance` rule source field**: Each finding must cite `path:line` (or section heading) from the CLAUDE.md or rules file that documents the violated convention — not just the violation. A finding without a source is invalid. This is stricter than other sub-agents' output formats.

**`compliance` rules path scoping**: `.claude/rules/*.md` files carry a `paths` frontmatter field. `compliance` matches each rule's `paths` patterns against the changed files — a rule with no matching path is dismissed, not applied globally. If compliance produces no findings on a rules-heavy diff, check whether the rules' `paths` patterns cover the changed file locations.

**`compliance` severity thresholds**: High = code contradicts an explicit "must" or "never" in the source; Medium = deviates from a documented pattern without a "must"/"never" qualifier. The validation wave uses this to triage — don't flatten them to a single severity.

**`compliance` "better than rule" exception**: Reasonable deviations where the code is explicitly better than the documented pattern are not flagged. If a rule documents a pattern and the code improves on it, `compliance` must dismiss — not flag — and cite why it's an improvement, not just non-compliance.

**`efficiency` TOCTOU remedy**: The pattern to flag is pre-checking file/resource existence before operating. The prescribed fix is to operate directly and handle the error — not to add more defensive checks. Flags that suggest "add a guard" instead of "remove the pre-check and handle failure" are incorrect outputs.

**Full diff delivery**: `review.md` passes the full diff to each sub-agent, not file paths. Sub-agents that need surrounding context read it themselves.

**Empty report format**: All sub-agents emit an explicit sentence when clean ("No quality concerns — the change is structurally sound." etc.). This sentence, not silence, is the signal the validation wave uses to skip spawning a validator for that sub-agent. A sub-agent that produces no output at all is treated as failed, not clean.

**`security` rate-limiting/CSRF exclusion**: `security.md` explicitly does not flag missing rate limiting or CSRF protection unless the change specifically creates a new surface for them. These are valid security concerns in general but out of scope for diff-scoped review.

**Validation wave**: After gathering sub-agent findings, the parent spawns 1 validation sub-agent per sub-agent that produced findings (bugs/security at opus, everything else at sonnet). Sub-agent output that doesn't include dismissed entries cannot be audited — omitting them breaks the validation loop.

## Adding a New Sub-Agent

1. Create `{name}.md` with YAML frontmatter (`name`, `description`, `model`)
2. Add a `subagent_type: {name}` entry to the scaling table in `review.md` step 4
3. Update the scaling guidance table in `review.md` if the new type should be conditionally spawned
