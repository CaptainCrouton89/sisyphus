Research document written to .sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-structured-output.md

## What was researched
Dispatched 5 parallel research agents covering: constrained decoding mechanisms, schema design patterns, Zod/Pydantic/Instructor type system patterns, failure modes & performance impact, and streaming + provider comparison.

## Key findings for the authoring skill

1. **Constrained decoding is universal** — all major providers use FSM/CFG token masking. Grammar compiled from schema, cached, applied per-token. Not post-processing.

2. **Quality degradation is real but mitigable** — "Let Me Speak Freely" (Tam et al., 2024) showed 26-32 point accuracy drops on reasoning tasks. Fix: put a `reasoning` field first in schema (recovers 33%→92% on GSM8K per Instructor experiments).

3. **Schema design is the #1 lever** — PARSE paper (2025) found flattening + better descriptions was the top optimization. Ambiguous field names alone can collapse accuracy from 95%→4.5%.

4. **Provider constraints converge** — all require `additionalProperties: false`, all fields in `required`, optional modeled as null unions. Anthropic has hard limits: 24 optional params, 16 union-typed params, 20 strict tools per request.

5. **The production pattern is type-system → schema → validate → retry** — Instructor (Pydantic), zodResponseFormat (OpenAI), zodOutputFormat (Anthropic), Vercel AI SDK. Retry feeds validation errors back to model.

6. **Streaming needs specialized parsers** — partial-json npm package with Allow flags. Naive reparse is O(n²) past ~7.6KB.

## Document structure
~600 lines covering: Key Findings → Techniques & Patterns (with code examples for Anthropic, OpenAI, Instructor, Vercel AI SDK, Zod v4) → Schema Design Guidelines (do/don't with evidence) → Failure Modes (7 categories with mitigations) → Provider Comparison (feature matrix table) → Streaming Structured Output → Notable Sources (papers, docs, blogs, tools — all with URLs)

## Sources
27+ sources including 7 academic papers, 4 provider doc pages, and 16+ practitioner blogs/libraries. All URLs included in document.