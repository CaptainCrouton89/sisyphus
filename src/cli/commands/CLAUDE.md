- **`@sisyphus_cwd` trailing slash (scratch.ts):** `findHomeSession` strips trailing slashes before matching — `start.ts` stores without trailing slash; a path stored with one silently finds no home session.
- **companion `--repo` is exact path match:** `obs.repo === repo` — passing a basename silently matches nothing; display uses basename regardless.
- **Observations outside `CATEGORY_ORDER` silently dropped (companion):** `grouped.get(obs.category)?.push(...)` is a no-op for unknown categories. Only `session-sentiments`, `repo-impressions`, `user-patterns`, `notable-moments` ever render.

## review.ts
- **`--wait` consumes feedback file:** Reads then deletes (`unlinkSync`) — one-shot. Filenames differ by command: `requirements --wait` reads `review-feedback.md`; `design --wait` reads `design-feedback.md`.
- **History events require both `--wait` and a resolved `sessionId`:** Auto-detected sessions (no flag, no env) silently produce no history events even with `--wait`.
- **`--export` hand-edit guard:** Byte-for-byte comparison; any whitespace difference blocks write. `--force` renames existing to `.bak` then atomic-writes.
- **`meta.bounceIterations` schema (requirements only):** Global integer — previously `Record<sectionId, integer>`; writing a keyed object is a schema violation. `meta.nextSectionId` removed. Design schema has no `bounceIterations` or `stage` fields.
- **`safeAssumptions` constraints:** Cap is 9 per group (TUI 1-9 key affordance; exceeding 9 silently truncates keyboard access). IDs must be unique across **all** groups and `safeAssumptions` arrays in the file.
- **`openQuestions.selectedOption` type differs by artifact:** Requirements stores integer index into `options[]`; design stores title string. Don't pre-fill "Custom answer" — TUI adds it automatically.
- **`reviewAction: 'bounce-to-design'`** (requirements only): Design items use `agree | pick-alt | comment` — writing `bounce-to-design` into a design item is a schema violation.

- **yield.ts — No orchestrator identity check:** Parent CLAUDE.md states `yield` checks `SISYPHUS_AGENT_ID === 'orchestrator'` — it does not. Only `assertTmux()` runs; `agentId: 'orchestrator'` is hardcoded unconditionally.
- **`INTERACTIVE_AGENT_TYPES` hardcoded (history.ts):** `sisyphus:requirements`, `sisyphus:design`, `sisyphus:spec` — new TUI agent types must be added here or their time inflates compute averages.
- **`findSession` substring ambiguity (history.ts):** Resolution ends with name `includes` substring — first result in newest-first sort wins silently when multiple sessions match.
