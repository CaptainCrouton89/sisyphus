# Pipeline State: multi-repo-support

## Specification Phase

### Alternatives Considered
- **`--cwd` instead of `--repo`**: More general (absolute paths, deep paths), but `--repo` is simpler and scoped to the actual use case. Rejected as over-general.
- **No `--repo` flag at all**: Agents could just cd into repos. Rejected because worktree creation happens at spawn time in the daemon — needs the git root before the agent starts.
- **Dual worktree.json format (flat + keyed)**: Considered for backward compat. Rejected — user explicitly doesn't want backward compat, and dual formats are brittle. Always-keyed is cleaner.
- **Separate Repositories vs Git Worktrees sections**: Conditional orchestrator sections based on single vs multi repo. Rejected — unified Repositories section for all sessions. One code path.
- **Per-repo worktree config as separate files**: e.g., `.sisyphus/worktrees/frontend.json`. Rejected in favor of keyed format in single `worktree.json`.

### Key Discoveries
- Agent-facing CLI commands (`spawn`, `submit`, `yield`, `complete`) don't use CWD — they talk to daemon over socket. No CWD issue there.
- Prompt file paths are already absolute (computed by daemon via `promptsDir()`). No breakage from agent CWD differences.
- `require-submit.sh` is the only hook that constructs session paths from env vars. Others just check `$SISYPHUS_SESSION_ID` presence.
- `worktree.ts` `mergeWorktrees()` pre-snapshots `.sisyphus` state before merging — this must still target session root, not child repos.
- `worktreeBaseDir()` uses `join(cwd, '..', ...)` — with child repo as cwd, worktrees land next to the child repo (correct).
- Templates reference `.sisyphus/sessions/$SISYPHUS_SESSION_ID/` in 7 places across 4 files.
- Current `formatStateForOrchestrator()` has conditional logic for Git Worktrees section — this gets replaced entirely with the unified Repositories section.

### Handoff Notes
- `loadWorktreeConfig()` currently returns flat `WorktreeConfig | null`. Must change to return keyed `Record<string, WorktreeConfig>`. Breaking change.
- `mergeWorktrees()` takes `cwd` as first arg, uses it for all git operations. Per-repo merge means resolving git CWD per agent inside the loop using `agent.repo`.
- Three `cleanupWorktree()` callsites in `session-manager.ts` (handleKill, handleKillAgent, handleRollback) need repo-aware CWD resolution.
- `createWorktreeShell()` takes `cwd` — for multi-repo, pass the child repo path, not session root.
- `bootstrapWorktree()` takes `cwd` + `config` — caller must extract the right repo key's config from the keyed worktree.json.
- Auto-detect repos: scan immediate children for `.git` dirs. Also check session root. Return list of `{ name: string, path: string, branch: string, clean: boolean }`.
- `--repo` defaults to `"."` implicitly when session root is a git repo — no flag needed for single-repo sessions. But internally, `agent.repo` is always set (defaults to `"."`).
