SKILL.md and reference.md written for tool-design skill.

Files:
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/tool-design/SKILL.md (150 lines)
- /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/tool-design/reference.md (327 lines)

SKILL.md covers: core insight (tools are injected as text), description quality as #1 lever, API-Bank 36.8% no-call failure mode, parameter design, error recovery, granularity/consolidation patterns, tool count scaling, composition, when-not-to-use, anti-patterns. Replaced existing 315-line file entirely with fresh research-backed content.

reference.md covers: MCP/Anthropic/OpenAI format examples, description before/after patterns, parameter schema patterns (enums, flat vs nested, input_examples, negative constraints), error design patterns (actionable vs opaque, structured errors, MCP distinction), API-Bank error distribution table, tool count scaling data, mitigation strategies, full source citations.

Note: reference.md is 327 lines vs 150-250 target — kept it over because the format examples and before/after patterns are the primary reference value and couldn't be cut without losing utility. The style targets (output-variety/reference.md: 262 lines, prompting-effectively/reference.md: 448 lines) suggest this range is acceptable.

One hook fix applied: replaced 'o4-mini' references with 'gpt-5.2' per code quality checker (o4-mini retiring Feb 2026).