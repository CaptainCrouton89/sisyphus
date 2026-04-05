# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca
- **Your Task**: ## Goal
Create the GitHub Actions workflow for integration tests at `.github/workflows/integration-tests.yml`.

## Session Goal
Build a comprehensive integration test suite for sisyphus that runs in Docker containers (Linux) and natively (macOS), triggered on push/PR.

## Your Task
Create `.github/workflows/integration-tests.yml` with two jobs.

Read the full implementation plan at `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §3.5 for detailed spec.

### Job 1: `linux-docker`
- Runs on: `ubuntu-latest`
- Steps: checkout → setup-node 22 → npm ci → npm run build → bash test/integration/run.sh
- This job uses Docker (the run.sh harness builds and runs containers)

### Job 2: `macos`
- Runs on: `macos-latest`
- Steps:
  1. actions/checkout@v4
  2. actions/setup-node@v4 (node-version: 22)
  3. npm ci
  4. npm run build
  5. npm pack
  6. Install globally: `npm install -g sisyphi-*.tgz`
  7. Swift notification build: `bash native/build-notify.sh`
  8. Verify .app exists: `test -d ~/.sisyphus/SisyphusNotify.app`
  9. Doctor smoke test: `sisyphus doctor` (exits 0 regardless — some checks may warn)

### Workflow triggers:
```yaml
on:
  push:
    branches: [main]
  pull_request:
```

### Important notes:
- macOS GHA runners have Xcode CLI tools (swiftc available)
- macOS job does NOT use Docker — tests run natively
- `sisyphus doctor` always exits 0, so this step won't fail the job
- The launchd plist test is intentionally omitted (GHA runners have limited launchd)
- Keep workflow file clean and well-commented

### Context files (read if needed):
- `.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/context/plan-implementation.md` §3.5

Report what you built and any design decisions.

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
