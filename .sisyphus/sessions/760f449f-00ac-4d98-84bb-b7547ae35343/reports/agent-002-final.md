Explored all supporting directories and root config files. Report saved to context/explore-support-dirs.md. Key findings:

## Templates (templates/)
- Rich prompt template system with phase-based orchestrator modes (planning/strategy/impl/validation)
- Plugin subdirectories for crouton-kit specialized agent types (debug, explore, plan, review, etc.)
- Templates copied to dist/ at build time

## Infrastructure
- launchd plist for daemon auto-start on macOS
- GitHub Actions auto-publishes to npm on push to main (patch bump + provenance)
- .claude/ has rules for prompt editing, a restart command, and a multi-repo-support spec

## Build
- tsup bundles 3 entry points (cli, daemon, tui) as ESM for Node 22
- Code splitting enabled, shebangs added, templates copied on success

## Root Config
- package.json: npm name 'sisyphi', v1.1.7, commander + uuid + @r-cli/sdk deps
- tsconfig: strict, ES2022, NodeNext resolution
- IDEAS.md: reactive orchestrator inbox model (agents trigger orchestrator wakeups mid-cycle)

No blockers or issues found.