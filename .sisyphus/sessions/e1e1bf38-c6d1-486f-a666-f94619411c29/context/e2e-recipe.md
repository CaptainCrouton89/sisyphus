# Clone E2E Verification Recipe

## Prerequisites
- `npm run build` succeeds with no errors
- `npm test` passes (existing + new state tests)
- Daemon running: `sisyphusd restart`

## Verification Steps

### 1. Build & Unit Tests
```bash
npm run build
npm test
```
Expected: zero errors, zero failures.

### 2. Start a Source Session
```bash
sisyphus start "test source session" --context "Some background context"
```
Wait for orchestrator to spawn. Let it run at least one cycle so it has context files, agent reports, and cycle history.

### 3. Clone from Orchestrator Pane
From the orchestrator's tmux pane:
```bash
sisyphus clone "divergent goal for clone" --context "Additional clone context"
```

Expected output:
- "Session cloned successfully." with clone ID and tmux session name
- "The cloned session now owns..." guidance
- Scope update instructions

### 4. Verify Clone Session Exists
```bash
sisyphus list
```
Expected: both source and clone sessions listed.

### 5. Verify Clone Directory
```bash
ls .sisyphus/sessions/{cloneId}/
```
Expected directories: context/, prompts/, reports/, snapshots/, logs/
Expected files: state.json, goal.md, initial-prompt.md, roadmap.md

### 6. Verify ID Replacement
```bash
grep -r "{sourceId}" .sisyphus/sessions/{cloneId}/context/
```
Expected: no matches (source ID fully replaced with clone ID).

### 7. Verify Clone State
```bash
cat .sisyphus/sessions/{cloneId}/state.json | jq '.task, .status, .activeMs'
```
Expected: new goal, "active", 0.

### 8. Verify Clone Orchestrator Mode
Clone orchestrator should spawn in strategy mode. Check the tmux pane — it should be running a fresh strategy cycle.

### 9. Verify Source Unaffected
```bash
cat .sisyphus/sessions/{sourceId}/state.json | jq '.status'
```
Expected: still "active" (unchanged).

### 10. Clone Without --strategy
Verify strategy.md is NOT copied unless flag is provided:
```bash
ls .sisyphus/sessions/{cloneId}/strategy.md
```
Expected: file not found (unless --strategy was used).

### 11. Multiple Clones
Run `sisyphus clone "second clone"` from the source orchestrator.
Expected: new independent session with different UUID.

### 12. Error Cases
- From a non-orchestrator pane: `sisyphus clone "test"` → error about orchestrator-only
- Without SISYPHUS_SESSION_ID: `unset SISYPHUS_SESSION_ID && sisyphus clone "test"` → exit 1
- Clone completed session → rejected with error

## Success Criteria
All 12 steps pass without errors. Clone session runs independently with inherited context but new identity.
