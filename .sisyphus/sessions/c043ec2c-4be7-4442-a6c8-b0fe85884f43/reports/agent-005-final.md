Research document saved to .sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-tool-design.md (471 lines).

Covers all 8 requested areas with citations:

1. TOOL SELECTION MECHANICS — How models parse name/description/schema signals, disambiguation behavior, tool count vs accuracy (BFCL, Gorilla, API-Bank findings)

2. DESCRIPTION BEST PRACTICES — Front-load constraints (+6% accuracy, OpenAI), 3-4 sentence minimum (Anthropic), negative examples for disambiguation, semantic naming (significant precision improvement, Anthropic)

3. PARAMETER DESIGN — Flat schemas over nested (OpenAI o3/o4 guide), enums for closed domains, input_examples (72%→90% accuracy, Anthropic), strict mode details for both vendors, response format enum pattern

4. ERROR HANDLING — MCP's execution vs protocol error distinction, actionable error content (what went wrong + what to try + which param), infinite loop failure mode, API-Bank error distribution (36.8% no-call > 23.7% format > 15.9% hallucination)

5. GRANULARITY — Two consolidation types: CRUD (action param, per Anthropic docs) and workflow (composite tools, per Anthropic engineering blog). When to split vs merge. <100 tools / <20 args in-distribution (OpenAI).

6. MCP PATTERNS — Full tool schema, 4 annotation hints (readOnly/destructive/idempotent/openWorld), structured outputs (Nov 2025 spec), server design patterns, MCP vs direct integration tradeoffs

7. TOOL COMPOSITION — Output-as-input patterns, pagination, prerequisite chains, enrichment pattern, result formatting and token consciousness

8. BENCHMARKS — Gorilla, BFCL v4, ToolBench/ToolLLM, API-Bank, ToolACE (ICLR 2025), Natural Language Tools. Cross-benchmark failure mode analysis. All with paper URLs.

Key insight: Description quality is the single highest-leverage lever. Biggest failure mode across benchmarks is NOT calling a tool when needed (36.8%), not calling the wrong one — making 'when to use' guidance in descriptions critical.

27 sources cited with URLs.