# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: Add an auto-updater integration test to `test/integration/suites/test-full.sh` that proves the updater can check for and install a newer version via npm.

## Approach

Use Verdaccio (lightweight npm registry) running locally inside the Docker container. The test:

1. Install verdaccio globally: `npm install -g verdaccio`
2. Start verdaccio on a local port (e.g., 4873) with a config that allows unauthenticated publish
3. Pack the current sisyphi installation into a tarball, modify its package.json to version "0.0.1", and publish to verdaccio
4. Modify the tarball to version "0.0.2" and publish that too  
5. Install "0.0.1" globally from verdaccio
6. Call the updater's `checkForUpdate()` function pointed at the verdaccio registry (or use `npm view sisyphi version --registry=http://localhost:4873` as a proxy for what the updater does)
7. Verify it detects "0.0.2" as available
8. Call `applyUpdate()` (or `npm install -g sisyphi --registry=http://localhost:4873`) 
9. Verify the installed version is now "0.0.2"

## Important details

- Read `src/daemon/updater.ts` — the updater uses `https://registry.npmjs.org/sisyphi/latest` hardcoded. For the test, we can't easily mock that URL. Instead, test the mechanics: 
  - Test `isNewer()` directly (it's exported) — verify version comparison logic
  - Test the actual npm install flow by using `--registry` flag with verdaccio
  - Verify the full cycle: old version installed → npm install -g updates → new version in place

- The Dockerfile needs verdaccio. Add it to the `full` stage: `RUN npm install -g verdaccio`

- Follow existing patterns in `test-full.sh`:
  - Add a `test_auto_updater()` function
  - Use `assert_pass`/`assert_fail`/`assert_contains` from the assertion library
  - Register in `run_full_tests()` at the bottom
  - Clean up (kill verdaccio, restore original install) at end of test

- Verdaccio config for auth-free publish — write a minimal config.yaml:
```yaml
storage: /tmp/verdaccio-storage
uplinks: {}
packages:
  '**':
    access: $all
    publish: $all
auth:
  htpasswd:
    file: /tmp/verdaccio-htpasswd
    max_users: 100
```

- Also test `isNewer()` version comparison directly via node -e since it's exported from the bundle. Check: "0.0.2" > "0.0.1" = true, "0.0.1" > "0.0.2" = false, "1.0.0" > "0.9.9" = true, equal versions = false.

## Files to modify
- `test/integration/Dockerfile` — add `npm install -g verdaccio` to the full stage
- `test/integration/suites/test-full.sh` — add `test_auto_updater` function and register it

Read the existing test-full.sh carefully before implementing to match the style.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
