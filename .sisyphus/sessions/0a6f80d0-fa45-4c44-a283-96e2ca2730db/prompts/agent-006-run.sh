#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export SISYPHUS_AGENT_ID='agent-006' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-006-plugin" --agent 'devcore:programmer' --session-id "cc0550f2-89c6-4651-a136-00b7c7329c7c" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:ux-reference-documentation-pro write-errors-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-006-system.md')" 'Write a comprehensive UX reference document on Error & Edge State Design.

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

Every pattern should reference its source. No made-up citations.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %219