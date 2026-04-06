# Panels (`src/tui/panels/`)

## Rendering Contracts

- **`RenderedPanel` contract** (`detail.ts`, `logs.ts`): returns ANSI strings, cached via `RenderedCache`, dirty-tracked. Called from `renderFrame()`.
- **`FrameBuffer` contract** (`tree.ts`, `overlays.ts`, `bottom.ts`): writes directly via `drawBorder`/`writeClipped`, returns `void`. No caching — always repainted every frame.

## Tree Panel

- **Companion reservation is dynamic**: `companionRows = 2 + commentaryLineCount`. Fixed `innerH - 2` overflows with multi-line commentary.
- **Commentary wrapping uses `stringWidth` per word** (ANSI-safe) — unlike `overlays.ts` `wrapText` which uses raw `.length` and breaks on ANSI sequences.
- **`node.prefix` bypass**: if a `TreeNode` carries a pre-computed `prefix`, `renderTreePrefix` is skipped entirely — new node types setting `node.prefix` must handle their own indentation/connector glyphs.

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
