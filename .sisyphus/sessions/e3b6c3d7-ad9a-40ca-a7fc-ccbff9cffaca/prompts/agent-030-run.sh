#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export SISYPHUS_AGENT_ID='agent-030' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-030-plugin" --agent 'sisyphus:debug' --session-id "b0a03a47-febb-4552-b524-1a4c31c8c9bb" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:sisyphus-fresh-install-testing fix-updater-docker-debug c15' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/e3b6c3d7-ad9a-40ca-a7fc-ccbff9cffaca/prompts/agent-030-system.md')" '## Goal
Fix the failing auto-updater integration test: `updater-registry-latest-version` — expected 0.0.2 as latest, got empty string.

## Symptoms
Running `bash test/integration/run.sh` shows:
- PASS|updater-isnewer-logic (pure logic test — OK)
- PASS|updater-verdaccio-start (verdaccio starts — OK)
- PASS|updater-pkg-dir-found (sisyphi package found — OK)  
- PASS|updater-pack-ok (npm pack succeeds — OK)
- FAIL|updater-registry-latest-version|expected 0.0.2 as latest, got: (empty)

So: verdaccio starts, package is found and packed, but `npm view sisyphi version --registry` returns empty. This means either:
- `npm publish` to verdaccio failed silently (stderr redirected to /dev/null)
- The publish worked but `npm view` syntax/registry arg is wrong
- verdaccio auth/config issue

## Test code
See `test/integration/suites/test-full.sh` lines 509-705 — `test_auto_updater()`.

## Debug approach
1. Use the already-built image: `docker run --rm -it sisyphus-test:full bash`
2. Inside container, manually reproduce the steps:
   - Start verdaccio with the config
   - Pack the package
   - Try `npm publish` WITHOUT redirecting stderr — see the actual error
   - Try `npm view` — see the actual output/error
   - Check if verdaccio storage has the package
   - Verify the htpasswd/auth setup works

Common npm publish issues:
- Scoped vs unscoped packages — verdaccio config may need `@*/*` for scoped
- The `--userconfig` flag may not be propagating the auth token correctly
- npm 10+ changed some publish behaviors

## Deliverable
Fix the test code in `test/integration/suites/test-full.sh` (or Dockerfile if needed) so the updater tests pass. Do NOT modify daemon source code — only test infrastructure.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2500