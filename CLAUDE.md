## Constraints
- `@crouton-kit/humanloop` and `@crouton-kit/crouter` are excluded from pnpm's `minimumReleaseAge` filter via `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` (not `.npmrc`) — omitting this silently causes fresh installs to skip newly published versions.
