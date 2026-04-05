Research complete. Output: .sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-context-management.md (390 lines)

Covers all 7 requested topics with citations:
1. Context window mechanics — Lost in the Middle (Liu et al.), RULER benchmark, attention dilution, position effects with fill-rate threshold
2. RAG patterns — chunking (NVIDIA benchmark, ARAGOG), embeddings (MTEB), hybrid search (BEIR), re-ranking, 13 named failure modes, advanced patterns with evidence-based assessment
3. Compression — LLMLingua (20x with 1.5% loss), extractive vs abstractive tradeoff, MapReduce vs Refine, when compression hurts
4. Token budgeting — 10-15/15-20/30-40/20-30/10-15 split, 60-80% utilization rule, placement effects
5. Caching — Anthropic explicit (90% read savings) vs OpenAI automatic (50%), cache-friendly design, production case studies (60-70% cost reduction)
6. Multi-turn management — observation masking vs summarization (JetBrains), Anthropic 3-level compaction, Factory.ai two-threshold system
7. Tool results — prevention strategies, compaction best practices, sub-agent delegation

Key surprising findings:
- Observation masking outperforms LLM summarization for agents (JetBrains: 52% cheaper, 2.6% higher solve rate)
- 2x compressed context can outperform uncompressed (CompLLM)
- HyDE hurts factoid queries (ARAGOG: -0.065 precision, p<0.001)
- Cohere Rerank showed no significant improvement in ARAGOG controlled study
- Position effects invert above 50% context fill rate

Dated model-specific benchmark scores noted as point-in-time; architectural findings (attention curves, dilution) are durable.