# agent-004 — write-cli

**Status:** running  |  **Duration:** 2m 40s  |  **Type:** devcore:programmer
**Spawned:** Apr 4, 13:43:46
**Claude Session:** 775ff197-b838-43a0-8506-31b93e0400b6


---


## Instruction

Write a comprehensive UX reference document on CLI & Terminal UX.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/cli-terminal-ux.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- clig.dev (Command Line Interface Guidelines — comprehensive community resource)
- 12 Factor CLI Apps
- Heroku CLI style guide
- GNU coding standards (command-line interfaces)
- Google's CLI design guidelines
- Ink / Charm / Bubbletea TUI frameworks (patterns they enable)
- Nielsen Norman Group (if any CLI-relevant research)
- Smashing Magazine / dev.to (CLI UX articles)

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Command Structure & Naming** — verb-noun patterns, subcommands, flag conventions, positional args vs named flags
2. **Output Design** — human-readable vs machine-parseable, structured output (JSON), color usage, verbosity levels
3. **Error Messages** — actionable errors, exit codes, stderr vs stdout, suggesting fixes
4. **Interactive vs Non-Interactive** — detecting TTY, prompts with defaults, confirmation patterns, --yes flags
5. **Progress & Feedback** — progress bars, spinners, streaming output, long-running operations
6. **Help & Discovery** — --help design, man pages, examples in help text, shell completions, discoverability
7. **Configuration** — config files, environment variables, flags precedence, sensible defaults, XDG base dirs
8. **TUI Patterns** — full-screen terminal UIs, keyboard navigation, mouse support, responsive terminal layouts
9. **Scripting & Composability** — Unix philosophy, piping, exit codes, idempotency, quiet mode
10. **Anti-Patterns** — table of common CLI UX mistakes (wall-of-text output, no color when TTY, inconsistent flags, requiring args that could be defaulted, etc.)
11. **Design Checklist** — checkbox list covering all key CLI/terminal UX considerations

Every pattern should reference its source. No made-up citations.
