# E2E Verification Recipe

## Local Verification (Linux via Docker)

From project root:

```bash
bash test/integration/run.sh
```

**Expected**: Clean matrix with all tiers passing. Output should show:
- base: 10/10 pass
- tmux: 17/17 pass (10 base + 7 tmux)
- full: 25/25 pass (10 base + 7 tmux + 8 full)

Exit code 0 = all pass, 1 = any fail.

**Prerequisites**: Docker installed and running.

## Verification Steps

1. **Harness runs without errors**: `run.sh` creates tarball, stages Docker context, builds all 3 images
2. **Each tier container runs**: Docker images build successfully for base/tmux/full targets
3. **Tests produce structured output**: Each tier prints `PASS|name` / `FAIL|name|reason` lines
4. **Matrix displays correctly**: Consolidated matrix shows all test names across tiers with `----` for non-applicable tests
5. **Exit code reflects results**: 0 on all-pass, 1 on any failure

## macOS Verification (GHA)

Push to a branch and check the GitHub Actions workflow:
- `linux-docker` job: runs `test/integration/run.sh` in CI
- `macos` job: npm pack → global install → Swift build → doctor smoke test

## Quick Smoke Test (during development)

Build just the base tier to validate Dockerfile + assert lib:
```bash
npm pack
STAGE=$(mktemp -d)
cp sisyphi-*.tgz "$STAGE/"
cp test/integration/Dockerfile "$STAGE/"
cp -r test/integration/lib "$STAGE/lib"
cp -r test/integration/suites "$STAGE/suites"
docker build --target base -t sisyphus-test:base "$STAGE"
docker run --rm sisyphus-test:base bash /tests/suites/test-base.sh
rm -rf "$STAGE" sisyphi-*.tgz
```
