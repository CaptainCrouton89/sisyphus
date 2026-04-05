# Tool Design for LLM Agents — Research Findings

Research compiled April 2025. Sources: academic papers, vendor documentation, practitioner reports.

---

## Key Findings

1. **Description quality is the single highest-leverage lever.** Anthropic's internal testing showed that precise refinements to tool descriptions "dramatically reduced error rates" on SWE-bench Verified. OpenAI's o3/o4-mini guide found placing critical constraints first in descriptions improved accuracy by 6%.

2. **Tool design is prompt engineering.** Tools are injected into the system prompt as structured text. The model doesn't "understand" tools differently from instructions — it parses names, descriptions, and schemas as context. Design accordingly.

3. **Fewer, more capable tools outperform many narrow ones.** Both Anthropic and practitioners confirm that excessive tools increase selection ambiguity and consume context. Anthropic: "More tools don't always lead to better outcomes." OpenAI considers <100 tools and <20 args per tool "in-distribution."

4. **Structured JSON tool calling imposes a measurable accuracy tax.** The Natural Language Tools paper (2025) found restrictive output schemas reduce accuracy by up to 27.3 percentage points on some benchmarks. Format constraints compete with reasoning for model capacity.

5. **Error messages that suggest corrections enable recovery; opaque errors cause loops.** MCP spec explicitly distinguishes "tool execution errors" (actionable, should be shown to models) from "protocol errors" (structural, less recoverable).

6. **Semantic identifiers beat opaque IDs.** Anthropic found that resolving UUIDs to human-readable names "significantly improves Claude's precision in retrieval tasks."

7. **Input examples improve complex parameter handling from 72% to 90% accuracy** (Anthropic internal testing on complex parameter correlations).

---

## Tool Selection Mechanics

### How Models Choose Tools

Models select tools based on signals parsed from the system prompt injection. Priority order (empirical, not documented as such):

1. **Tool name** — first signal scanned; semantic names aid selection. Valid patterns: `get_weather`, `github_list_prs`, `search_logs`. MCP spec: names SHOULD match `[a-zA-Z0-9_-.]` and be 1-128 chars.
2. **Description text** — primary disambiguation mechanism. Models match user intent against description semantics. Front-loaded information matters more (recency bias in attention).
3. **Parameter schema** — helps confirm selection and construct the call. Required vs optional fields signal what the tool actually needs.
4. **Context from prior turns** — tool results, errors, and conversation history inform subsequent selection.

### Disambiguation Behavior

When descriptions overlap, models exhibit uncertainty — they may call the wrong tool, hesitate, or attempt to use both. Anthropic: "If multiple tools have overlapping purposes or vague descriptions, models may call the wrong one or hesitate to call any at all."

### Tool Count vs. Accuracy

- **<10 tools**: Reliable selection across models
- **10-100 tools**: Performance depends on description quality and schema clarity. OpenAI considers this "in-distribution" for o3/o4-mini as of May 2025.
- **100+ tools**: Requires mitigation strategies (tool search, deferred loading, routing). Anthropic's `defer_loading` / Tool Search Tool addresses this — deferred tools aren't loaded into context initially.
- **At scale**: A 2025 study found accuracy degrades by 85-91% as catalog size approaches 128K tokens.
- **BFCL benchmark average**: Only 3 function choices per test, so large-toolset behavior is under-explored in benchmarks.

### Key Citations
- Gorilla (Patil et al., 2023, NeurIPS 2024): Finetuned LLaMA surpassed GPT-4 on API call generation. APIBench: 94 TorchHub + 696 TensorHub + 925 HuggingFace APIs. Retriever-Aware Training (RAT) enables adaptation to documentation changes.
- BFCL (Berkeley Function Calling Leaderboard, v4): AST-based evaluation across serial/parallel function calls, multiple languages. Top models ace one-shot but "still stumble when they must remember context, manage long conversations, or decide when not to act."
- API-Bank (Li et al., 2023, EMNLP): 73 API tools, 314 dialogues, 753 API calls. Error distribution: No API Call 36.8%, False Format 23.7%, API Hallucination 15.9%, Invalid Parameters 8.0%, Missing Parameters 1.2%.

---

## Description Best Practices

### Core Principles

**Write descriptions as if onboarding a new hire.** Anthropic's official guidance: "Describe your tool to a new hire on your team" — make implicit context explicit.

