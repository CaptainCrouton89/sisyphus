# agent-003 — write-perf

**Status:** running  |  **Duration:** 2m 50s  |  **Type:** devcore:programmer
**Spawned:** Apr 4, 13:43:35
**Claude Session:** a47fe2f4-c2bc-4e88-b6cf-e2dd515f7cb2


---


## Instruction

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
