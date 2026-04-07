# Panels (`src/tui/panels/`)

## Rendering Contracts

- **`RenderedPanel` contract** (`detail.ts`, `logs.ts`): returns ANSI strings, cached via `RenderedCache`, dirty-tracked. Called from `renderFrame()`.
- **`FrameBuffer` contract** (`tree.ts`, `overlays.ts`, `bottom.ts`): writes directly via `drawBorder`/`writeClipped`, returns `void`. No caching — always repainted every frame.

## Tree Panel

- **Companion reservation is dynamic**: `companionRows = 2 + commentaryLineCount`. Fixed `innerH - 2` overflows with multi-line commentary.
- **Commentary wrapping uses `stringWidth` per word** (ANSI-safe) — unlike `overlays.ts` `wrapText` which uses raw `.length` and breaks on ANSI sequences.
- **`node.prefix` bypass**: if a `TreeNode` carries a pre-computed `prefix`, `renderTreePrefix` is skipped entirely — new node types setting `node.prefix` must handle their own indentation/connector glyphs.
- **Companion mood color applied externally**: `renderCompanion` is called without color; `getMoodAnsiCode` wraps the entire faceLine afterward. `renderCompanion`'s internal `applyColor` uses string replace — truncation by `maxWidth` can cut mid-escape, producing garbled output. Don't move color back inside `renderCompanion`.
- **`faceRow` pinned from panel bottom** (`y + h - 2 - commentaryCount`), not from tree content end — companion stays anchored even when fewer nodes than panel height.
- **Companion field set flips on `hasActive`**: uses `verb` (spinner) when any session is `'active'`, `hobby` otherwise. Adding a field for one state requires auditing both branches.
- **Unfocused cursor**: bold only, no inverse — `\x1b[7m` is gated on `focused`. Selected-but-unfocused nodes show bold text with no background highlight.
- **`NodeContent.suffix`/`suffixColor`** — declared in the interface but returned by no current node type. Intended extension point for right-side badges; set both or neither (`suffix` without `suffixColor` is silently dropped).
- **`modeColor` imported but not applied**: cycle mode badge always renders dim/gray. `modeColor` (in `format.ts`) maps modes to colors but is unused in `tree.ts` — cycle mode is uncolored. To add cycle mode color, route it through `metaColor` or `suffixColor` on the returned `NodeContent`.
- **`abbreviateMode` passes unknown modes through verbatim**: new mode enum values display unabbreviated rather than breaking. Update `abbreviateMode` in `format.ts` when adding modes that need shortening.
- **Scroll indicators each consume 1 row from `availRows`**: when both top and bottom indicators are active, visible tree compresses by 2 rows from `maxVisible`. Combined with companion reservation on a small panel, visible nodes can be very few. `maxVisible` is the budget; `availRows` is what's left after indicators.
- **`visible` slice over-reads by 1 when bottom indicator is present**: `nodes.slice(scrollOffset, scrollOffset + availRows + 1)`. The extra node is never rendered — `renderCount = Math.min(visible.length, availRows)` caps the loop. Iterating `visible` directly instead of `[0..renderCount)` processes a phantom node.
- **`innerX = x + 2`, `innerW = w - 4`**: 1-char border + 1-char margin on each side. `writeClipped` calls added inside `renderTreePanel` must use these offsets — writing at `x + 1` or width `w - 2` overlaps the border character.

## Overlays

- **Three companion overlay pages** (`profile`/`badges`/`help`): Tab cycles `profile ↔ badges`; `?` jumps to `help`. `help` is not in the Tab cycle.
- **`wrapText` in overlays assumes plain text** — ANSI sequences in commentary break word-wrap.
- **`computeLevelProgress` imported from `daemon/companion.js`** — the only panel with a direct daemon-layer import; level scaling changes require updating that file.

## Detail Panel

- **Three renderers in one file**: `renderDetailRows`, `renderDigestRows`, `renderLogsRows` — each with separate cache pairs.
- **`report-detail` mode bypasses `cursorNode`**: reads `state.targetAgentId` instead.
- **`borderColor` computed twice**: inside the switch (cache-miss path) and again after the cache block (authoritative). Add custom border logic to both locations or cache hits always use `'gray'`.
- **Cache key uses content lengths, not hashes** — equal-length edits don't invalidate.
- **Strategy replaces plan, never coexists**: empty string `strategyContent` shows plan.

## Bottom Panel

- **`renderStatusLine` returns nothing in `report-detail` and `compose` modes** — status bar goes blank, not hidden.
