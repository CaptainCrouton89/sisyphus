# Cycle 1

**Status:** completed  |  **Duration:** 6m 25s
**Started:** Apr 4, 14:31:50
**Completed:** Apr 4, 14:38:12
**Mode:** planning
**Claude Session:** 047768bb-c14f-4de6-b7ba-b7e7607a529d


---


## Agents

### agent-001 — research-orchestration
- **Status:** completed  |  **Duration:** 17m 30s
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **Multi-Agent Orchestration for LLMs**

This research will be used to write an authoring skill (instructional reference material for prompt engineers building multi-agent systems). Focus on practical, evidence-backed knowledge.

## What to research

1. **Orchestration patterns**: hub-and-spoke, pipeline, debate/critic, hierarchical delegation. What works in production?
2. **Agent communication**: how agents share context, hand off work, resolve conflicts. Message passing vs shared state.
3. **Failure modes**: cascading errors, context pollution between agents, coordination overhead, agents fighting each other.
4. **Practical frameworks**: LangGraph, CrewAI, AutoGen, Anthropic's multi-agent patterns, OpenAI Swarm. What design decisions did they make and why?
5. **Prompt design for orchestrators vs workers**: how system prompts differ for coordinator agents vs task agents.
6. **Scaling considerations**: when to use multi-agent vs single agent, diminishing returns, cost/latency tradeoffs.

## Sources to find
- Academic papers (arXiv, Semantic Scholar)
- Anthropic's documentation and blog posts on multi-agent patterns
- OpenAI cookbook / blog posts
- Practitioner blog posts (Simon Willison, Swyx, etc.)
- Twitter/X threads from AI engineers
- Reddit r/LocalLLaMA, r/MachineLearning, r/ClaudeAI discussions
- Hacker News discussions

## Output
Save a structured research report to:
/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-multi-agent-orchestration.md

Structure: Key Findings → Patterns & Techniques (with citations) → Common Mistakes → Notable Sources (with URLs) → Code/Config Examples from real systems

**Latest report** (final, Apr 4, 14:54:33):**

Multi-agent orchestration achieves 81% performance gains on parallelizable tasks but requires stateless patterns to avoid coordination failures that cause 41-86.7% production failure rates.

### agent-002 — research-system-user
- **Status:** completed  |  **Duration:** 4m 25s
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **System Prompt vs User Prompt — Placement, Mechanics, and Best Practices**

This research will be used to write an authoring skill (instructional reference material for prompt engineers). Focus on evidence-backed knowledge about where instructions belong and why.

## What to research

1. **Mechanical differences**: how models treat system vs user content differently (attention patterns, positional encoding, instruction priority). Any papers or benchmarks measuring this.
2. **Prompt caching implications**: Anthropic's prompt caching, OpenAI's cached prompts — how placement affects cost and latency.
3. **Security/jailbreak angle**: system prompt as defense layer, user prompt injection attacks, how placement affects robustness.
4. **Multi-turn degradation**: "Lost in the Middle" (Liu et al. 2023) and related work on how instructions degrade over conversation length.
5. **Provider-specific behaviors**: differences between Anthropic, OpenAI, Google in how they handle system prompts.
6. **Practical guidelines**: what practitioners actually do — blog posts, threads about system prompt design.
7. **The "developer message" evolution**: OpenAI's shift from system→developer messages, what it means.

## Sources to find
- Academic papers: "Lost in the Middle", attention pattern studies, prompt injection research
- Anthropic docs on system prompts, prompt caching
- OpenAI docs on system/developer messages
- Practitioner blogs and Twitter/X threads
- Reddit/HN discussions on prompt placement strategies

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-system-vs-user-prompt.md

Structure: Key Findings → Mechanics & Evidence (with citations) → Practical Guidelines → Provider Differences → Common Mistakes → Notable Sources (with URLs)

**Latest report** (final, Apr 4, 14:41:37):**

Agent research on system vs user prompts completed: comprehensive analysis of mechanical differences, caching strategies, security implications, multi-turn degradation, and provider-specific implementations with academic citations.

### agent-003 — research-structured
- **Status:** completed  |  **Duration:** 10m 40s
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **Structured Output from LLMs — JSON, Schemas, and Constrained Generation**

