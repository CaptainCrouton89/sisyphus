Implemented sisyphus companion CLI command.

Files changed:
- src/shared/protocol.ts: Added { type: 'companion'; name?: string } to Request union
- src/cli/commands/companion.ts: New command — sends companion request, renders face+stats+achievements+repos+commentary. Achievements grouped by category (milestone/session/time/behavioral). Repos sorted by visits descending, top 10. Color via ANSI (not tmux format).
- src/cli/index.ts: Imported and registered registerCompanion
- src/daemon/server.ts: Added 'companion' case in handleRequest; imports loadCompanion/saveCompanion from ./companion.js; sets name if provided then returns full CompanionState as data.

No blockers. Typecheck clean.