# Session: session-fork-management

## Pivot: branching → cloning

The original task was "session branching/forking" (git-branch semantics, parent-child lifecycle). After problem exploration (agent-001), the design was rejected in favor of **flat cloning**: `sisyphus clone "goal"` duplicates a session with no hierarchy, no completion hooks, no cross-session communication.

`Session.parentSessionId` exists in `src/shared/types.ts` and is checked by the `comeback-kid` companion achievement — **this feature deliberately does not populate it**. The achievement remains unearnable until something else sets that field.

## Authoritative artifacts (read in order)

- `context/requirements-clone.md` — 20 approved EARS requirements (source of truth)
- `context/design-clone.md` — approved technical design (~275 lines across 8 files)
- `context/plan-clone.md` — implementation plan with parallelization map

The `context/explore-integration-points.md` and `context/problem-session-branching.md` were produced under the rejected parent-child model — partially useful for codebase orientation, ignore any parent-child lifecycle hooks they describe.

## Where things stand

**Done.** All 7 implementation tasks complete, build + 357/357 tests pass, review produced 4 findings (3 fixed), all 12 E2E recipe steps in `context/e2e-recipe.md` pass. Session is in completion mode awaiting user sign-off.

## Env var leak: accidental clones during E2E testing

Running `sisyphus clone` from a shell that already has `SISYPHUS_SESSION_ID` set (e.g., running validation steps from within a sisyphus orchestrator pane) passes the CLI guard and creates a real clone against the active session. This happened during E2E validation — the clone was cleaned up manually. When testing `clone` end-to-end, either unset `SISYPHUS_SESSION_ID` first or run from a shell outside any sisyphus pane.

## Clone behavior constraints

- CLI guard: `clone` must reject calls outside an orchestrator pane (no `SISYPHUS_SESSION_ID` in env or session not found)
- Completed sessions must be rejected — cloning a completed session is an error
- Agent normalization: copied agent records get `status: "completed"` and `paneId` cleared (stale pane refs would break daemon tracking)
- ID replacement is grep-replace across all copied text files — missed replacements cause the clone's orchestrator to reference the wrong session
- Clone spawns orchestrator in strategy mode at `sourceSession.orchestratorCycles.length + 1` to force reorientation