This research will be used to write an authoring skill (instructional reference material for prompt engineers). Focus on practical, evidence-backed knowledge.

## What to research

1. **Constrained decoding**: how structured output actually works under the hood (grammar-guided generation, JSON mode, tool_use forcing). Papers and blog posts.
2. **Schema design for LLMs**: JSON Schema best practices specific to LLM output — what schema patterns models handle well vs poorly. Nested objects, enums, unions, arrays.
3. **Zod/Pydantic patterns**: using type systems to define and validate LLM output. Anthropic's tool_use, OpenAI's structured outputs, instructor library.
4. **Failure modes**: schema violations, partial outputs, hallucinated fields, type coercion issues. How to handle gracefully.
5. **Performance impact**: does forcing structured output affect quality? Any benchmarks comparing free-form vs constrained.
6. **Tool use as structured output**: using function calling / tool_use as a structured output mechanism even when you don't need tools.
7. **Streaming structured output**: partial JSON parsing, progressive validation.

## Sources to find
- Papers on constrained decoding (guidance, outlines, LMQL)
- Anthropic docs on tool_use and JSON output
- OpenAI structured outputs documentation and blog posts
- Jason Liu's instructor library and blog posts
- Practitioner threads on Twitter/X about structured output gotchas
- Reddit/HN discussions

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-structured-output.md

Structure: Key Findings → Techniques & Patterns (with citations) → Schema Design Guidelines → Failure Modes → Provider Comparison → Notable Sources (with URLs) → Code Examples

**Latest report** (final, Apr 4, 14:48:02):**

Researched constrained decoding across 5 agents; compiled 600-line guide covering schema design, provider constraints, failure modes, and streaming patterns with 27+ sources.

### agent-004 — research-context
- **Status:** completed  |  **Duration:** 24m 35s
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **Context Management for LLM Applications — Windows, Retrieval, and Compression**

This research will be used to write an authoring skill (instructional reference material for prompt engineers building LLM-powered tools). Focus on practical, evidence-backed knowledge.

## What to research

1. **Context window mechanics**: how models use context, attention patterns across window length, the "lost in the middle" phenomenon. Recent papers on long-context models.
2. **RAG (Retrieval-Augmented Generation)**: chunking strategies, embedding models, retrieval quality vs context stuffing. What actually works in production.
3. **Context compression**: summarization chains, sliding window approaches, recursive summarization. When compression helps vs hurts.
4. **Token budgeting**: how to allocate context window space between system prompt, conversation history, retrieved documents, and working memory.
5. **Caching strategies**: Anthropic prompt caching, conversation pruning, cache-friendly prompt design.
6. **Multi-turn context management**: conversation history pruning, rolling summaries, when to reset context.
7. **Tool results and context pollution**: managing context when tool calls return large amounts of data.

## Sources to find
- Papers: "Lost in the Middle" (Liu et al.), long-context benchmarks (RULER, Needle-in-Haystack), RAG papers
- Anthropic docs on context windows, prompt caching
- OpenAI docs on context management
- Blog posts from LlamaIndex, LangChain teams on RAG patterns
- Practitioner posts about context window management in production
- Twitter/X threads, Reddit/HN discussions

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-context-management.md

Structure: Key Findings → Context Window Mechanics (with citations) → RAG Patterns → Compression Techniques → Token Budgeting → Caching → Common Mistakes → Notable Sources (with URLs)

**Latest report** (final, Apr 4, 15:02:06):**

Research on context window management completed, covering mechanics, RAG patterns, compression, budgeting, caching, multi-turn handling, and tool results with evidence-based recommendations.

### agent-005 — research-tools
- **Status:** completed  |  **Duration:** 10m 10s
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **Tool Design for LLM Agents — Descriptions, Parameters, Schemas, and Composition**

This research will be used to write an authoring skill (instructional reference material for prompt engineers designing tool interfaces). Focus on practical, evidence-backed knowledge.

## What to research

