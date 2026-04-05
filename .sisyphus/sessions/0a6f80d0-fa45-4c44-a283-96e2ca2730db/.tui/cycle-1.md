# Cycle 1

**Status:** completed  |  **Duration:** 2m 45s
**Started:** Apr 4, 13:41:44
**Completed:** Apr 4, 13:44:29
**Mode:** implementation
**Claude Session:** 33c151aa-9d3c-4f4b-ba72-28607953c7a8


---


## Agents

### agent-001 — write-forms
- **Status:** completed  |  **Duration:** 2m 45s
- **Type:** devcore:programmer

**Instruction:**

Write a comprehensive UX reference document on Form & Input Design.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/form-input-design.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Nielsen Norman Group (form design, input usability)
- GOV.UK Design System (form patterns, error handling)
- Material Design (text fields, form components)
- Apple HIG (data entry, text fields)
- Smashing Magazine / UX Collective (form UX articles)
- Luke Wroblewski's work on web forms ("Web Form Design" book concepts)

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Form Layout & Structure** — single column vs multi-column, logical grouping, progressive disclosure, form length tradeoffs
2. **Input Types & Selection** — when to use text vs dropdown vs radio vs checkbox vs toggle, input masking, autocomplete
3. **Labels & Placeholders** — top-aligned vs left-aligned vs inline labels, placeholder text pitfalls, required field indicators
4. **Validation & Error Handling** — inline vs submit-time validation, error message placement, positive validation, field-level vs form-level errors
5. **Mobile & Touch Considerations** — tap targets, keyboard types, autofill, thumb zones
6. **Accessibility** — ARIA labels, focus management, screen reader considerations, color-independent error states
7. **Anti-Patterns** — table of common form UX mistakes (disappearing labels, validation on blur for empty fields, unclear required fields, etc.)
8. **Design Checklist** — checkbox list covering all key form UX considerations

Every pattern should reference its source. No made-up citations.

**Latest report** (final, Apr 4, 13:45:59):**

Form input design reference guide created with comprehensive sections and real citations.

### agent-002 — write-dataviz
- **Status:** completed  |  **Duration:** 2m 55s
- **Type:** devcore:programmer

**Instruction:**

Write a comprehensive UX reference document on Data Visualization UX.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/data-visualization.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Edward Tufte's principles (data-ink ratio, chartjunk, small multiples)
- Nielsen Norman Group (data visualization usability)
- Material Design (data visualization guidelines)
- Observable / D3 community best practices
- Stephen Few's work (dashboard design, information dashboard design)
- Smashing Magazine / UX Collective (data viz UX articles)
- GOV.UK Design System (charts and data presentation)

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Chart Type Selection** — when to use bar vs line vs pie vs scatter vs area vs table, decision framework
2. **Visual Encoding Principles** — position, length, area, color, angle — effectiveness hierarchy (Cleveland & McGill)
3. **Color in Data Viz** — sequential vs diverging vs categorical palettes, colorblind safety, semantic color, max categories
4. **Labels, Legends & Annotations** — direct labeling vs legends, annotation patterns, data density
5. **Interaction Patterns** — tooltips, zoom/pan, brushing, filtering, drill-down, linked views
6. **Responsive & Mobile Data Viz** — small screen adaptations, touch interactions, progressive disclosure of data
7. **Accessibility** — alt text for charts, screen reader patterns, keyboard navigation, high contrast
8. **Dashboard Layout** — information hierarchy, overview-first detail-on-demand, cognitive load management
9. **Anti-Patterns** — table of common data viz mistakes (3D charts, dual axes misuse, truncated axes, rainbow palettes, pie charts with too many slices, etc.)
10. **Design Checklist** — checkbox list covering all key data visualization UX considerations

Every pattern should reference its source. No made-up citations.

**Latest report** (final, Apr 4, 13:46:18):**

Data visualization guide written with 10 sections and authoritative citations.

### agent-003 — write-perf
- **Status:** completed  |  **Duration:** 4m 40s
- **Type:** devcore:programmer

**Instruction:**

Write a comprehensive UX reference document on Performance as UX.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/performance-ux.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Google Web Vitals (LCP, FID/INP, CLS) and web.dev performance guides
- Nielsen Norman Group (response time research, perceived performance)
- Jakob Nielsen's response time thresholds (0.1s, 1s, 10s)
- Smashing Magazine (perceived performance, skeleton screens)
- GOV.UK performance guidelines
- Apple HIG / Material Design (loading states, progress indicators)
- Ilya Grigorik's "High Performance Browser Networking" concepts

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Response Time Thresholds** — Nielsen's 0.1s/1s/10s model, Core Web Vitals targets, user perception of speed
2. **Perceived Performance** — skeleton screens, optimistic UI, progressive loading, content-first rendering
3. **Loading State Design** — spinners vs progress bars vs skeleton screens vs shimmer — when to use each, duration thresholds
4. **Optimistic UI** — patterns for instant feedback before server confirmation, rollback design, conflict resolution
5. **Progressive Loading** — lazy loading, infinite scroll vs pagination, above-the-fold prioritization, image loading strategies
6. **Offline & Degraded States** — service worker patterns, offline-first design, connection quality adaptation
7. **Animation & Transitions** — performance budgets for animation, 60fps constraints, will-change, layout thrashing
8. **Core Web Vitals as UX Metrics** — LCP, INP, CLS — what each measures, targets, common causes, fix patterns
9. **Anti-Patterns** — table of common performance UX mistakes (blank loading screens, layout shifts, blocking renders, no feedback during operations, etc.)
10. **Design Checklist** — checkbox list covering all key performance UX considerations

