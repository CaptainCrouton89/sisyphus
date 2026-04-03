# CLAUDE.md — src/__tests__

## companion-render.test.ts

### `{BOULDER}` placeholder regression (lines 354–405)
The bottom block of `renderCompanion` tests are regression guards for a prior bug: `getBaseForm` used to embed literal boulder chars (`OO`, `@`) in the template string. `splitBodyAndBoulder` discarded them via `lastIndexOf`, which produced correct output by accident until agent count diverged from the embedded char. The fix replaced all embedded boulders with the `{BOULDER}` placeholder. Any test asserting `!result.includes('{BOULDER}')` is verifying this contract holds end-to-end.

### `endurance` stat is milliseconds
`getStatCosmetics` threshold is `endurance > 36_000_000` — that's 10 hours in ms. Tests use raw ms values; the stat summary converts to hours (`Math.floor(endurance / 3_600_000)`).

### Intensity tier defaults to 0 (mild) in tests
`getMoodFace` intensity comes from `companion.debugMood?.scores[companion.mood] ?? 0`. `createDefaultCompanion()` does not populate `debugMood`, so all `renderCompanion` face tests use mild-tier faces. To test moderate/intense faces, pass `debugMood` overrides via `makeCompanion`.

### Color wraps the entire face line, not just the face chars
`applyColor` calls `result.replace(facePart, coloredFace)` where `facePart` is the fully-composed body+boulder string (e.g. `ᕦ(^‿^)ᕤ .`). If `facePart` appears more than once in `result` (e.g. it also matches commentary text), only the first occurrence is colorized. Color is a no-op when `face` is not in `fields`.

### `boulder` field is silently skipped when `face` is present
`renderCompanion` embeds the boulder inside the face line. If `fields` includes both `face` and `boulder`, the `boulder` case is a no-op — the boulder renders only once via the face line. `boulder`-only output requires `face` to be absent from `fields`.

### `maxWidth` truncation algorithm
Commentary is shortened first: `available = maxWidth - (totalLength - commentaryLength) - 2` (the `-2` accounts for the double-space joiner). If `available < 0`, commentary is dropped entirely. A hard `result.slice(0, maxWidth - 1) + '…'` truncates the full joined string only if still over limit after commentary shrink.