1. **How models select tools**: what signals drive tool selection — description quality, parameter names, schema structure. Any papers or benchmarks on tool selection accuracy.
2. **Description writing**: best practices for tool descriptions that models parse correctly. Front-loading, disambiguation, negative examples.
3. **Parameter design**: naming conventions, enum vs free-text, required vs optional, nested objects. What schema patterns models handle well.
4. **Error message design**: how error messages affect model recovery. Structured errors vs string errors. Self-correction patterns.
5. **Tool granularity**: focused vs composite tools, the "action parameter" anti-pattern, when to merge vs split.
6. **MCP (Model Context Protocol)**: Anthropic's protocol for tool serving. Design patterns, adoption, practical considerations.
7. **Tool composition**: pagination, prerequisite chains, output-as-input patterns. How to design tools that work well together.
8. **Benchmarks**: ToolBench, API-Bank, Gorilla — what do they tell us about tool design?

## Sources to find
- Papers: ToolBench, Gorilla, API-Bank, tool-use benchmarks
- Anthropic MCP documentation and blog posts
- OpenAI function calling documentation and cookbook
- Practitioner blog posts on tool design
- Twitter/X threads from people building agent tool systems
- Reddit/HN discussions on function calling gotchas

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-tool-design.md

Structure: Key Findings → Tool Selection Mechanics (with citations) → Description Best Practices → Parameter Design → Error Handling → Granularity Guidelines → MCP Patterns → Benchmarks → Notable Sources (with URLs)

**Latest report** (final, Apr 4, 14:47:54):**

Completed comprehensive research document on LLM tool design covering 8 key areas: selection mechanics, descriptions, parameters, error handling, granularity, MCP patterns, composition, and benchmarks with 27 cited sources.

### agent-006 — research-eval
- **Status:** completed  |  **Duration:** 11m
- **Type:** sisyphus:research-lead

**Instruction:**

Research the topic: **Evaluation and Quality Gates for LLM Systems — Testing, Metrics, and Guardrails**

This research will be used to write an authoring skill (instructional reference material for prompt engineers building reliable LLM systems). Focus on practical, evidence-backed knowledge.

## What to research

1. **LLM-as-judge**: using models to evaluate model outputs. Calibration, bias, agreement with human evaluators. Papers and practical findings.
2. **Evaluation frameworks**: promptfoo, RAGAS, DeepEval, Braintrust, LangSmith. What design decisions did they make? What metrics do they compute?
3. **Quality gate patterns**: how to build automated quality gates in LLM pipelines — output validation, confidence thresholds, fallback strategies.
4. **Prompt regression testing**: how to detect when prompt changes break existing behavior. Snapshot testing, eval suites, CI integration.
5. **Metrics that matter**: accuracy, faithfulness, relevance, toxicity, format compliance. Which metrics are actually useful vs theater.
6. **Human evaluation**: when LLM-as-judge fails and you need humans. Annotation guidelines, inter-rater reliability.
7. **Production monitoring**: detecting drift, quality degradation over time, alerting on output quality.
8. **Guardrails and safety**: constitutional AI, output filtering, content moderation as quality gates.

## Sources to find
- Papers: LLM-as-judge (Zheng et al.), RAGAS, evaluation benchmarks
- Anthropic docs on evaluation, constitutional AI
- OpenAI evals framework and documentation
- Hamel Husain's blog posts on LLM evaluation
- Eugene Yan's writing on evaluation
- promptfoo documentation and blog
- Twitter/X threads from ML engineers on eval practices
- Reddit/HN discussions on LLM testing

## Output
Save to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-eval-quality-gates.md

Structure: Key Findings → LLM-as-Judge (with citations) → Evaluation Frameworks → Quality Gate Patterns → Regression Testing → Metrics Guide → Production Monitoring → Notable Sources (with URLs) → Code Examples

**Latest report** (final, Apr 4, 14:48:47):**

Comprehensive research on LLM evaluation frameworks, quality gates, and monitoring produced 926-line document covering 8 topics with citations, code examples, and practical patterns.



---


## Next Prompt

Research agents running. Review all 6 reports in context/research-*.md. Assess quality and citation depth. Then spawn writing agents to produce SKILL.md + reference.md for each skill. Format reference in context/format-reference.md. Existing output-variety and prompting-effectively skills in /Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/ are the style targets.

