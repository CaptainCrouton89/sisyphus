Written SKILL.md (136 lines) and reference.md (255 lines) to /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/context-management/

SKILL.md:
- Frontmatter with trigger keywords (context window, token budget, RAG, long context, retrieval, caching, observation masking, compression)
- Attention economics model with U-shaped curve mechanics
- Token budget allocation table (10–15% / 15–20% / 30–40% / 20–30% / 10–15%)
- Placement effects: primacy/recency inversion at 50% fill threshold
- Claimed vs. effective context length (RULER benchmark)
- RAG precision-over-volume with specific patterns that hurt (HyDE, LLM reranking, query decomposition)
- Compression: LLMLingua 20x/1.5% loss, CompLLM 2x beats uncompressed, extractive vs. abstractive (+7.89 vs -4.69 F1)
- Caching: Anthropic (90% discount) vs. OpenAI (50%); cache-friendly design principle
- Multi-turn: observation masking beats summarization (JetBrains: 52% cheaper, +2.6% solve rate, agents run 13-15% longer with summaries)
- Tool output truncation patterns

reference.md:
- Dynamic token counting code (TypeScript)
- Prompt caching with explicit cache_control breakpoints (TypeScript); anti-pattern shown
- RAG retrieval pipeline with RRF fusion and cross-encoder reranking (Python)
- Chunking strategy table citing NVIDIA benchmark and ARAGOG
- LLMLingua code example with compression rates
- Observation masking implementation (TypeScript)
- Factory.ai two-threshold compaction (TypeScript) with anchored summary pattern
- Full citation table with URLs to all key papers and practitioner reports