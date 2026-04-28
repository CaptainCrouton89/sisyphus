---
paths:
  - "src/tui/**/*.ts"
  - "src/tui/**/*.tsx"
---

No emoji codepoints in dashboard output.

- **Disallowed:** `U+1F000–U+1FAFF` and the emoji-presentation subset of Misc Symbols / Dingbats (`📨` `🔔` `✅` `❌` `🚀` `⏰`). Rule of thumb: renders in color → it's an emoji.
- **Allowed vocabulary** (already used across `src/tui/`): `◆ ◇ ◉ ◈ ◎ ◌ ✓ ✕ ✦ ★ ⚑ ⚠ ✎ ✉ ‣ ※ ☑ ☐ ▶ ▸ ▎`. Reuse these before introducing new symbols. Pick codepoints whose default presentation is text — never append `U+FE0F`.
- **Common replacements:** `📨 → ✉`, `✅ → ✓`, `❌ → ✗`, `🔔 → ⚑`.

Why: emoji width is measured as 1 by Ink but rendered as 2 by terminals — this corrupts panel borders (see `src/tui/lib/CLAUDE.md`). They also clash with the established monochrome geometric palette and read as a styling regression.

Verify: `rg -P '[\x{1F000}-\x{1FAFF}]' src/tui` must return nothing.
