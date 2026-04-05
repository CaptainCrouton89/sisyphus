# Context Management for LLM Applications — Windows, Retrieval, and Compression

Research compiled 2026-04-04. Sources include peer-reviewed papers, provider documentation, and practitioner reports. Specific model benchmark scores are point-in-time evidence for architectural principles — check current leaderboards before making model selection decisions.

---

## Key Findings

1. **Models don't use context uniformly.** Information in the middle of a context window suffers 20–30% accuracy drops vs. the beginning or end ("Lost in the Middle," Liu et al. 2024). This U-shaped recall curve is a learned property of pre-training, not a bug — and it persists across all transformer architectures tested.

2. **Advertised context length ≠ effective context length.** On the RULER benchmark, only 4 of 10 models maintained satisfactory performance at their claimed 32K minimum. Simple needle-in-haystack tests dramatically overstate practical capability — complex multi-hop tasks degrade 2–4x faster than retrieval tasks. Even with *perfect retrieval* (model can locate all relevant text), task performance still degrades 14–85% as context grows (arXiv 2510.05381).

3. **Retrieval precision beats context stuffing.** Filtering irrelevant retrieved passages reduces hallucinations by up to 64% (FILCO). The right pattern: high-recall retrieval (50–100 candidates) → rerank → pass 5–10 to the LLM. Never pass raw top-k directly.

4. **Compression can outperform uncompressed context.** LLMLingua achieves 20x compression with ~1.5% quality loss on reasoning tasks. CompLLM research showed 2x compressed context *outperforming* uncompressed on long sequences — compression removes noise that dilutes attention.

5. **Observation masking beats LLM summarization for agents.** JetBrains Research found replacing older tool outputs with placeholders is 52% cheaper with 2.6% higher solve rates than LLM summarization. Summarized agents ran 13–15% longer because summaries obscured natural failure signals.

6. **Prompt caching provides 60–90% cost reduction with zero quality impact.** Anthropic's explicit caching offers 90% savings on reads; OpenAI's automatic caching offers 50%. Cache-friendly design (static content first, dynamic content last) is a free optimization.

7. **Token budget allocation matters as much as content selection.** Recommended split: system 10–15%, tools 15–20%, knowledge/RAG 30–40%, history 20–30%, output reserve 10–15%. Optimal utilization is 60–80% of window capacity.

---

## Context Window Mechanics

### The U-Shaped Attention Curve

LLMs exhibit a U-shaped performance curve: information at the beginning and end of context is processed effectively, while middle content is substantially degraded. Liu et al. (Stanford/Berkeley, 2023) demonstrated this across multi-document QA and key-value retrieval. For the models tested, performance with relevant content in the middle fell *below* the no-document baseline — the model did better without documents than with documents where the answer was buried in the center.

Key-value retrieval showed ~70–80% accuracy at boundary positions vs. 20–40% in the middle. A 2025 mechanistic follow-up (arXiv 2510.10276) explains this as emergent from pre-training: some tasks train uniform recall (producing primacy effects via attention sinks), while others prioritize recent tokens (producing recency effects).

**This is an architectural property of transformer attention, not a model-specific bug.** It has been confirmed across every architecture tested, including decoder-only and encoder-decoder models.

**Citation:** Liu et al., "Lost in the Middle: How Language Models Use Long Contexts," *Transactions of the ACL*, 2024. [aclanthology.org/2024.tacl-1.9](https://aclanthology.org/2024.tacl-1.9/)

### Position Effects Shift with Fill Rate

The relationship between position and accuracy isn't static — it depends on how much of the context window you're using:

- **Below 50% fill:** Primacy dominates. Put critical content first.
- **Above 50% fill:** Primacy *inverts* (first-position accuracy drops below middle). Recency remains stable. Put critical content last.
- The transition is sharp around the 50% threshold (arXiv 2508.07479).

Chain-of-thought prompting partially mitigates position bias but does not eliminate it.

**Citation:** arXiv 2508.07479, "Positional Biases Shift as Inputs Approach Context Window Limits"
**Citation:** arXiv 2406.15981, "Serial Position Effects of Large Language Models"

### Claimed vs. Effective Context Length

The RULER benchmark (Hsieh et al., NVIDIA, COLM 2024) tested 10 models across 4K–128K using 13 tasks beyond simple needle retrieval. The consistent finding: most models claiming 128K+ effective context had practical limits at 50–65% of advertised for complex tasks. Simple NIAH tests produce near-perfect scores, but when RULER added complexity (multiple needles, multi-hop reasoning, aggregation), performance collapsed.

A separate 2025 study found that even with *perfect retrieval* (model can locate all relevant text), task performance still degrades 14–85% as context grows — retrieval and reasoning degrade at different rates.

The "retrieve-then-solve" pattern (ask the model to recite relevant evidence first, then answer from a shortened context) can partially compensate.

**Citation:** Hsieh et al., "RULER: What's the Real Context Size of Your Long-Context Language Models?" COLM 2024. [arxiv.org/abs/2404.06654](https://arxiv.org/abs/2404.06654)
**Citation:** arXiv 2510.05381, "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval"

### Attention Dilution Is Structural

Performance degradation has two root causes: (1) positional biases from RoPE and attention sinks, and (2) attention dilution — as context grows, the fixed attention budget distributes across more tokens, reducing focus on any single token. This is a mechanical property of fixed-capacity Transformers, not a tuning problem. You cannot fully compensate with prompting alone — architectural solutions (RAG, chunking, summarization chains) are more reliable than hoping a model can focus on needles in very long haystacks.

### Multi-Needle Retrieval at Scale

Among frontier models (2025–2026 data), Claude models lead on multi-needle retrieval quality per token at extreme context lengths. Gemini offers the largest windows but retrieval precision degrades significantly at maximum length. Models that extended context via simple position embedding scaling (rather than targeted long-context training) show the widest gap between advertised and practical limits.

**Takeaway:** Model selection for long-context tasks should be based on benchmark performance at your actual working length, not advertised window size.

---

## RAG Patterns

### Chunking Strategies

No single strategy dominates — the best approach is document-type-dependent, with up to 9% recall variance across methods.

**What works:**
- **Page-level chunking** is the most consistent baseline (highest accuracy with lowest variance across NVIDIA's 5-dataset financial benchmark)
- **Token-based chunking** at 512–1024 tokens is the right default for most document types. 128-token chunks were worst performers across the board
- **Semantic/adaptive chunking** achieved 87% full accuracy vs. 50% for fixed-size in a peer-reviewed clinical study (Cohen's d = 1.03, p = 0.001) but at higher compute cost
- **Parent-child chunking** is the practical compromise for structured documents: child chunks (100–500 tokens) drive retrieval, parent chunks (500–2000 tokens) provide context
- **Sentence window retrieval** (index at sentence level, expand to surrounding window at retrieval time) showed statistically significant improvement: +0.1021 mean precision (p < 0.001) in the ARAGOG study

**Citation:** NVIDIA, "Finding the Best Chunking Strategy for Accurate AI Responses," 2024. [developer.nvidia.com](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/)
**Citation:** Eibich et al., "ARAGOG: Advanced RAG Output Grading," 2024. [arxiv.org/html/2404.01037](https://arxiv.org/html/2404.01037)

### Embedding Models

MTEB overall scores don't fully predict RAG retrieval quality — retrieval-specific subtask scores are more predictive. The leaderboard moves fast; check [huggingface.co/spaces/mteb/leaderboard](https://huggingface.co/spaces/mteb/leaderboard) for current rankings.

Key principles that hold regardless of which model is on top:
- Domain mismatch degrades all models — always evaluate on your actual corpus
- A cheaper embedding model that's only 2–3 MTEB points lower may be the right tradeoff at scale
- Open-source embeddings (Qwen3, NV-Embed families) now rival proprietary options
- Multimodal embeddings (text + images in same vector space) are production-ready from some providers

**Citation:** [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — Hugging Face

### Hybrid Search (Vector + BM25)

Hybrid search provides +26–31% NDCG on high-vocabulary-mismatch domains (BEIR) but only +1.7% on lexically-dense domains like e-commerce.

**When BM25 hybrid is critical:** queries containing exact identifiers, code snippets, API names, error codes, product SKUs, legal clause references — cases where semantic embedding actively fails.

**Default configuration:** Reciprocal Rank Fusion (RRF) with k=60 requires no tuning. Only tune the alpha weighting parameter once you have 50+ labeled query pairs.

**Warning:** Poorly configured hybrid search with untuned fusion weights can underperform dense-only baseline.

**Citation:** Prem AI, "Hybrid Search for RAG." [blog.premai.io](https://blog.premai.io/hybrid-search-for-rag-bm25-splade-and-vector-search-combined/)
**Citation:** Redis, "Full-text search for RAG apps." [redis.io](https://redis.io/blog/full-text-search-for-rag-the-precision-layer/)

### Re-ranking

Cross-encoder reranking provides 10–25% additional precision over bi-encoder retrieval alone, but results are task-dependent.

**Surprising finding:** In the ARAGOG controlled study, Cohere Rerank and MMR showed no significant improvement over naive RAG (p > 0.3). LLM-based reranking *hurt* performance (-0.0514 precision). But sentence window retrieval with reranking showed the biggest gains.

**Latency profile:**
- Cross-encoders: 200ms–2s (right for real-time RAG)
- Pointwise LLM rerankers: 1–3s
- Listwise LLM rerankers: >5s

**Production pattern:** Retrieve 50–100 → rerank with cross-encoder (ms-marco-MiniLM variants are free and fast) → pass top 10 to LLM. This can reduce costs ~72% by pre-filtering irrelevant context.

**Citation:** Eibich et al., "ARAGOG," 2024. [arxiv.org/html/2404.01037](https://arxiv.org/html/2404.01037)

### RAG Failure Modes

The dominant failure is not the LLM hallucinating from nothing — it's the retriever returning plausibly relevant but actually unhelpful chunks, which the LLM then synthesizes incorrectly. LlamaIndex identifies 13 named failure modes:

1. **Retrieval Hallucination** — chunks look superficially relevant but don't contain the answer
2. **Wrong Chunk Selection** — critical context split across chunks, no single chunk complete
3. **Index Fragmentation** — duplicate/outdated documents cause contradictory retrieval
4. **Context Window Overflow** — too many chunks dilute signal
5. **Config Drift** — embedding model mismatch between index time and query time (silent, invisible in logs)
6. **"Hallucinated bridges"** — LLM inserts unsupported connective statements between evidence fragments; citations don't prevent this
7. **Corpus poisoning** — corrupting just 0.04% of a corpus achieves 98.2% attack success rate (BadRAG)

**Citation:** LlamaIndex, "RAG Failure Mode Checklist." [developers.llamaindex.ai](https://developers.llamaindex.ai/python/framework/optimizing/rag_failure_mode_checklist/)

### Advanced RAG Patterns (Evidence-Based Assessment)

| Pattern | When It Helps | When It Hurts |
|---|---|---|
| **Query decomposition** | Multi-hop QA (288% improvement on PopQA) | Generic queries — ARAGOG found multi-query underperformed naive RAG |
| **HyDE** | Ambiguous/conceptual queries | Factoid queries — ARAGOG: -0.0648 precision vs. naive RAG (p < 0.001) |
| **Iterative/adaptive retrieval** | Most robust gains — Self-CRAG: +0.456 FactScore | Adds latency; requires confidence thresholds |
| **Parent-child chunking** | Structured documents | Simple flat text |

**Highest-ROI advanced pattern:** Iterative retrieval with a confidence gate. If first retrieval yields low-similarity results, rewrite the query and retrieve again rather than returning low-quality context.

---

## Compression Techniques

### LLMLingua (Microsoft Research)

Uses a small proxy model to score token importance via perplexity, then removes low-value tokens in two stages: whole-sentence first, then per-token.

- **GSM8K/BBH reasoning:** only 1.5% accuracy drop at 20x compression
- **Latency improvement:** 1.7x–5.7x
- **LLMLingua-2 (ACL 2024):** BERT-level encoder via distillation — 3x–6x faster with better out-of-domain generalization

**Critical finding:** Extractive reranker compression gave +7.89 F1 on 2WikiMultihopQA at 4.5x compression, while abstractive compression at similar ratios *decreased* F1 by 4.69. For fact-retrieval tasks, extractive beats abstractive.

**Citation:** Microsoft Research, "LLMLingua." [microsoft.com](https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/)
**Citation:** LLMLingua-2, ACL 2024. [aclanthology.org/2024.acl-long.91](https://aclanthology.org/2024.acl-long.91/)

### MapReduce Summarization

Split document into chunks → summarize each independently (map) → combine summaries (reduce). Map step is fully parallelizable.

**Tradeoff:** Cross-chunk connections are lost. A fact in chunk 1 that contradicts chunk 8 won't be caught. For single coherent documents (legal contracts), the "Refine" pattern (sequential, each step builds on previous) is more accurate but not parallelizable. MapReduce works for independent document collections.

### Sliding Window

Keeps last *k* turns or *n* tokens, discards everything older. Zero implementation cost.

**Failure mode:** Abrupt context loss — early constraints/goals vanish completely at cutoff. JetBrains found a rolling window of ~10 turns works well *when paired with observation masking* (replacing raw tool outputs with placeholders). Pure sliding window without masking/summarization fails for long-horizon tasks.

### When Compression Hurts

- **Governance-sensitive content:** Lossy abstractive compression permanently destroys information (a column's sensitivity classification, a specific function signature). Once gone, it cannot be recovered by prompting.
- **Iterative agent workflows:** Over-aggressive compression forces agents to re-fetch artifacts they already retrieved, creating extra inference calls that outweigh token savings (Factory.ai).
- **Failure signal preservation:** Summarization obscures natural failure signals that would otherwise cause agents to stop, leading to 13–15% longer (wasted) trajectories (JetBrains).

**Recommendation:** Preserve "breadcrumbs" (file paths, function names, timestamps) even when compressing prose — low-token-cost anchors that allow context reconstruction without full re-retrieval.

**Citation:** Factory.ai, "Compressing Context." [factory.ai](https://factory.ai/news/compressing-context)
**Citation:** JetBrains Research, "Cutting Through the Noise." [blog.jetbrains.com](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)

---

## Token Budgeting

### Recommended Allocation

| Section | % of Window | Notes |
|---|---|---|
| System instructions | 10–15% | Bloating causes models to *ignore* instructions, not follow more. Anthropic's own guidance: "If Claude keeps doing something despite having a rule against it, the file is probably too long." |
| Tool definitions | 15–20% | Often underestimated — 50-tool schemas can consume 10,000+ tokens |
| Knowledge context (RAG) | 30–40% | Primary content payload. For factual QA, push toward 60% and shrink history to 10% |
| Conversation history | 20–30% | Scales with task complexity; coding agents need more than chatbots |
| Output buffer reserve | 10–15% | Must be pre-allocated; running out mid-generation causes truncated responses |

### The 60–80% Utilization Rule

Optimal context utilization is 60–80%. Below 60% is over-provisioning. Above 80% risks mid-task overflow. "Perpetual edge-of-limit" operation (always near max) empirically degrades response quality (Factory.ai).

### Placement Matters as Much as Allocation

The same tokens in a different order produce dramatically different results. High-priority facts should appear at the beginning of the system prompt or the very end of conversation. RAG results injected mid-conversation are at higher risk of being "forgotten."

### The 100:1 Economics

Production input-to-output ratio is approximately 100:1, meaning context costs dominate. Prompt caching and compression target the right side of the cost equation.

**Citation:** Maxim AI, "Context Engineering for AI Agents: Token Economics." [getmaxim.ai](https://www.getmaxim.ai/articles/context-engineering-for-ai-agents-production-optimization-strategies/)

---

## Caching

### Anthropic Prompt Caching

Mark content blocks with `"cache_control": {"type": "ephemeral"}`. Anthropic hashes all content up to and including that block. On subsequent requests with identical prefixes, cached KV tensors are reused.

**Pricing structure (check current docs for exact numbers):**
- Cache write: 1.25x base input cost (5-min TTL) or 2x (1-hour TTL)
- Cache read: 0.1x base input cost (90% savings)
- 5-min TTL resets on each hit — active conversations maintain cache indefinitely

**Constraints:**
- Minimum token thresholds vary by model (1024–4096 tokens)
- Up to 4 explicit breakpoints per request
- Known invalidation triggers: changing `tool_choice`, toggling web search/citations, modifying thinking parameters

**Cache-friendly design principle:** Place all static content (system instructions, tool schemas, reference docs, few-shot examples) *before* any dynamic content. A timestamp or session ID at the top of a system prompt invalidates the cache on every request.

**Production savings:** Thomson Reuters Labs: 60% cost reduction. YUV.AI: 70% cost reduction.

**Citation:** Anthropic, "Prompt caching." [platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

### OpenAI Automatic Prefix Caching

Automatically enabled for prompts 1,024+ tokens. No code changes or cache markers needed.

| Feature | Anthropic | OpenAI |
|---|---|---|
| Control | Explicit breakpoints | Automatic |
| Read discount | 90% | 50% |
| Write premium | 25–100% | None |
| Manual control | Yes (4 breakpoints) | No |
| TTL | 5 min or 1 hour | 5–10 min |

OpenAI's approach is simpler (zero config) but less powerful (half the savings, no manual control). For self-hosted deployments, vLLM's Automatic Prefix Caching brings the same mechanism to GPU VRAM with SSD offload for 24-hour retention.

**Citation:** PromptHub, "Prompt Caching with OpenAI, Anthropic, and Google Models." [prompthub.us](https://www.prompthub.us/blog/prompt-caching-with-openai-anthropic-and-google-models)

---

## Multi-Turn Context Management

### Strategy Comparison

| Approach | Cost Reduction | Quality Impact | Best For |
|---|---|---|---|
| **Observation masking** | 52% | +2.6% solve rate | Agent tool-use loops |
| **LLM summarization** | 50%+ | Agents run 13–15% longer (waste) | Selected high-value segments only |
| **Sliding window** | Variable | Abrupt loss of early context | Short-horizon chat |
| **Compaction** (summarize + restart) | High | Preserves key decisions if done well | Long coding sessions |

### Observation Masking (Recommended for Agents)

Replace older tool outputs with placeholders (`[observation truncated]`) while keeping action history and reasoning intact. Maintain a rolling window of ~10 turns. JetBrains found this outperforms LLM summarization because it preserves failure signals that summaries obscure.

### Anthropic's Three-Level Compaction

From Anthropic's context engineering post, escalating approaches:

1. **Clear tool outputs after use** — "the safest lightest touch." Agents rarely need raw tool results from earlier calls
2. **Structured note-taking** — agents maintain persistent memory files outside the context window for multi-hour coherence
3. **Sub-agent architectures** — specialized agents handle subtasks and return 1,000–2,000 token summaries rather than full exploration context

Core principle: "Find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."

### Factory.ai's Two-Threshold System

- **T_max:** compression trigger threshold
- **T_retained:** post-compression target
- Gap between them controls frequency-vs-preservation tradeoff
- Anchored summaries tied to specific messages, updated only when old messages are truncated (not re-summarized from scratch every request)
- Preserve: session intent, artifact trails, breadcrumbs (file paths, function names, commit hashes)
- Discard: redundant tool outputs, duplicate messages, superseded reasoning

**Citation:** Anthropic, "Effective context engineering for AI agents." [anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
**Citation:** JetBrains Research, "Cutting Through the Noise." [blog.jetbrains.com](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)

---

## Tool Results and Context Pollution

### The Problem

Every token of raw tool output is carried forward to every subsequent LLM call, compounding cost and degrading focus. A single `ls` on a large directory dumps thousands of lines into context. The "infinite exploration" antipattern (asking an agent to "investigate" without scope) fills context with irrelevant content.

### Prevention Strategies

1. **Truncation at the call site** — tools with offset/limit parameters, capped output length, structured excerpts rather than raw content
2. **Programmatic tool calling** — execute tools in a code environment and return only results, reducing context impact vs. full raw tool responses
3. **Selective inclusion** — agents ask tools to pre-filter and return only what's relevant
4. **Post-use clearing** — remove raw tool output from context once the model has extracted what it needs (Anthropic's recommended "safest lightest touch")
5. **Sub-agent delegation** — send exploration tasks to sub-agents that return summaries, keeping the main context clean

### Compaction Best Practices

What to preserve: architectural decisions, unresolved bugs, implementation details, recent file/resource access records.
What to discard: redundant tool outputs, duplicate messages, superseded reasoning.

Principle: "Recall first, then precision" — the initial compaction pass should keep too much rather than too little. Over-aggressive compaction forces re-work.

**Citation:** Anthropic, "Best Practices for Claude Code." [code.claude.com](https://code.claude.com/docs/en/best-practices)
**Citation:** Anthropic, "Introducing advanced tool use." [anthropic.com](https://www.anthropic.com/engineering/advanced-tool-use)

---

## Common Mistakes

1. **Trusting advertised context length.** Most models' effective reasoning window is 50–65% of claimed length for complex tasks. Benchmark at your actual working length.

2. **Putting critical information in the middle.** The U-shaped attention curve means middle content suffers 20–30% accuracy loss. Place key content at the beginning or end.

3. **Context stuffing instead of retrieval precision.** Passing raw top-k results to the LLM hurts more than helps. Always rerank and filter.

4. **Bloating system prompts.** Models ignore instructions in long system prompts, not follow more of them. Anthropic: "If Claude keeps doing something despite having a rule, the file is probably too long."

5. **Invalidating caches with dynamic content.** A timestamp at the top of a system prompt invalidates the entire cache. Static content must come before dynamic content.

6. **Using abstractive compression for fact-retrieval tasks.** Extractive compression gives +7.89 F1; abstractive *decreases* F1 by 4.69 at similar ratios.

7. **Applying HyDE/query decomposition universally.** HyDE hurts factoid queries (ARAGOG: -0.065 precision vs. naive). Query decomposition helps multi-hop but hurts simple queries.

8. **Ignoring embedding model version drift.** If the embedding model at query time differs from index time, retrieval breaks silently with no log errors.

9. **Over-aggressive compression in agent loops.** Forces re-fetching of already-retrieved artifacts, creating more inference calls than the compression saved.

10. **Summarizing instead of masking tool outputs.** Summaries obscure failure signals, causing agents to run 13–15% longer. Observation masking with breadcrumb preservation is cheaper and higher quality.

---

## Notable Sources

### Papers

| Paper | Authors | Year | Key Contribution |
|---|---|---|---|
| [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) | Liu et al. (Stanford/Berkeley) | 2024 | U-shaped context recall; middle content degradation |
| [RULER](https://arxiv.org/abs/2404.06654) | Hsieh et al. (NVIDIA) | 2024 | 13-task benchmark exposing gap between claimed and effective context |
| [Context Length Alone Hurts](https://arxiv.org/html/2510.05381v1) | arXiv | 2025 | Even perfect retrieval doesn't prevent reasoning degradation |
| [ARAGOG](https://arxiv.org/html/2404.01037) | Eibich et al. | 2024 | Controlled comparison of 7 RAG techniques with p-values |
| [LLMLingua-2](https://aclanthology.org/2024.acl-long.91/) | Microsoft Research | 2024 | Task-agnostic prompt compression via distillation |
| [RAG Comprehensive Survey](https://arxiv.org/html/2506.00054v1) | arXiv | 2025 | FILCO, Self-CRAG, query decomposition benchmarks |
| [Positional Biases Shift](https://arxiv.org/html/2508.07479) | arXiv | 2025 | 50% fill rate threshold for primacy/recency inversion |
| [Serial Position Effects](https://arxiv.org/html/2406.15981v1) | arXiv | 2024 | Primacy/recency quantified across 13 models |
| [LLMs Get Lost in Multi-Turn](https://arxiv.org/pdf/2505.06120) | arXiv | 2025 | Multi-turn context degradation mechanisms |

### Provider Documentation

- [Anthropic — Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic — Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
- [Anthropic — Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic — Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic — Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [LlamaIndex — RAG Failure Mode Checklist](https://developers.llamaindex.ai/python/framework/optimizing/rag_failure_mode_checklist/)
- [LangChain — MapReduce Summarization](https://python.langchain.com/docs/how_to/summarize_map_reduce/)
- [vLLM — Automatic Prefix Caching](https://docs.vllm.ai/en/stable/design/prefix_caching/)

### Practitioner Reports

- [JetBrains Research — Smarter Context Management for Agents](https://blog.jetbrains.com/research/2025/12/efficient-context-management/) — Observation masking vs. summarization comparison
- [Factory.ai — Compressing Context](https://factory.ai/news/compressing-context) — Two-threshold system, breadcrumb preservation
- [NVIDIA — Best Chunking Strategy](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) — Controlled benchmark across 5 financial datasets
- [Maxim AI — Token Economics](https://www.getmaxim.ai/articles/context-engineering-for-ai-agents-production-optimization-strategies/) — Budget allocation ratios
- [Thomson Reuters Labs — Prompt Caching Cost Reduction](https://medium.com/tr-labs-ml-engineering-blog/prompt-caching-the-secret-to-60-cost-reduction-in-llm-applications-6c792a0ac29b) — 60% cost reduction case study
- [PromptHub — Cross-Provider Caching Comparison](https://www.prompthub.us/blog/prompt-caching-with-openai-anthropic-and-google-models)
- [Prem AI — Hybrid Search for RAG](https://blog.premai.io/hybrid-search-for-rag-bm25-splade-and-vector-search-combined/) — BEIR benchmark results
- [Redis — BM25 for RAG](https://redis.io/blog/full-text-search-for-rag-the-precision-layer/) — Query type taxonomy for hybrid search
- [Superlinked — Optimizing RAG with Hybrid Search](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)
