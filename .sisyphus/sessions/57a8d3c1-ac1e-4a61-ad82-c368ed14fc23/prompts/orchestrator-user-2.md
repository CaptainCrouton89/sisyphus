## Goal

Expand Sisyphus notification coverage so users get macOS notifications for important lifecycle events beyond just crashes. Currently only agent-crash and orchestrator-crash send notifications via the Swift app. Add daemon-side notifications for: orchestrator/agent stops (waiting for input), orchestrator mode transitions, session completion, and cycle boundaries. Consolidate notification routing through `sendTerminalNotification` (Swift SisyphusNotify.app) rather than relying solely on the fragile hook-based `terminal-notifier`/`osascript` approach in `idle-notify.sh`.

### Cycle Log

Write your cycle summary to: .sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/logs/cycle-002.md

### Most Recent Cycle

- **agent-001** (impl-notifications) [completed]: @.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/reports/agent-001-final.md

## Strategy

@.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/strategy.md

## Roadmap

@.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/roadmap.md

## Digest

@.sisyphus/sessions/57a8d3c1-ac1e-4a61-ad82-c368ed14fc23/digest.json


## Continuation Instructions

Review agent-001 report on notification implementation. Verify the changes look correct: all 4 notification points added, config gated, build passes. If clean, transition to validation.