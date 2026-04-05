## Current Stage
Stage: exploration
Status: starting — need to understand node-pty Docker constraints, mock boundaries, and degradation paths

## Exit Criteria
- Know which base image works for node-pty (Alpine needs python/make/gcc; Debian has prebuilds)
- Have doctor checks × environment tier expected outcome matrix
- Understand Claude CLI mock scope (what the harness needs to fake)
- Know if daemon starts headless (no tmux server)

## Active Context
(none yet)

## Next Steps
- Spawn explore agents: node-pty Docker compilation, daemon headless behavior, doctor check mapping
- Compile findings into context docs for design phase
