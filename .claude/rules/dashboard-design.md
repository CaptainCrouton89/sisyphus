---
paths:
  - "src/tui/**/*.ts"
  - "src/tui/**/*.tsx"
---

Sisyphus is a dashboard for overseeing autonomous agents. Before designing a new panel or substantially reworking an existing one, load these references — skip for typo fixes, copy tweaks, or single-line changes.

- Skill `web:ux-design` — Nielsen/Shneiderman heuristics, plus the autonomous-systems section (overview panel, resolution-flow taxonomy: validation / decision / context / error / notify maps directly to `src/shared/inbox-types.ts`). Its `references/cli-terminal-ux.md` covers terminal-specific output rules.
- Skill `web:interface-design` — status panels, activity logs and trace visualization, header KPIs, subtle layering.
- Local CLAUDE.md files in `src/tui/`, `src/tui/panels/`, `src/tui/lib/` — project-specific rendering invariants (cache pairs, scroll resets, Ink width quirks). On conflict with generic skill advice, the local files win.

Why: the TUI has a coherent established vocabulary (geometric icons, ANSI palette, dense panel hierarchy). Reaching for generic AI-dashboard tropes regresses it; the skills provide framework, the local CLAUDE.mds provide calibration.