Every pattern should reference its source. No made-up citations.

**Latest report** (final, Apr 4, 13:48:21):**

Agent successfully completed document writing task.

### agent-004 — write-cli
- **Status:** completed  |  **Duration:** 3m 5s
- **Type:** devcore:programmer

**Instruction:**

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

**Latest report** (final, Apr 4, 13:46:51):**

Completed comprehensive CLI/terminal UX reference guide with 355 lines covering 11 sections and citations from 8+ authoritative sources.

### agent-005 — write-onboarding
- **Status:** completed  |  **Duration:** 3m
- **Type:** devcore:programmer

**Instruction:**

Write a comprehensive UX reference document on Onboarding & Empty States.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/onboarding-empty-states.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Nielsen Norman Group (onboarding UX, empty states, first-run experience)
- Material Design (onboarding patterns, empty states)
- Apple HIG (onboarding, first launch experience)
- Samuel Hulick's "The Elements of User Onboarding" concepts
- Appcues / UserPilot research on onboarding patterns
- Smashing Magazine / UX Collective (onboarding articles, empty state design)
- GOV.UK Design System (start pages, guidance patterns)

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Onboarding Models** — benefit-focused vs function-focused vs account setup, progressive onboarding, just-in-time guidance
2. **First-Run Experience** — welcome screens, feature tours, setup wizards, permission requests, zero-to-value time
3. **Empty States** — first-use empty states vs no-results vs error states, educational empty states, starter content, CTAs
4. **Progressive Disclosure** — revealing complexity over time, feature gating by experience level, contextual help
5. **Tooltips & Guided Tours** — coach marks, hotspots, step-by-step tours — when they work vs when they fail
6. **Activation & Engagement** — aha moment identification, activation metrics, reducing time-to-value, checklists
7. **Returning User Experience** — re-engagement, "what's new" patterns, resuming interrupted workflows
8. **Permission & Trust Building** — when to ask for permissions, progressive trust, social proof during onboarding
9. **Anti-Patterns** — table of common onboarding mistakes (forced tours, too many steps, info dumping, skippable-but-critical steps, etc.)
10. **Design Checklist** — checkbox list covering all key onboarding & empty state UX considerations

Every pattern should reference its source. No made-up citations.

**Latest report** (final, Apr 4, 13:47:04):**

Created comprehensive onboarding and empty states design guide with 296 lines covering 10 sections and verified citations from industry-leading sources.

### agent-006 — write-errors
- **Status:** completed  |  **Duration:** 2m 50s
- **Type:** devcore:programmer

**Instruction:**

Write a comprehensive UX reference document on Error & Edge State Design.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/error-edge-states.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Nielsen Norman Group (error message guidelines, error prevention, edge cases)
- GOV.UK Design System (error messages, error summary, validation patterns)
- Material Design (error states, snackbars, dialogs)
- Apple HIG (alerts, error handling)
- Smashing Magazine / UX Collective (error UX articles)
- Scott Hanselman / web dev community (edge case design)
- HTTP status codes and API error design patterns

## Content Requirements (aim for 150-300 lines)
Cover these areas with concrete patterns, anti-patterns, and practical rules:

1. **Error Message Anatomy** — title, description, action — writing clear error messages, tone, specificity, jargon avoidance
2. **Error Prevention** — constraints, confirmation dialogs, undo over confirm, smart defaults, input masking
3. **Error Presentation** — inline errors, toast/snackbar, banner, modal, error pages — when to use each
4. **Form Validation Errors** — real-time vs on-submit, field-level vs form-level, error summary patterns (GOV.UK style)
5. **Empty & Zero States** — no results, no data, no permission, no connection — each needs different treatment
6. **Loading Failures** — partial load, timeout, network error, retry patterns, cached fallbacks
7. **Edge States** — too much data, too little data, long strings, special characters, concurrent edits, stale data
8. **404 & Error Pages** — helpful error pages, search/navigation from error, humor vs utility
9. **Destructive Action Safeguards** — confirmation patterns, soft delete, undo windows, type-to-confirm
10. **Accessibility of Errors** — ARIA live regions, focus management on errors, screen reader announcements, color-independent indicators
11. **Anti-Patterns** — table of common error UX mistakes (generic "something went wrong", auto-dismissing errors, error messages without actions, silent failures, etc.)
12. **Design Checklist** — checkbox list covering all key error & edge state UX considerations

Every pattern should reference its source. No made-up citations.

**Latest report** (final, Apr 4, 13:47:02):**

Created comprehensive error edge states reference with 12 sections, patterns, anti-patterns, and checklist matching existing documentation format.



---


## Next Prompt

All 6 agents are writing reference docs in parallel. Review all reports, quality-check each document (format adherence, 150-300 lines, real source citations, pattern/anti-pattern tables, design checklists), fix any issues, then update SKILL.md to link all 6 new references.

