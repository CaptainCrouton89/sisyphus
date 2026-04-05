#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export SISYPHUS_AGENT_ID='agent-001' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-001-plugin" --agent 'devcore:programmer' --session-id "4e3704c0-1930-49c8-8627-a76fafdbecfb" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:ux-reference-documentation-pro write-forms-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-001-system.md')" 'Write a comprehensive UX reference document on Form & Input Design.

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
- Luke Wroblewski'\''s work on web forms ("Web Form Design" book concepts)

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

Every pattern should reference its source. No made-up citations.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %214