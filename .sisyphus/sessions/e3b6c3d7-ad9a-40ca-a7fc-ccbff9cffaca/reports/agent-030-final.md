## Fixed: updater-registry-latest-version integration test

### Root Cause
Two issues in `test/integration/suites/test-full.sh` `test_auto_updater()`:

**1. IPv6-only listener (line 588)**: `verdaccio --listen "$VERDACCIO_PORT"` binds to IPv6 only (`::1`). npm connects via IPv4 (`127.0.0.1`), causing the publish requests to hang indefinitely. The publish stderr was redirected to /dev/null so the hang was invisible — the test appeared to get an empty npm view result.

**Fix**: Changed to `--listen "0.0.0.0:${VERDACCIO_PORT}"` to bind on IPv4.

**2. Dependencies not resolvable from verdaccio (line 638-644)**: After fixing the listener, a second failure surfaced: `npm install -g sisyphi@0.0.1 --registry verdaccio_url` failed with E404 on `@r-cli/sdk` because verdaccio has no uplinks. The published tarballs carried the original `dependencies`/`scripts` fields, but the dist bundle is self-contained via tsup.

**Fix**: The version-bump node script now also strips `dependencies`, `devDependencies`, `optionalDependencies`, and `scripts` from the published package.json.

### Changes
- `test/integration/suites/test-full.sh:588` — listen on `0.0.0.0:PORT` instead of just `PORT`
- `test/integration/suites/test-full.sh:641-649` — strip deps/scripts from version-bumped packages

### Verification
Full test suite: 137 pass, 0 fail, 4 expected skips (141 total)