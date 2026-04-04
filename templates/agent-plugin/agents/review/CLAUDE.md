# review/

Sub-agent templates orchestrated by `agents/review.md`. These are **not** top-level spawn targets — `review.md` spawns them via the Agent tool using `subagent_type`. Running `sisyphus spawn --agent-type sisyphus:quality` will fail; only the parent review coordinator can dispatch them.

## Sub-Agents

- **quality.md** — Flags redundant state, parameter sprawl, copy-paste blocks, leaky abstractions, stringly-typed code, and unnecessary wrapper nesting
- **reuse.md** — Searches for existing utilities/helpers that make new code unnecessary; will not flag without citing an existing alternative at `file:line`
- **efficiency.md** — Redundant computation, missed concurrency, hot-path bloat, no-op updates, TOCTOU, memory issues
- **security.md** — Injection surfaces, auth/authz gaps, data exposure, race conditions, unsafe deserialization; always spawned at opus for hotfix/security classifications
- **compliance.md** — CLAUDE.md conventions, `.claude/rules/*.md` constraints, requirements conformance

## Non-Obvious Patterns

**Scope contract**: All sub-agents scope strictly to changed code. Flagging pre-existing issues that the diff doesn't introduce or worsen is an explicit exclusion — not a preference. The parent validation pass will reject pre-existing flags.

**`reuse` citation requirement**: A potential match that the agent can't confirm at `file:line` must be dismissed, not flagged. Incompatibility must be confirmed by reading the existing utility's implementation — inferring mismatch from the consumer side alone is grounds for dismissal.

**Dismissed output format**: Both `quality` and `reuse` (and likely all sub-agents) record investigated-but-rejected findings as `- **Dismissed**: file:line — reason`. These are sampled by the parent's validation sub-agents to audit dismissal reasoning — the format is load-bearing, not cosmetic.

**Full diff delivery**: `review.md` passes the full diff to each sub-agent, not file paths. Sub-agents that need surrounding context read it themselves.

**Validation wave**: After gathering sub-agent findings, the parent spawns ~1 validation sub-agent per 3 findings (bugs/security at opus, everything else at sonnet). Sub-agent output that doesn't include dismissed entries cannot be audited — omitting them breaks the validation loop.

## Adding a New Sub-Agent

1. Create `{name}.md` with YAML frontmatter (`name`, `description`, `model`)
2. Add a `subagent_type: {name}` entry to the scaling table in `review.md` step 4
3. Update the scaling guidance table in `review.md` if the new type should be conditionally spawned
