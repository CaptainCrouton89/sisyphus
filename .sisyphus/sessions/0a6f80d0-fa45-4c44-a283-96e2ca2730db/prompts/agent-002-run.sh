#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export SISYPHUS_AGENT_ID='agent-002' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort medium --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-002-plugin" --agent 'devcore:programmer' --session-id "af2a00b9-61d0-4b57-a0b6-2c38177b8aec" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:ux-reference-documentation-pro write-dataviz-devcore:programmer c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/0a6f80d0-fa45-4c44-a283-96e2ca2730db/prompts/agent-002-system.md')" 'Write a comprehensive UX reference document on Data Visualization UX.

## Output
Write the file to: /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/data-visualization.md

## Format Reference
Follow the exact format of /Users/silasrhyneer/Code/crouton-kit/plugins/web/skills/ux-design/references/hitl-ai-chat.md — use similar structure: title, horizontal rules between sections, tables for frameworks/comparisons, bullet lists for patterns/anti-patterns, a Design Checklist section with checkboxes, and a Sources section at the end with real citations.

## Research Requirements
Use WebSearch to find authoritative sources. Search for patterns from:
- Edward Tufte'\''s principles (data-ink ratio, chartjunk, small multiples)
- Nielsen Norman Group (data visualization usability)
- Material Design (data visualization guidelines)
- Observable / D3 community best practices
- Stephen Few'\''s work (dashboard design, information dashboard design)
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

Every pattern should reference its source. No made-up citations.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %215