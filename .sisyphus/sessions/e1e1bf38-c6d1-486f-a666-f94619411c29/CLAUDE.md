# Session: session-fork-management

## Pivot: branching → cloning

The original task was "session branching/forking" (git-branch semantics, parent-child lifecycle). After problem exploration (agent-001), the design was rejected in favor of **flat cloning**: `sisyphus clone "goal"` duplicates a session with no hierarchy, no completion hooks, no cross-session communication.

`Session.parentSessionId` exists in `src/shared/types.ts` and is checked by the `comeback-kid` companion achievement — **this feature deliberately does not populate it**. The achievement remains unearnable until something else sets that field.

## Authoritative artifacts (read in order)

- `context/requirements-clone.md` — 20 approved EARS requirements (source of truth)
- `context/design-clone.md` — approved technical design (~275 lines across 8 files)
- `context/plan-clone.md` — implementation plan with parallelization map

The `context/explore-integration-points.md` and `context/problem-session-branching.md` were produced under the rejected parent-child model — partially useful for codebase orientation, ignore any parent-child lifecycle hooks they describe.

## Where things stand (cycle 5)

Cycle 5 is active with no agents spawned — implementation is next. The plan calls for 2-3 parallel agents covering:
- **Group A** (parallel): `src/shared/types.ts`, `src/shared/protocol.ts`, `src/daemon/state.ts`, `src/daemon/orchestrator.ts`
- **Group B** (after A): `src/daemon/session-manager.ts`, `src/daemon/server.ts`, `src/cli/commands/clone.ts`, `src/cli/index.ts`

## Clone behavior constraints

- CLI guard: `clone` must reject calls outside an orchestrator pane (no `SISYPHUS_SESSION_ID` in env or session not found)
- Completed sessions must be rejected — cloning a completed session is an error
- Agent normalization: copied agent records get `status: "completed"` and `paneId` cleared (stale pane refs would break daemon tracking)
- ID replacement is grep-replace across all copied text files — missed replacements cause the clone's orchestrator to reference the wrong session
- Clone spawns orchestrator in strategy mode at `sourceSession.orchestratorCycles.length + 1` to force reorientation
