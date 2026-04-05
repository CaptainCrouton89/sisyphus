# Structured Output from LLMs — JSON, Schemas, and Constrained Generation

Research compiled from academic papers, provider documentation, practitioner blogs, and library docs. Last updated: 2026-04-04.

---

## Key Findings

1. **Constrained decoding is the canonical mechanism.** All major providers (OpenAI, Anthropic, Google) and open-source frameworks (vLLM, SGLang, Outlines) use grammar-guided token masking — compiling JSON schemas into finite-state machines or pushdown automata, then zeroing out invalid token logits at each decode step. This guarantees syntactic conformance at the token level, not via post-processing.

2. **Structured output can degrade reasoning quality.** The "Let Me Speak Freely" paper (Tam et al., 2024) showed JSON constraints dropped GPT-3.5 math accuracy from 76% → 49%. The mechanism: forced key ordering disrupts sequential reasoning. **Mitigation**: put a `reasoning` field *first* in the schema — the Instructor blog showed this recovers accuracy from 33% → 92% on GSM8K.

3. **Schema design matters more than the enforcement mechanism.** The PARSE paper (2025) found that structural reorganization (flattening, better descriptions) was the #1 optimization for extraction accuracy. A single ambiguous field name collapsed accuracy from 95% → 4.5% in Instructor's experiments.

4. **All providers require `additionalProperties: false` and all fields in `required`.** Optional fields must be modeled as `type: ["string", "null"]` unions. Each optional parameter roughly doubles grammar state space (Anthropic docs).

5. **The type-system → schema → validation loop is the production pattern.** Define output shape in Zod/Pydantic → convert to JSON Schema → send to LLM → validate response → retry with error feedback on failure. Libraries: Instructor (Python/Pydantic), zodResponseFormat (OpenAI TS SDK), zodOutputFormat (Anthropic TS SDK), Vercel AI SDK.

6. **Streaming structured output requires specialized partial JSON parsers.** Naive reparse-from-zero is O(n²) and breaks past ~7.6KB. Stateful incremental parsers (`partial-json`, `@streamparser/json`) are O(n). Full schema validation can only run on completion, not mid-stream.

---

## Techniques & Patterns

### How Constrained Decoding Works

The foundational mechanism (Willard & Louf, 2023 — the Outlines paper):

1. **Compile** the JSON schema into a finite-state machine (FSM) or pushdown automaton (PDA for nested/recursive structures)
2. **Build an index** mapping each FSM state to valid vocabulary tokens (precomputed, O(1) lookup)
3. **At each decode step**, look up current FSM state → get valid token mask → zero out invalid logits → sample

This is model-agnostic and adds minimal overhead after precomputation. Context-free grammars (needed for nested JSON) require PDAs rather than plain FSMs.