**Aim for 3-4 sentences minimum**, more for complex tools. Include:
- What the tool does
- When it should be used (and when it shouldn't)
- What each parameter means and how it affects behavior
- Important caveats or limitations
- What information the tool does NOT return

### Structure

**Front-load critical constraints.** OpenAI o3/o4-mini guide: a ripgrep tool description that listed escaping requirements upfront scored 6% higher than versions burying this in background context.

**Pattern:**
```
[Primary purpose — one sentence]
[When to use / when NOT to use]
[Key constraints and prerequisites]
[Format requirements or special syntax]
```

**Example (good):**
```
"Retrieves the current stock price for a given ticker symbol. The ticker
symbol must be a valid symbol for a publicly traded company on a major US
stock exchange like NYSE or NASDAQ. The tool will return the latest trade
price in USD. It should be used when the user asks about the current or
most recent price of a specific stock. It will not provide any other
information about the stock or company."
```

**Example (bad):**
```
"Gets the stock price for a ticker."
```

### Negative Examples and Boundaries

Use explicit exclusions when tool purposes could overlap:
- "It will not provide historical price data or company financials."
- "Only invoke this if the target directory exists."
- "Do NOT promise future function calls; emit them now or respond normally." (OpenAI)

### Semantic Naming

Use `name`, `image_url`, `file_type` over `uuid`, `256px_image_url`, `mime_type`. Anthropic found semantic identifiers "significantly improve precision in retrieval tasks."

### Namespacing

Prefix with service name when tools span multiple services: `github_list_prs`, `slack_send_message`, `asana_search`. This becomes essential at scale and when using tool search.

Namespacing choice (service-based vs resource-based) has "non-trivial effects on tool-use evaluations" — test with your specific setup.

---

## Parameter Design

### Naming

- Use unambiguous names: `user_id` not `user`, `departure_date` not `date`
- Descriptive names reduce hallucination; terse names increase ambiguity
- No empirical evidence favoring camelCase vs snake_case — match your API convention

### Types and Constraints

**Enums over free-text when the domain is closed.** Enums constrain the model to valid values and eliminate hallucination for that parameter. Example: `"unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}`.

**Free-text when the domain is open.** Don't enumerate what can't be enumerated. Location names, search queries, file paths = free-text with descriptive examples.

**Required vs Optional:**
- Mark truly required params as `required`; don't make everything required
- Models handle optional params with good defaults well
- Anthropic's `input_examples` feature helps show when optional params should be included (e.g., "critical bugs have full contact info with escalation settings; feature requests have reporter info but no escalation")
- OpenAI strict mode: all fields must be `required`, optional fields use `"type": ["string", "null"]`

### Schema Patterns

**Prefer flat schemas.** OpenAI o3/o4-mini guide: "Deeply nested parameters encourage the model to omit fields or misuse arguments." Nesting is appropriate for naturally hierarchical data (config objects, filter trees), but flat schemas reduce parsing errors.

**Pagination, filtering, truncation with sensible defaults.** Implement these as optional params. Claude Code restricts tool responses to 25K tokens by default. Design tools to support narrowing results rather than dumping everything.

**Response format enum.** Anthropic recommends exposing a `format` parameter (detailed vs concise) so agents can fetch IDs for downstream calls while conserving tokens. Detailed: 206 tokens; concise: 72 tokens in their example.

### Strict Mode

Both Anthropic and OpenAI offer `strict: true` for tool schemas:
- Guarantees tool calls match the schema exactly
- OpenAI: requires `additionalProperties: false` on all objects, all fields in `required`
- Anthropic: available via tool definition property
- Recommended to always enable when available

### Input Examples

Anthropic's `input_examples` feature (beta, Nov 2025):
- Array of schema-valid example input objects
- Token cost: ~20-50 tokens for simple examples, ~100-200 for complex nested objects
- Improved complex parameter handling from 72% to 90% accuracy
- Not compatible with tool search (deferred loading)

---

## Error Handling

### Design Principles

MCP spec distinguishes two error categories:
1. **Tool execution errors** (`isError: true` in result) — actionable feedback about what went wrong. Models can self-correct. SHOULD be shown to models.
2. **Protocol errors** (JSON-RPC error codes) — structural issues. Less recoverable. MAY be shown to models.

### What Good Error Messages Include

From Anthropic's blog and practitioner consensus:
- **What went wrong** — specific, not opaque codes or tracebacks
- **What to try instead** — suggest targeted searches, narrower filters, correct format
- **Which parameter was wrong** — name the field and show the expected format
- **Example of correct input** — when format is non-obvious

**Example (good):**
```
"Invalid departure date: must be in the future. Current date is 08/08/2025."
```

**Example (bad):**
```
"Error: invalid parameter"
```

### Self-Correction Patterns

- Models can recover from clear errors by adjusting parameters and retrying
- Recovery rate drops sharply with opaque errors — models repeat the same mistake
- The "infinite loop" failure mode: model retries the exact same call after unhelpful error messages
- Mitigation: include retry budget in tool description, suggest alternative approaches in errors
- Steer toward token-efficient recovery: "Use filters to narrow results instead of fetching all data"

### Semantic vs Syntactic Errors

Syntactic errors (wrong JSON format) are easily correctable with `strict: true`.
Semantic errors (valid call but wrong intent — hallucinated API, wrong tool for the task) require better descriptions and disambiguation, not better error messages.

API-Bank error distribution shows semantic errors (hallucination 15.9%, no API call 36.8%) far outweigh syntactic ones (false format 23.7%), suggesting description quality matters more than error handling for overall accuracy.

---

## Granularity Guidelines

### The Consolidation Principle

**Anthropic's official guidance: "Consolidate related operations into fewer tools."** Rather than `create_pr`, `review_pr`, `merge_pr` → use one tool with an `action` parameter.

**However, Anthropic's engineering blog takes the opposite view for domain-specific tools:** merge discrete operations into higher-level tools that match how humans think about tasks:
- Instead of `list_users` + `list_events` + `create_event` → `schedule_event` (finds availability + schedules)
- Instead of `read_logs` → `search_logs` (returns only relevant lines with context)
- Instead of `get_customer_by_id` + `list_transactions` + `list_notes` → `get_customer_context` (compiles recent/relevant info)

### Resolution: Two Types of Consolidation

1. **CRUD consolidation** (action parameter pattern): Group related CRUD operations under one tool name. Anthropic API docs recommend this. Reduces tool count, simplifies selection.

2. **Workflow consolidation** (composite tools): Merge multi-step workflows into single tools that do multiple API calls internally. Anthropic engineering blog recommends this. Reduces agent orchestration burden and context consumption.

Both reduce tool count but serve different purposes. CRUD consolidation simplifies the tool surface; workflow consolidation offloads reasoning to deterministic code.

### When to Split

- When a tool does genuinely unrelated things
- When the combined description becomes too long or confusing
- When different operations have incompatible parameter sets
- When the tool name can't clearly describe all operations

### When to Merge

- When operations share the same resource/entity
- When users naturally think of them as one task
- When intermediate results waste context (merge to eliminate them)
- When error handling is simpler as one atomic operation

### The "Action Parameter" Pattern

Anthropic docs recommend it for CRUD: `action: "create" | "read" | "update" | "delete"`.
Practitioner concerns: can create overly complex schemas where different actions need different parameters. Use conditional required fields or separate `input_schema` per action if possible.

### Tool Count Guidance

- "More tools don't always lead to better outcomes" (Anthropic)
- Each additional tool consumes context tokens and increases selection ambiguity
- Use tool search / deferred loading for large tool sets (100+)
- Test empirically — there's no universal "right number"

---

## MCP Patterns

### Architecture Overview

MCP (Model Context Protocol) is Anthropic's open protocol (Nov 2024) for standardizing tool serving. JSON-RPC 2.0 over stdio or HTTP transports.

**Three primitives:**
1. **Tools** — model-controlled functions the AI can invoke
2. **Resources** — structured data sources the AI can read
3. **Prompts** — parameterized prompt templates

### Tool Definition in MCP

```json
{
  "name": "get_weather",
  "title": "Weather Information Provider",
  "description": "Get current weather information for a location",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City name or zip code" }
    },
    "required": ["location"]
  },
  "outputSchema": { ... },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": true
  }
}
```

### Tool Annotations

MCP defines four behavioral hints:
- **readOnlyHint** (default: false) — does the tool modify its environment?
- **destructiveHint** (default: true) — are modifications destructive vs additive?
- **idempotentHint** (default: false) — safe to retry with same arguments?
- **openWorldHint** (default: true) — does it interact with external entities?

Primary use: clients decide whether to show confirmation prompts. These are untrusted hints unless the server is trusted.

### Structured Tool Outputs (Nov 2025 spec)

`outputSchema` allows tools to declare their return type. Enables:
- Schema validation of responses
- Type information for programming language integration
- Better client/LLM parsing of results
- Backward compatible: `structuredContent` + `content` (serialized JSON in TextContent)

### Server Design Patterns

1. **Single-purpose servers** — each server has one clear purpose (recommended)
2. **SaaS wrappers** — expose platform APIs (Slack, GitHub) as MCP tools
3. **Prompt library servers** — publish parameterized prompt templates
4. **Tool catalog servers** — "adapter hub" aggregating tools from multiple sources

### MCP vs Direct Integration

Use MCP when:
- Tools need to be shared across multiple clients/hosts
- Tool discovery should be dynamic
- You want standardized auth, transport, and capability negotiation
- The ecosystem of MCP servers already covers your needs

Use direct integration when:
- You control both the model and the tools
- Latency is critical (MCP adds a protocol layer)
- You need features not yet in the MCP spec

### Practical Considerations

- **Transports**: stdio (local, fast) and streamable HTTP (remote, needs auth). Support both for compatibility.
- **Tool response format**: XML, JSON, or Markdown can all work. "Tool response structure can have an impact on evaluation performance" — test formats against your evaluation.
- **November 2025 spec additions**: Tasks (async long-running work), OAuth-based auth, elicitation (server-initiated user prompts), MCP Registry for server discovery.

---

## Tool Composition

### Output-as-Input Patterns

Design tool outputs to feed naturally into other tool inputs:
- Return both human-readable names AND machine-usable IDs: `search_user(name='jane')` returns `{id: 12345, name: "Jane Smith"}` so subsequent calls can use `send_message(user_id=12345)`
- Use consistent identifier types across tools — if one tool returns a `project_id`, other tools should accept `project_id`

### Pagination

Expose pagination as optional parameters with sensible defaults:
- `cursor` or `offset`/`limit` params
- Default page size that fits comfortably in context
- Include `has_more` / `next_cursor` in results
- MCP supports pagination natively via cursor-based `tools/list`

### Prerequisite Chains

When tools must be called in sequence (auth → list → detail), make this explicit:
- Document prerequisites in the description: "Requires a valid session from `authenticate` tool"
- Return errors that name the prerequisite: "No active session. Call `authenticate` first."
- Consider combining into a single tool if the chain is always the same

### Enrichment Pattern

Tools can add contextual metadata to reduce follow-up calls:
- `get_customer_context` returns recent transactions, open tickets, and contact info in one call
- Eliminates multi-step orchestration for common workflows
- Trade-off: larger responses consume more context

### Result Formatting

- **Truncation guidance**: When limiting response size, include a message like "Results truncated. Use narrower filters to see more."
- **Token consciousness**: Detailed response = ~206 tokens; concise = ~72 tokens (Anthropic example). Let agents choose.
- **Format matching**: LLMs perform better with formats matching training data distribution

---

## Benchmarks

### Gorilla / APIBench (Patil et al., 2023)

- **What**: LLM fine-tuned for API call generation
- **Dataset**: 94 TorchHub + 696 TensorHub + 925 HuggingFace APIs
- **Key finding**: Retriever-Aware Training enables adaptation to doc changes; finetuned 7B model surpassed GPT-4
- **Design insight**: Retrieval-augmented tool selection works — models don't need to memorize all APIs
- **Paper**: https://arxiv.org/abs/2305.15334

### Berkeley Function Calling Leaderboard (BFCL v4)

- **What**: Comprehensive function calling evaluation across real-world settings
- **Method**: AST-based evaluation, serial/parallel calls, multiple languages
- **Key finding**: Models ace one-shot selection but struggle with multi-turn context management and knowing when NOT to act
- **Design insight**: Tool design must account for multi-turn scenarios and "no tool needed" cases
- **URL**: https://gorilla.cs.berkeley.edu/leaderboard.html
- **Paper**: https://openreview.net/forum?id=2GmDdhBdDk (ICML 2025)

### ToolBench / ToolLLM (Qin et al., 2023)

- **What**: Instruction-tuning dataset and evaluation for tool use
- **Dataset**: 3,451 tools, 16,464 real-world APIs from RapidAPI, 49 categories
- **Method**: DFSDT reasoning (depth-first search in decision tree), ToolEval (LLM-based evaluation)
- **Key finding**: ToolLLaMA generalizes to unseen APIs, comparable to ChatGPT
- **Design insight**: Real-world API diversity is critical; synthetic/simplified APIs don't capture real complexity
- **Paper**: https://arxiv.org/abs/2307.16789 (ICLR 2024 spotlight)

### API-Bank (Li et al., 2023)

- **What**: Comprehensive benchmark for tool-augmented LLMs
- **Dataset**: 73 API tools, 314 dialogues, 753 API calls (eval); 2,138 APIs, 1,888 dialogues (train)
- **Key finding**: Error distribution in weaker models: No API Call 36.8% > False Format 23.7% > API Hallucination 15.9% > Invalid Params 8.0% > Missing Params 1.2%
- **Design insight**: The biggest failure mode is NOT calling a tool when one is needed, not calling the wrong one. Description clarity and "when to use" guidance are critical.
- **Paper**: https://arxiv.org/abs/2304.08244 (EMNLP 2023)

### ToolACE (ICLR 2025)

- **What**: Automated pipeline for function-calling training data synthesis
- **Dataset**: 26,507 diverse APIs, multiple formats (JSON, YAML, XML, Markdown)
- **Key finding**: 8B model trained on ToolACE data matches GPT-4 on BFCL
- **Design insight**: Format diversity matters — tools should work across description formats. Data quality > data quantity for training.
- **Paper**: https://arxiv.org/abs/2409.00920

### Natural Language Tools (2025)

- **What**: Framework replacing JSON tool calling with natural language outputs
- **Dataset**: 10 models, 6,400 trials across customer service and mental health domains
- **Key finding**: NLT improves accuracy by 18.4 percentage points, reduces output variance by 70%
- **Design insight**: Structured JSON calling imposes a cognitive tax on models. Consider whether strict structure is worth the accuracy cost for your use case.
- **Paper**: https://arxiv.org/abs/2510.14453

### Cross-Benchmark Insights

**Common failure modes across benchmarks:**
1. Not calling a tool when needed (most common — API-Bank: 36.8%)
2. Wrong output format (API-Bank: 23.7%)
3. Hallucinating non-existent tools/APIs (API-Bank: 15.9%)
4. Invalid parameters (API-Bank: 8.0%)
5. Multi-turn context loss (BFCL finding)

**Tool count vs accuracy:**
- Benchmarks typically test with small tool sets (BFCL average: 3 choices)
- Real-world large-toolset behavior is under-explored
- Accuracy degrades 85-91% at 128K token catalog sizes (2025 study)

**Schema complexity:**
- ToolACE found format diversity (JSON/YAML/XML/MD) matters for training
- Natural Language Tools found JSON constraints reduce accuracy by up to 27.3pp

---

## Notable Sources

### Vendor Documentation
- [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — the gold-standard practitioner guide. Covers tool consolidation, naming, error design, evaluation methodology, and agent-assisted optimization.
- [Anthropic: Implement Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — official API docs with best practices, input_examples, strict mode.
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) �� defer_loading, tool search, programmatic tool calling, allowed_callers.
- [OpenAI: Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) — strict mode, parallel calling, schema requirements.
- [OpenAI: o3/o4-mini Function Calling Guide](https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide) — front-loading constraints, flatten schemas, <100 tools guidance.
- [MCP Specification (Nov 2025)](https://modelcontextprotocol.io/specification/2025-11-25) — tool schema, annotations, error handling, structured outputs.
- [MCP Tool Annotations Blog](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) — readOnlyHint, destructiveHint, idempotentHint, openWorldHint semantics.

### Academic Papers
- Gorilla (Patil et al., 2023): https://arxiv.org/abs/2305.15334
- ToolLLM/ToolBench (Qin et al., 2023): https://arxiv.org/abs/2307.16789
- API-Bank (Li et al., 2023): https://arxiv.org/abs/2304.08244
- BFCL (Patil et al., 2025): https://openreview.net/forum?id=2GmDdhBdDk
- ToolACE (2025): https://arxiv.org/abs/2409.00920
- Natural Language Tools (2025): https://arxiv.org/abs/2510.14453
- StableToolBench (Guo et al., 2024): https://arxiv.org/abs/2403.07714

### Practitioner Resources
- [Martin Fowler: Function Calling Using LLMs](https://martinfowler.com/articles/function-call-LLM.html) — architectural overview
- [OpenAI Community: Prompting Best Practices for Tool Use](https://community.openai.com/t/prompting-best-practices-for-tool-use-function-calling/1123036) — practitioner tips
- [LLM Tool Calling in Production](https://medium.com/@komalbaparmar007/llm-tool-calling-in-production-rate-limits-retries-and-the-infinite-loop-failure-mode-you-must-2a1e2a1e84c8) — rate limits, retries, infinite loop failure mode
- [How Many Tools Can an Agent Have?](https://achan2013.medium.com/how-many-tools-functions-can-an-ai-agent-has-21e0a82b7847) — empirical limits on tool count
- [Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — broader agent design patterns

### Benchmark Leaderboards
- BFCL v4: https://gorilla.cs.berkeley.edu/leaderboard.html
- ToolBench GitHub: https://github.com/OpenBMB/ToolBench
- Gorilla GitHub: https://github.com/ShishirPatil/gorilla
