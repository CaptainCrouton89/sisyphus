# agent-006 — write-errors

**Status:** running  |  **Duration:** 2m 15s  |  **Type:** devcore:programmer
**Spawned:** Apr 4, 13:44:11
**Claude Session:** cc0550f2-89c6-4651-a136-00b7c7329c7c


---


## Instruction

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