**Provider implementations:**
- **OpenAI** (Aug 2024): CFG-based constrained decoding + model fine-tuning for structured output. First request compiles schema to CFG (cached). Achieves 100% schema compliance on gpt-4o-2024-08-06 (vs. <40% for gpt-4-0613 without enforcement). [Source: OpenAI blog, Aug 2024](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- **Anthropic** (GA late 2025): Grammar-compiled constrained decoding. Schemas compiled to grammar artifacts cached 24 hours. 100–300ms overhead on first use. Grammar applies only to Claude's direct output, not tool results or thinking. [Source: Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **Open-source** (vLLM/SGLang): Multiple backends — XGrammar (precomputed PDA, best for simple/repetitive schemas), LLGuidance (dynamic masks, better for complex schemas), legacy Outlines. XGrammar achieves <40µs per token. [Source: vLLM blog, Jan 2025](https://vllm.ai/blog/struct-decode-intro)

**Performance state-of-the-art:**
- XGrammar (CMU, Nov 2024): 100x speedup over prior work by splitting vocabulary into context-independent (pre-checked offline) and context-dependent (checked at runtime) tokens. [Source: arxiv:2411.15100](https://arxiv.org/abs/2411.15100)
- SGLang compressed FSM (LMSYS, Feb 2024): 2x latency reduction, 2.5x throughput by merging deterministic FSM segments. [Source: LMSYS blog](https://www.lmsys.org/blog/2024-02-05-compressed-fsm/)
- Guidance (Microsoft): Lazy-compiled automata + token healing (backtracks one token to fix tokenization boundary artifacts). 6–9ms per output token. [Source: github.com/guidance-ai/guidance](https://github.com/guidance-ai/guidance)

### Tool Use as Structured Output

Using function/tool definitions to force structured responses even when you don't need actual tool execution:

**Anthropic pattern** (pre-native structured outputs, still valid):
```python
# Define a "tool" whose sole purpose is structured output
tools = [{
    "name": "extract_data",
    "description": "Extract structured data from the text",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Full name"},
            "age": {"type": "integer"},
            "topics": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["name", "age", "topics"]
    }
}]
# Force the model to use this specific tool
response = client.messages.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": text}],
    tools=tools,
    tool_choice={"type": "tool", "name": "extract_data"}
)
structured = response.content[0].input  # typed JSON
```

**Anthropic native structured output** (current, preferred):
```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": text}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "topics": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["name", "age", "topics"],
                "additionalProperties": False
            }
        }
    }
)
parsed = json.loads(response.content[0].text)  # guaranteed valid
```

### Type System Patterns

**Instructor (Python/Pydantic) — retry with validation feedback:**
```python
import instructor
from pydantic import BaseModel, field_validator
from openai import OpenAI

class UserInfo(BaseModel):
    name: str
    age: int
    
    @field_validator("age")
    @classmethod
    def age_must_be_positive(cls, v):
        if v < 0:
            raise ValueError("Age must be positive")
        return v

client = instructor.from_openai(OpenAI())
user = client.chat.completions.create(
    model="gpt-4o",
    response_model=UserInfo,
    max_retries=3,  # retries feed validation errors back to model
    messages=[{"role": "user", "content": "Extract: John is 25"}]
)
```

When validation fails, Instructor appends `"Please correct the function call; errors encountered: {e}"` to the conversation and resubmits. A `context` dict enables runtime grounding checks (e.g., verifying citations exist in source text).

**OpenAI zodResponseFormat (TypeScript):**
```typescript
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const UserSchema = z.object({
  name: z.string().describe("Full name"),
  age: z.number().int(),
  topics: z.array(z.string()),
});

const completion = await openai.beta.chat.completions.parse({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Extract: John is 25, likes ML" }],
  response_format: zodResponseFormat(UserSchema, "user_info"),
});

const user = completion.choices[0].message.parsed; // typed
```

Constraints: max 5 nesting levels, 100 properties per object, no `.optional()` (use `z.union([z.string(), z.null()])` instead), no `z.record()`.

**Anthropic zodOutputFormat (TypeScript):**
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const UserSchema = z.object({
  name: z.string(),
  age: z.number().int(),
  topics: z.array(z.string()),
});

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Extract: John is 25, likes ML" }],
  ...zodOutputFormat(UserSchema, { name: "user_info" }),
});
```

**Vercel AI SDK:**
```typescript
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model: yourModel,
  schema: z.object({
    name: z.string().describe("Full name"),
    age: z.number(),
    topics: z.array(z.string()),
  }),
  prompt: "Extract: John is 25, likes ML",
});
// For streaming:
const { partialObjectStream } = await streamObject({ ... });
for await (const partial of partialObjectStream) {
  renderUI(partial); // progressive field-by-field rendering
}
```

**Zod v4 native JSON Schema conversion:**
```typescript
import { z } from "zod/v4";
const schema = z.object({
  name: z.string().meta({ description: "Full name" }),
  age: z.number().int(),
});
const jsonSchema = z.toJSONSchema(schema);
// { type: "object", properties: {...}, required: [...], additionalProperties: false }
```

Note: `zod-to-json-schema` package is deprecated as of Nov 2025 — Zod v4 has native `z.toJSONSchema()`.

---

## Schema Design Guidelines

### Do

- **Make all fields required.** Both OpenAI and Anthropic mandate this for strict mode. Model optional fields as `type: ["string", "null"]` unions.
- **Set `additionalProperties: false` on every object.** Prevents hallucinated extra fields.
- **Put `reasoning`/`thinking` field first.** LLMs generate keys sequentially — reasoning before answer enables chain-of-thought within structured output. Instructor showed 33% → 92% accuracy on GSM8K with this alone.
- **Write machine-oriented field descriptions.** Not "The name" but "Full legal name including first and last name." The PARSE paper found adding specific descriptions reduced errors by up to 64.7%.
- **Use string enums for constrained choices.** Reduces downstream cleaning by ~70% (PARSE). Keep enum sets small and semantically distinct.
- **Flatten where possible.** The PARSE paper found structural reorganization (flattening) was the most frequent successful optimization at 55% of cases.

### Don't

- **Don't use deeply nested schemas.** Each nesting level adds grammar complexity and model confusion risk. OpenAI caps at 5 levels.
- **Don't overuse optional fields.** Anthropic docs: each optional parameter "roughly doubles a portion of the grammar's state space." Hard limit: 24 optional params per request.
- **Don't use union types excessively.** Anthropic limit: 16 union-typed parameters. Union types create "exponential compilation cost."
- **Don't rely on numerical constraints** (`minimum`, `maximum`, `multipleOf`). Neither Anthropic nor OpenAI enforce these in constrained decoding. Move constraints into field descriptions.
- **Don't rely on string constraints** (`minLength`, `maxLength`, `pattern`). Same — not enforced by constrained decoding. Validate post-generation.
- **Don't use recursive schemas with Anthropic** (unsupported). OpenAI supports recursion but caps at ~5 levels.
- **Don't use ambiguous field names.** Instructor showed a single name confusion (`final_choice` alongside `potential_final_choices`) collapsed accuracy from 95% → 4.5%.

### Schema Complexity Budget (Anthropic-specific)

| Constraint | Limit |
|---|---|
| Optional parameters | Max 24 per request |
| Union-typed parameters | Max 16 per request |
| Strict tools per request | Max 20 |
| Schema compilation cache | 24 hours |
| First-use compilation overhead | 100–300ms |

---

## Failure Modes

### 1. Schema Violations (pre-enforcement)
Pre-constrained-decoding failure rates were 60%+ (OpenAI measured <40% compliance for GPT-4-0613). With enforcement, violations are eliminated for supported schema features — but unsupported features (numerical constraints, string patterns) are silently ignored, not enforced.

### 2. Partial Outputs / Truncation
When generation hits max tokens mid-JSON, constrained decoding guarantees each emitted token is valid but cannot force completion. FSM-based frameworks (Outlines, SGLang) can save and resume state across truncation boundaries. Without them, retry is the main recovery strategy.

### 3. Hallucinated Fields
Models add plausible-looking fields not in the schema when `additionalProperties` is not `false`. With enforcement, this is eliminated. Without enforcement, it's common — models have seen diverse JSON in training data and fill in fields from priors.

### 4. Type Coercion
Numbers as strings (`"5"` vs `5`), booleans as strings (`"true"` vs `true`), null vs empty string vs undefined. Root cause: training data contains these variants. Constrained decoding eliminates this at the token level. Prompt-only approaches (JSON mode without schema enforcement) regularly produce type-coerced values.

### 5. Empty/Default Values (Silent Failures)
Models fill required fields with empty strings, zeros, or `null` when they lack information rather than refusing. This **passes schema validation** but corrupts downstream logic. Defense: Pydantic `@field_validator` / Zod `.min(1)` / `.refine()` to reject semantically empty values.

### 6. Infinite Loops
OpenAI documented a pitfall where the model gets "stuck in loops where it just prints technically valid output forever without ever closing the object" — consuming tokens without finishing. This is why `strict: false` remains available as a fallback.

### 7. Key Ordering Effects
"Let Me Speak Freely" (RANLP 2025 follow-up by Schall & de Melo) showed constrained decoding forces selection from lower-probability tokens when top-N are invalid, accumulating semantic drift over long outputs. Particularly harmful when answer keys appear before reasoning keys.

### Mitigation Strategies (ranked by effectiveness)

1. **Constrained decoding + type-system validation + retry with error feedback** — the gold standard production pattern
2. **`reasoning` field first in schema** — structured chain-of-thought, recovers most quality loss
3. **NL-to-Format two-pass** — generate free-form first, convert to JSON second — restores near-baseline reasoning at 2x inference cost
4. **Progressive schema relaxation** — fall back from strict to lenient if generation fails (trades correctness for completion)
5. **Max token budget with margin** — set max_tokens well above expected output to avoid truncation

---

## Provider Comparison

| Feature | Anthropic (Claude) | OpenAI (GPT-4o+) | Google (Gemini) | Open-source (vLLM/SGLang) |
|---|---|---|---|---|
| **Mechanism** | Constrained decoding (grammar) | Constrained decoding (CFG) + fine-tuning | Constrained decoding | Grammar backends (XGrammar, LLGuidance, Outlines) |
| **Guaranteed conformance** | Yes | Yes | Yes | Yes |
| **API parameter** | `output_config.format` | `response_format.json_schema` | `response_schema` + `response_mime_type` | Provider-dependent |
| **Streaming** | Yes (accumulate then parse) | Yes (partial JSON stream) | Yes (partial JSON stream) | Yes |
| **Nested objects** | Yes | Yes | Yes (depth limits) | Yes |
| **`anyOf`/unions** | Yes (16-param limit) | Yes (null-union for optional) | Not documented | Yes |
| **Recursive schemas** | **No** | Yes (~5 levels max) | Not documented | Varies by backend |
| **Regex/pattern** | Partial (simple only) | Not enforced | Not documented | Yes (grammar-level) |
| **Numerical constraints** | **No** (moved to descriptions) | In schema but advisory | Yes (`min`/`max`) | Yes |
| **String constraints** | **No** | **No** | **No** | Yes |
| **Array constraints** | `minItems` 0 or 1 only | Not enforced | `minItems`/`maxItems` | Yes |
| **Schema compilation cache** | 24 hours | Persistent (per schema hash) | Unknown | N/A (local) |
| **First-use latency** | 100–300ms | <10s (up to 1min complex) | Unknown | Depends on backend |
| **SDK helpers** | `zodOutputFormat`, Pydantic `.parse()` | `zodResponseFormat`, Pydantic `.parse()` | Pydantic models | N/A |
| **Max optional params** | 24 | No stated limit | Unknown | No limit |
| **Max strict tools** | 20 per request | No stated limit | Unknown | N/A |

---

## Streaming Structured Output

### The Problem
LLM APIs stream tokens incrementally, but JSON is only valid when complete. You need to render partial data in UIs without waiting for the full object.

### Partial JSON Parsing

**`partial-json` (npm)** — dominant library. Uses bitwise `Allow` flags to control which value types may remain partial:
```typescript
import { parse, Allow } from "partial-json";
const partial = parse('{"name": "Jo', Allow.STR | Allow.OBJ);
// { name: "Jo" }
```

**Performance warning**: Naive "reparse from zero each chunk" is O(n²) and breaks past ~7.6KB. Use stateful incremental parsers that track position across calls for O(n) performance. [Source: Aha! Engineering](https://www.aha.io/engineering/articles/streaming-ai-responses-incomplete-json)

**Alternatives**: `@streamparser/json` (spec-compliant, `emitPartialTokens`), `parse-json-stream` (LLM-focused), `llm-json-stream`.

### Progressive Validation
Full schema validation **cannot** be applied mid-stream — incomplete data may yet conform. The `zod-stream` package provides path-level completeness tracking so callers know which fields are settled. Zod's `.partial()` method marks all fields optional for mid-stream shape checks. Final validation runs on completion.

### UI Pattern
Skeleton → field-by-field population via Vercel AI SDK's `partialObjectStream`:
```typescript
const { partialObjectStream } = await streamObject({
  model,
  schema: z.object({ title: z.string(), items: z.array(z.string()) }),
  prompt: "...",
});
for await (const partial of partialObjectStream) {
  // partial.title appears first, then partial.items grows
  renderUI(partial);
}
```
For arrays: `elementStream` emits only fully completed array elements, avoiding layout shift.

---

## Notable Sources

### Papers
- **Efficient Guided Generation for Large Language Models** (Willard & Louf, 2023) — foundational Outlines paper on FSM-based constrained decoding. [arxiv:2307.09702](https://arxiv.org/abs/2307.09702)
- **Let Me Speak Freely? A Study on the Impact of Format Restrictions on LLM Performance** (Tam et al., 2024) — quantified quality degradation from structured output constraints. [arxiv:2408.02442](https://arxiv.org/abs/2408.02442)
- **The Hidden Cost of Structure: How Constrained Decoding Affects Language Model Performance** (Schall & de Melo, RANLP 2025) — mechanism of semantic drift from logit masking. [PDF](https://acl-bg.org/proceedings/2025/RANLP%202025/pdf/2025.ranlp-1.124.pdf)
- **XGrammar: Flexible and Efficient Structured Generation Engine** (Dong et al., CMU, 2024) — 100x speedup via context-independent token classification. [arxiv:2411.15100](https://arxiv.org/abs/2411.15100)
- **JSONSchemaBench: Generating Structured Outputs from Language Models** (guidance-ai team, 2025) — cross-framework benchmark on 10K real-world schemas. [arxiv:2501.10868](https://arxiv.org/abs/2501.10868)
- **PARSE: LLM Driven Schema Optimization for Reliable Entity Extraction** (2025) — schema design impact on extraction accuracy. [arxiv:2510.08623](https://arxiv.org/html/2510.08623v1)
- **LMQL: Prompting Is Programming** (Beurer-Kellner, Fischer, Vechev, ETH Zurich) — constraint propagation query language. [lmql.ai](https://lmql.ai/)

### Provider Documentation
- **Anthropic Structured Outputs** — [platform.claude.com/docs/en/build-with-claude/structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- **OpenAI Structured Outputs** — [developers.openai.com/api/docs/guides/structured-outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- **Gemini Structured Outputs** — [ai.google.dev/gemini-api/docs/structured-output](https://ai.google.dev/gemini-api/docs/structured-output)
- **vLLM Structured Outputs** — [docs.vllm.ai/en/latest/features/structured_outputs/](https://docs.vllm.ai/en/latest/features/structured_outputs/)

### Practitioner Blogs & Libraries
- **Instructor library** (Jason Liu) — Pydantic-based LLM output validation with retry. [python.useinstructor.com](https://python.useinstructor.com/)
- **Bad Schemas Could Break Your LLM Structured Outputs** — Instructor blog on field naming impact. [useinstructor.com/blog/2024/09/26/bad-schemas-could-break-your-llm-structured-outputs/](https://python.useinstructor.com/blog/2024/09/26/bad-schemas-could-break-your-llm-structured-outputs/)
- **How to Minimize LLM Hallucinations with Pydantic Validators** — official Pydantic article. [pydantic.dev/articles/llm-validation](https://pydantic.dev/articles/llm-validation)
- **Simon Willison on OpenAI Structured Outputs** — expert analysis with OpenAI engineer quotes. [simonwillison.net/2024/Aug/6/openai-structured-outputs/](https://simonwillison.net/2024/Aug/6/openai-structured-outputs/)
- **Token Efficiency with Structured Output** — Microsoft Research comparison of JSON vs function calling token overhead. [medium.com/data-science-at-microsoft/token-efficiency-with-structured-output-from-language-models](https://medium.com/data-science-at-microsoft/token-efficiency-with-structured-output-from-language-models-be2e51d3d9d5)
- **Streaming AI Responses and the Incomplete JSON Problem** — Aha! Engineering on O(n²) partial parsing. [aha.io/engineering/articles/streaming-ai-responses-incomplete-json](https://www.aha.io/engineering/articles/streaming-ai-responses-incomplete-json)
- **Compressed FSM for JSON** — LMSYS/SGLang blog on 2x latency reduction. [lmsys.org/blog/2024-02-05-compressed-fsm/](https://www.lmsys.org/blog/2024-02-05-compressed-fsm/)
- **Coalescence** — dottxt blog on FSM path merging for 5x speedup. [blog.dottxt.ai/coalescence.html](https://blog.dottxt.ai/coalescence.html)
- **Vercel AI SDK — Generating Structured Data** — [ai-sdk.dev/docs/ai-sdk-core/generating-structured-data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- **Zod v4 JSON Schema** — native `z.toJSONSchema()` API. [zod.dev/json-schema](https://zod.dev/json-schema)

### Open-Source Tools
- **Outlines** (dottxt) — [github.com/dottxt-ai/outlines](https://github.com/dottxt-ai/outlines)
- **Guidance** (Microsoft) — [github.com/guidance-ai/guidance](https://github.com/guidance-ai/guidance)
- **LLGuidance** — [github.com/guidance-ai/llguidance](https://github.com/guidance-ai/llguidance)
- **XGrammar** — integrated into vLLM, TGI, MLC-LLM
- **partial-json** — [github.com/promplate/partial-json-parser-js](https://github.com/promplate/partial-json-parser-js)
- **zod-stream** — path-level completeness tracking for streaming. [npmjs.com/package/zod-stream](https://www.npmjs.com/package/zod-stream)
