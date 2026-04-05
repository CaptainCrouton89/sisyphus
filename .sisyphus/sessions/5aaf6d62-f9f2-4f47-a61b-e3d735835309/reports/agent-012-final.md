## Changes made

### 1. ACHIEVEMENTS cross-layer import (Finding #1 — consumer side)
- src/shared/companion-types.ts: Added ACHIEVEMENTS array (parallel agent had already done this by the time I checked; confirmed present before my changes)
- src/tui/panels/overlays.ts line 5: Changed import to ../../shared/companion-types.js
- src/cli/commands/companion.ts line 4: Changed import to ../../shared/companion-types.js

### 2. loadCompanion cross-layer import + per-frame disk reads (Findings #1 + #2)
- src/tui/app.ts line 42: Removed import { loadCompanion } from '../daemon/companion.js'
- src/tui/app.ts: Added import for companionPath from shared/paths.js and CompanionState type from shared/companion-types.js
- src/tui/app.ts: Added module-level getCompanion() cache using statSync mtime check; reloads only when companion.json file changes
- src/tui/app.ts ~line 519: Pass getCompanion() to renderTreePanel() as companion param
- src/tui/app.ts ~line 624: Replaced try { loadCompanion() } call with getCompanion() — null check guards render
- src/tui/panels/tree.ts line 3: Removed import { loadCompanion } from daemon; added import type { CompanionState } from shared/companion-types.js
- src/tui/panels/tree.ts: Added companion?: CompanionState | null param to renderTreePanel signature
- src/tui/panels/tree.ts: Companion pinned-bottom render uses passed-in companion instead of calling loadCompanion()

### 3. Overlay dirty-tracking (Finding #7)
- src/tui/app.ts ~line 498-507: Added companionFP computed from getCompanion() when mode is companion-overlay; overlayInputs = overlayMode + ':' + companionFP; prevOverlayMode now stores the full overlayInputs string

### 4. panels/CLAUDE.md updated
- Removed note about ACHIEVEMENTS cross-layer dependency
- Updated loadCompanion() note to describe the new param-passing pattern

### Decisions
- getCompanion() called twice in overlay dirty check (once for ts, once for xp) — replaced with single call via local variable and explicit conditionals (hook flagged ?? defaults)
- Companion load failure (file missing, JSON parse error) is now non-fatal by returning cachedCompanion (last known good state), matching the original behavior