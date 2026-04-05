## Current Stage
Stage: implementation
Status: starting Wave 1 — assertion library + Dockerfile

## Exit Criteria
- All 7 files created (Dockerfile, assert.sh, 3 test suites, harness, GHA workflow)
- Docker builds succeed for all 3 targets
- Test suite source chain works (full → tmux → base → assert)
- Harness produces clean matrix output

## Active Context
- context/plan-implementation.md (authoritative task breakdown)
- context/design-integration-tests.md (architecture reference)
- context/e2e-recipe.md (verification steps)
- context/explore-nodepty-docker.md (Docker image constraints)
- context/explore-daemon-headless.md (daemon headless behavior)
- context/explore-doctor-matrix.md (doctor check symbols)

## Next Steps
- Wave 1: Spawn agents for assert.sh + Dockerfile (this cycle)
- Wave 2: Spawn agents for 3 test suites (next cycle, after Wave 1)
- Wave 3: Harness + GHA workflow (after Wave 2)
