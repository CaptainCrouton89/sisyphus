Research document saved to .sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-system-vs-user-prompt.md (266 lines). Covers all 7 requested topics:

1. MECHANICAL DIFFERENCES — Lost in the Middle (Liu 2023) U-shaped curve, trained instruction hierarchy via RLHF (not just positional), primacy/recency biases in attention, multi-turn degradation patterns.

2. PROMPT CACHING — Anthropic (90% discount, explicit breakpoints, 5min TTL), OpenAI (50% discount, automatic, no write premium), Google (75% discount, 32K min, explicit API). System prompt = cacheable zone is the key design principle.

3. SECURITY — System prompt as defense layer not boundary, direct/indirect injection taxonomy, OpenAI Instruction Hierarchy paper (2024) showing 20-30% robustness gain, sandwich defense and delimiter strategies. Greshake et al. (2023) on indirect injection.

4. MULTI-TURN DEGRADATION — System prompts persist better than user instructions over conversation length, but all instructions degrade. Reminder pattern recommended for critical constraints.

5. PROVIDER DIFFERENCES — Anthropic (dedicated API param), OpenAI (system→developer role evolution), Google (constructor param), open-source (inconsistent template support, weaker hierarchy enforcement).

6. PRACTICAL GUIDELINES — What goes where taxonomy, structural patterns (XML sections, priority ordering, sandwich pattern), common mistakes (10 items), multi-turn best practices.

7. DEVELOPER MESSAGE EVOLUTION — OpenAI's Platform→Developer→User hierarchy formalization, backward compat for system role, stronger adherence in newer models.

SOURCES CITED: 3 academic papers (Liu 2023, OpenAI 2024, Greshake 2023), 7 provider doc URLs, 2 security resources (OWASP, Willison), 2 practitioner guides.