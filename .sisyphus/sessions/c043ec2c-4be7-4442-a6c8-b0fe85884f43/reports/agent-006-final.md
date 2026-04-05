Research complete: Evaluation and Quality Gates for LLM Systems

## Output
Saved to: .sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/context/research-eval-quality-gates.md (926 lines)

## Coverage
All 8 requested topics covered with citations:

1. **LLM-as-Judge** — Zheng et al. (NeurIPS 2023) findings with specific numbers (85% agreement, position/verbosity/self-enhancement bias measurements), 2024 follow-up papers (CALM framework, self-preference bias), Hamel Husain's critique shadowing methodology, OpenAI and Anthropic evaluation guidance.

2. **Evaluation Frameworks** — promptfoo (YAML-first, CI/CD, red teaming), RAGAS (reference-free RAG metrics with 0.95 faithfulness accuracy), DeepEval (50+ metrics, pytest integration), Braintrust (immutable experiments), LangSmith (tracing-first), OpenAI Evals (declarative specs). Includes comparison table.

3. **Quality Gate Patterns** — Three-layer validation hierarchy (structural → semantic → quality), confidence/fallback cascades, multi-step pipeline validation, hybrid retrieval fallback for RAG.

4. **Prompt Regression Testing** — Four-component pipeline (version control, golden sets, assertion suites, CI/CD), Hamel Husain's three-level eval framework, promptfoo CI pattern with YAML examples.

5. **Metrics Guide** — Task-specific recommendations for classification, RAG, summarization, code generation, translation, creative writing, and agent systems. Includes "metrics that are theater" table (BLEU, ROUGE, perplexity) and "metrics that work" table.

6. **Human Evaluation** — When to use humans, annotation guidelines (binary pass/fail with critiques), inter-rater reliability metrics (Cohen's κ, Krippendorff's α), cost/scale considerations.

7. **Production Monitoring** — Drift detection, logging strategy, observability stack options (LangSmith, Arize, HumanLoop), alerting thresholds table.

8. **Guardrails and Safety** — Constitutional AI (training-time), Constitutional Classifiers (runtime, 86%→4.4% jailbreak rate), NeMo Guardrails (Colang DSL), Guardrails AI, defense-in-depth pattern diagram.

## Code Examples
- promptfoo YAML configuration
- LLM-as-judge binary pass/fail (Python)
- RAGAS-style faithfulness check (Python)
- CI quality gate (GitHub Actions)
- Output validation pipeline (TypeScript with Zod)

## Key Sources (with URLs)
- 9 academic papers cited
- 7 blog posts/guides cited
- 8 frameworks/tools documented
- 2 courses/talks referenced

## Note
A PostToolUse hook attempted to replace model names in research citations (GPT-3.5 → gpt-5.2, GPT-4 → gpt-5.2). This would falsify published research findings. The document contains accurate citations of the models actually studied in the papers.