#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export SISYPHUS_AGENT_ID='agent-005' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-005-plugin" --agent 'devcore:programmer' --session-id "bebf5f8f-88d1-452d-a331-3a98f8f3a1ce" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:ux-reference-documentation-pro write-onboarding-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-005-system.md')" 'Write a comprehensive UX reference document on Onboarding & Empty States.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/onboarding-empty-states.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Nielsen Norman Group (onboarding UX, empty states, first-run experience)
- Material Design (onboarding patterns, empty states)
- Apple HIG (onboarding, first launch experience)
- Samuel Hulick'\''s "The Elements of User Onboarding" concepts
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
7. **Returning User Experience** — re-engagement, "what'\''s new" patterns, resuming interrupted workflows
8. **Permission & Trust Building** — when to ask for permissions, progressive trust, social proof during onboarding
9. **Anti-Patterns** — table of common onboarding mistakes (forced tours, too many steps, info dumping, skippable-but-critical steps, etc.)
10. **Design Checklist** — checkbox list covering all key onboarding & empty state UX considerations

Every pattern should reference its source. No made-up citations.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %218