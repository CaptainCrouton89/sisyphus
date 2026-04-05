# Evaluation and Quality Gates for LLM Systems — Research Findings

## Key Findings

1. **LLM-as-judge works, with caveats.** GPT-4 achieves 85% agreement with human experts on MT-Bench — exceeding human-human agreement (81%). But judges suffer systematic biases: position bias (Claude-v1 biased toward first position 75% of the time), verbosity bias (91% failure rate for most judges on artificially lengthened responses), and self-enhancement bias (Claude-v1 favored its own outputs with 25% higher win rates). These biases are mitigatable but not eliminable.

2. **Binary pass/fail beats Likert scales.** Hamel Husain's most impactful finding: multi-point ratings (1-5) create noisy, unactionable data. Binary pass/fail with detailed critiques forces clarity, enables standard classification metrics (precision/recall), and aligns judges faster. The Honeycomb case study achieved >90% LLM-human agreement in three iterations using this approach.

3. **Most teams skip the foundation.** The #1 failure pattern is jumping to LLM-as-judge or complex metrics before building basic assertion-based tests. Hamel Husain: "unsuccessful products almost always share a common root cause: a failure to create robust evaluation systems." Start with string matching, regex, schema validation — then layer model-based evaluation on top.

4. **Popular metrics are often theater.** BLEU shows "poor correlation with human judgements" despite being used in 95+ papers. ROUGE similarly unreliable. Eugene Yan found "n-gram and vector similarity evals/guardrails don't work" for classification tasks. NLI-based factual consistency is far more reliable (ROC-AUC 0.85 after finetuning vs 0.56 for naive approaches).

5. **Evaluation frameworks have converged on similar designs.** Promptfoo, DeepEval, RAGAS all use: declarative test configuration, assertion-based validation, LLM-as-judge for subjective criteria, and CI/CD integration. The key differentiation is in metric depth (DeepEval: 50+ metrics) vs simplicity (promptfoo: YAML-first, developer-centric).

6. **Constitutional AI and runtime classifiers are complementary safety layers.** Constitutional AI shapes model behavior during training; Constitutional Classifiers act as runtime guardrails. Anthropic's classifiers reduced jailbreak success from 86% to 4.4% with only 0.38% increase in false refusals.

---

## LLM-as-Judge

### The Seminal Paper: Zheng et al. (2023)

**"Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"** (NeurIPS 2023)
- Source: https://arxiv.org/abs/2306.05685

**Core findings:**
- GPT-4 achieves **85% agreement** with human experts on non-tie votes (first and second turn), exceeding human-human agreement of 81%
- Agreement improves with performance disparity: from 70% agreement on close model pairs to nearly 100% on clearly different ones
- GPT-4 outputs consistent results in 65% of position-swap tests; Claude-v1 only 23.8%, GPT-3.5 46.2%

**Bias measurements from the paper:**

| Bias Type | Finding |
|-----------|---------|
| Position (Claude-v1) | 75% biased toward first position, only 23.8% consistent |
| Position (GPT-4) | 30% biased toward first, 65% consistent |
| Verbosity (Claude-v1) | 91.3% failure rate on repetitive-list attack |
| Verbosity (GPT-4) | 8.7% failure rate (significantly more robust) |
| Self-enhancement (GPT-4) | ~10% higher win rate for own outputs |
| Self-enhancement (Claude-v1) | ~25% higher win rate for own outputs |

**Task-specific performance (GPT-4 win rates on MT-Bench):**

| Category | Win Rate | Implication |
|----------|----------|-------------|
| STEM | 76.6% | Strong |
| Humanities | 72.2% | Strong |
| Roleplay | 67.9% | Moderate |
| Math | 66.1% | Moderate — improved significantly with reference-guided prompting |
| Writing | 61.2% | Weaker — more subjective |
| Coding | 56.3% | Weaker |
| Reasoning | 49.3% | Near coin-flip — vulnerable to misleading context |

### Subsequent Research (2024-2025)

**"Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge" (2024)**
- Source: https://arxiv.org/html/2410.02736v1
- Proposed the CALM framework for automated bias quantification across 12 bias types
- Evaluated six LLMs; Claude-3.5 showed greatest overall resilience
- Position bias becomes severe with 3-4 options (all models below 0.5 robustness rate)
- Self-enhancement: ChatGPT 8.91% error rate vs GPT-4-Turbo 1.16%
- Chain-of-thought improved accuracy: GPT-4-Turbo +0.7%, GLM-4 +7%
- Using separate generation/judging models eliminates self-enhancement bias completely

**"Self-Preference Bias in LLM-as-a-Judge" (2024)**
- Source: https://arxiv.org/html/2410.21819v2
- Bias persists even when answer sources are anonymized

**"A Survey on LLM-as-a-Judge" (2024)**
- Source: https://arxiv.org/html/2411.15594v6
- Comprehensive taxonomy of biases including authority bias, bandwagon effect, diversity bias
- Documents that finetuned judges "essentially function as task-specific classifiers" — poor generalization
- LLM judges don't always satisfy transitivity in their judgments

### Agreement Rates Across Studies

| Judge | Task | Metric | Score |
|-------|------|--------|-------|
| GPT-4 | MT-Bench | Agreement | 85% (exceeds human-human 81%) |
| GPT-4 | Chatbot Arena | Agreement | 83-87% |
| Prometheus-7b | General | Pearson correlation | 0.897 |
| GPT-4 | TriviaQA | Cohen's κ | 0.84 |
| Llama-3-70b | TriviaQA | Cohen's κ | 0.79 |
| GPT-3.5-turbo | Factuality (CNN) | Accuracy | 0.849 |
| GPT-3.5-turbo | Factuality (XSUM) | Accuracy | 0.757 |
| UMbrela | Search relevance | Cohen's κ | 0.3-0.5 (fair) |
| Best model | HaluEval | Accuracy | 58.5% (poor) |
| LLMs | Factual consistency | Recall | 30-60% (with >95% precision on consistent text) |

### Practical Mitigation Strategies

1. **Swap positions and average**: Run each pairwise comparison twice with swapped order. If results disagree, flag as tie or escalate.
2. **Use rubrics with chain-of-thought**: Have the judge reason step-by-step before scoring. Reference-guided prompting reduced math failures from 70% to 15%.
3. **Binary outputs**: Converting to pass/fail enables precision/recall measurement and improves consistency.
4. **Multi-judge panels**: A panel of three smaller models outperformed GPT-4 alone at one-seventh the cost (from the survey paper).
5. **Separate judge from generator**: Using a different model to judge eliminates self-enhancement bias completely.
6. **Pairwise over direct scoring**: Produces more stable results with smaller LLM-human judgment differences for subjective tasks. Direct scoring is fine for objective tasks (factuality, toxicity).

### When LLM-as-Judge Fails

- **Creative tasks**: LLMs pass creativity tests 3-10x less often than human writers
- **Hallucination detection**: Best models achieve only 58.5% accuracy; 30-60% recall on inconsistencies
- **Fine-grained relevance**: Accuracy drops to 30-50% for "highly relevant" vs "perfectly relevant" distinctions
- **Nuanced reasoning**: Complex tasks require 70B+ parameter models; smaller models are brittle
- **Cultural sensitivity**: General-purpose models miss cultural nuances that humans naturally discern
- **Domain expertise**: Models lack specialized knowledge in medicine, law, finance without domain-specific fine-tuning

### Hamel Husain's LLM-as-Judge Methodology

Source: https://hamel.dev/blog/posts/llm-judge/

**The Critique Shadowing Process (7 steps):**
1. Identify one principal domain expert whose judgment defines success
2. Build diverse dataset covering features, scenarios, personas
3. Collect expert binary pass/fail judgments with detailed written critiques
4. Fix obvious systemic errors before building the judge
5. Iteratively build LLM judge using expert examples as few-shot prompts
6. Perform error analysis — calculate failure rates across dimensions, classify root causes
7. Create specialized judges only for confirmed critical issues

**Key principles:**
- Critiques must be "detailed enough that a new employee could understand it"
- Start with ~30 examples, keep going until no new failure modes emerge
- Track precision and recall separately — raw agreement misleads on imbalanced data
- Use the most powerful model you can afford for judging
- Don't jump to specialized judges — iterate on one general judge first
- Review at least 100 traces before building evaluators

### Anthropic's Evaluation Guidance

Source: https://docs.anthropic.com/en/docs/build-with-claude/develop-tests

**Key recommendations:**
- Define specific, measurable, achievable, relevant success criteria
- Use quantitative metrics: F1 score, accuracy, precision, recall, response time
- Even "hazy" topics like safety can be quantified (e.g., "<0.1% flagged for toxicity across 10K trials")
- Prioritize volume over quality in test design — more questions with automated grading beats fewer with hand-grading
- Use LLM-based Likert scales for subjective qualities (tone, empathy)
- Use a different model for grading than the model being evaluated
- Provide code examples for exact match, cosine similarity, ROUGE-L, and LLM-graded evaluations

### OpenAI's Evaluation Best Practices

Source: https://platform.openai.com/docs/guides/evaluation-best-practices

- Use the most capable model to grade (e.g., o3)
- Provide reference "gold standard" answers
- Control for response length — LLMs bias towards longer responses
- Add reasoning/chain-of-thought before scoring — improves eval performance
- Validate with human evaluation before running at scale
- Model grading will have an error rate — quantify and accept it

---

## Evaluation Frameworks

### promptfoo

Source: https://promptfoo.dev/

**Design philosophy:** Test-driven LLM development with developer-centric UX. Originally built for production systems serving 10M+ users.

**Key features:**
- YAML-declarative test configuration — no code required for basic evals
- Deterministic assertions: `equals`, `contains`, `regex`, `is-json`, `is-sql`, `latency`, `cost` (all negatable with `not-` prefix)
- Model-graded assertions: `llm-rubric`, `g-eval`, `answer-relevance`, `context-faithfulness`, `factuality`
- Derived metrics via mathjs or JavaScript for composite scores (F1, weighted averages)
- Built-in red teaming for security vulnerability scanning
- CI/CD integration via GitHub Actions, GitLab CI, Jenkins
- Provider support: OpenAI, Anthropic, Azure, Google, HuggingFace, open-source models, custom APIs
- **Open-source, runs locally, no vendor lock-in**

**CI/CD quality gate pattern:**
```yaml
on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'promptfooconfig.yaml'
```
```bash
FAILURES=$(jq '.results.stats.failures' results.json)
if [ "$FAILURES" -gt 0 ]; then exit 1; fi
```

### RAGAS (Retrieval Augmented Generation Assessment)

Source: https://arxiv.org/abs/2309.15217

**Design philosophy:** Reference-free RAG evaluation — no ground-truth annotations needed.

**Core metrics:**
- **Faithfulness**: Decomposes answer into statements, checks each against context. Score = |verified statements| / |total statements|. Achieved 0.95 accuracy on WikiEval.
- **Answer Relevance**: Generates n questions from the answer, computes cosine similarity between original and generated questions via embeddings. AR = (1/n) × Σ sim(q, qi). Achieved 0.78 accuracy on WikiEval.
- **Context Precision**: How much of the retrieved context is relevant
- **Context Recall**: How much relevant information was retrieved

**Human agreement:** 95% on faithfulness, ~90% on answer relevance.

### DeepEval

Source: https://deepeval.com/

**Design philosophy:** Comprehensive metrics library with deterministic scoring options. Claims 20M+ daily evaluations.

**Key features:**
- 50+ metrics across categories: RAG, agentic, multi-turn, safety, multimodal
- G-Eval implementation: generates evaluation steps, then applies them to score (0-1)
- DAG (Deep Acyclic Graph) metrics for deterministic scoring
- Native pytest integration (`deepeval test run`)
- Safety metrics: bias, toxicity, PII leakage, role violation
- Agentic metrics: task completion, tool correctness, step efficiency, plan adherence
- **Open-source with commercial platform (Confident AI)**

### Braintrust

Source: https://braintrustdata.com/

**Design philosophy:** Experiments as immutable, comparable records. Production traces evaluated asynchronously.

**Key features:**
- Three scoring approaches: built-in autoevals, LLM-as-judge, custom code
- Online scoring: evaluates production traces automatically with no latency impact
- Production traces can be pulled into datasets for offline testing
- CI/CD integration for regression detection
- **Commercial platform**

### LangSmith

Source: https://smith.langchain.com/

**Design philosophy:** Tracing-first evaluation platform integrated with LangChain ecosystem.

**Key features:**
- Four evaluator types: human review, code rules, LLM-as-judge, pairwise comparison
- Dataset creation from manual curation, production traces, or synthetic generation
- Annotation queues for human review workflows
- Tight integration with LangChain/LangGraph
- **Commercial platform with free tier**

### OpenAI Evals

Source: https://github.com/openai/evals

**Design philosophy:** Declarative eval specification — "you don't need to write any evaluation code at all" for standard templates.

**Key features:**
- Three eval types: basic (template + JSON data), model-graded (YAML specs), custom
- Completion Function Protocol for chains/agents
- Git-LFS registry for community evals
- Support for private evals
- **Open-source**

### Framework Comparison Summary

| Feature | promptfoo | DeepEval | RAGAS | Braintrust | LangSmith |
|---------|-----------|----------|-------|------------|-----------|
| Open source | Yes | Partially | Yes | No | No |
| Config format | YAML | Python/pytest | Python | Python | Python |
| CI/CD built-in | Yes (GH Actions) | Yes (pytest) | Manual | Yes | Manual |
| Red teaming | Yes | No | No | No | No |
| RAG-specific metrics | Yes | Yes | Core focus | Yes | Yes |
| Agentic metrics | Basic | Yes | No | Yes | Yes |
| Human-in-loop | No | Via platform | No | Yes | Yes |
| Tracing | No | Via platform | No | Yes | Yes |

---

## Quality Gate Patterns

### Output Validation Hierarchy

**Layer 1 — Structural Validation (deterministic, fast):**
- JSON schema validation (use structured outputs / JSON mode when available)
- Regex pattern matching for expected formats
- Length constraints (min/max tokens)
- Type checking on extracted fields
- SQL syntax verification for generated queries
- Code syntax verification for generated code

**Layer 2 — Semantic Validation (model-assisted):**
- Cosine similarity between output and source material
- NLI-based entailment checking for faithfulness
- LLM-based verification that output aligns with provided context
- Fuzzy matching for extractive tasks

**Layer 3 — Quality Evaluation (model-graded):**
- LLM-as-judge with rubrics for subjective dimensions
- Pairwise comparison against baseline outputs
- Domain-specific criteria evaluation

### Confidence and Fallback Strategies

**Confidence signals:**
- Log probabilities (logprobs) from the model when available
- Self-consistency: sample multiple times, check agreement
- Explicit uncertainty detection: ask the model to rate its own confidence

**Fallback cascade pattern:**
1. Try fast/cheap model first
2. If confidence below threshold → escalate to more capable model
3. If still uncertain → return structured "I don't know" with explanation
4. For critical applications → route to human review queue

**Retry strategies:**
- Retry with the same prompt (addresses stochastic failures)
- Retry with reformulated prompt (addresses systematic failures)
- Retry with different model (addresses model-specific blind spots)

### Multi-Step Pipeline Validation

For chains and multi-step pipelines, validate at each boundary:

```
Input Validation → Step 1 Output Check → Step 2 Output Check → Final Validation
     │                    │                      │                     │
     ▼                    ▼                      ��                     ▼
  Reject/             Retry step /           Retry step /         Return or
  sanitize            fallback               fallback             escalate
```

Key principle from research: "Splitting complex tasks into distinct prompts for distinct subtasks improves reliability." Each subtask enables focused validation before proceeding.

### Hybrid Retrieval Fallback (for RAG)

```
Semantic search → Check relevance score → If low: BM25 keyword fallback
                                        → If both low: structured DB query
                                        → If all fail: acknowledge gap
```

---

## Prompt Regression Testing

### The Four-Component Pipeline

1. **Prompt Library with Version Control**: Treat prompts as versioned assets, not embedded strings. Store in dedicated directory, track changes in git.

2. **Curated Test Dataset ("Golden Set")**: Build from production traces — "The best test cases come from real production traffic." Start with ~30 examples covering happy paths, edge cases, and known failure modes. Expand until no new failure patterns emerge.

3. **Assertion Suite**: Layer assertions from cheap to expensive:
   - Structural assertions (JSON valid, required fields present)
   - Content assertions (no PII, no prohibited content, length within bounds)
   - Semantic assertions (answer relevant to question, faithful to context)
   - Quality assertions (LLM-graded rubric scores)

4. **CI/CD Integration**: Run evals on every PR that touches prompts, configs, or system prompt logic.

### Promptfoo CI Pattern

```yaml
# promptfooconfig.yaml
prompts:
  - file://prompts/v2/system.txt
providers:
  - id: anthropic:messages:claude-sonnet-4-6
tests:
  - vars:
      input: "What is your return policy?"
    assert:
      - type: contains
        value: "30 days"
      - type: llm-rubric
        value: "Response is helpful, accurate, and professional"
      - type: not-contains
        value: "I'm an AI"
```

### Hamel Husain's Three-Level Eval Framework

**Level 1: Unit Tests (every code change)**
- Assertion-based: regex, string matching, schema validation
- Fast, cheap, deterministic
- Use LLMs to generate synthetic test data
- Don't require 100% pass rates — tolerance depends on risk

**Level 2: Human & Model Evaluation (set cadence)**
- Implement tracing infrastructure (LangSmith, Arize, HumanLoop)
- Build custom data review tools — "Remove ALL friction from looking at data"
- Binary labels (good/bad) before granular scores
- Review all traces initially, sample over time

**Level 3: Production Monitoring (continuous)**
- A/B testing new prompts against baselines
- Automated quality scoring on production traffic
- Alerting on metric degradation

### Anti-patterns

- Skipping Level 1 and jumping to LLM-based evaluation
- Buying eval platforms before leveraging existing CI/CD infrastructure
- Static evaluations that never update as the product evolves
- Assuming automated systems can replace human data review

---

## Metrics Guide

### Which Metrics to Use When

#### Classification / Extraction Tasks
**Use:** Precision, Recall, F1, ROC-AUC, PR-AUC
**Don't use:** N-gram similarity, vector similarity ("similarity distributions of positive and negative instances are too close" — Eugene Yan)
**Key insight:** Examine predicted probability distributions to ensure clean class separation before deployment.

#### RAG / Q&A Systems
**Use:**
- Faithfulness (NLI-based entailment or RAGAS decomposition approach — 0.95 human agreement)
- Answer relevance (embedding similarity between question and answer — 0.78 human agreement)
- Context precision and recall (measure retrieval quality separately from generation)
**Don't use:** BLEU, ROUGE for answer quality
**Key insight:** Measure retrieval and generation separately. Most RAG failures are retrieval failures.

#### Summarization
**Use:**
- Factual consistency via NLI models (ROC-AUC 0.85 after finetuning)
- Length adherence checks
- Relevance via reward models
**Don't use:** ROUGE, METEOR, BERTScore, G-Eval for summarization ("unreliable and/or impractical" — Eugene Yan)
**Key insight:** Reference-based approaches requiring gold summaries are impractical. NLI-based consistency checking is the most reliable automated approach.

#### Code Generation
**Use:** pass@k (execution-based correctness), syntax validation, test suite pass rates
**Don't use:** BLEU (text similarity doesn't correlate with functional correctness)
**Key insight:** LLM judges caught 80-85% of inserted bugs (CriticGPT). Combine execution-based testing with LLM code review.

#### Translation
**Use (ranked):**
1. COMET / BLEURT (learned metrics using source context)
2. chrF (character n-gram F-score, language-independent)
3. COMETKiwi (reference-free)
**Don't use:** BLEU ("bottom of the leaderboard at WMT22 and WMT23")

#### Creative Writing
**Use:** Human evaluation (LLMs pass creativity tests 3-10x less often than humans)
**Don't use:** Any automated metric in isolation
**Key insight:** This is where LLM-as-judge fails most. Multi-judge panels with detailed rubrics help but don't replace human assessment.

#### Agent / Tool-Use Systems
**Use:**
- Task completion rate
- Tool selection accuracy (correct tool for the task)
- Step efficiency (unnecessary steps taken)
- Plan adherence (follows intended workflow)
**Key insight:** DeepEval provides dedicated agentic metrics. These are newer and less validated than text-generation metrics.

### Metrics That Are Theater

| Metric | Problem | Evidence |
|--------|---------|----------|
| BLEU (for general text) | "Poor correlation with human judgements" | Used in 95+ papers despite this; bottom of WMT leaderboards |
| ROUGE (for summarization) | Can't capture factuality or faithfulness | 62.6% of papers using it provided no implementation details |
| Perplexity (as quality proxy) | Measures model confidence, not output quality | Low perplexity ≠ good output |
| Generic vector similarity | Distributions of positive/negative instances too close | Eugene Yan: "don't work" for classification |
| Multi-point Likert scales | Subjective, inconsistent across raters, not actionable | Hamel Husain: "people don't know what to do with a 3 or 4" |

### Metrics That Actually Work

| Metric | Domain | Why It Works |
|--------|--------|-------------|
| Binary pass/fail + critique | Universal | Forces clarity, enables precision/recall |
| NLI-based faithfulness | RAG, summarization | 0.85 ROC-AUC after finetuning; tests entailment directly |
| pass@k | Code generation | Tests functional correctness, not text similarity |
| COMET | Translation | Learned from human judgments, uses source context |
| Exact match / regex | Structured output | Deterministic, fast, no false positives |
| Schema validation | Structured output | Catches formatting errors before downstream processing |

---

## Human Evaluation

### When You Need Humans

- **Creative tasks**: LLM judges fail at subjective aesthetic judgment
- **Safety-critical domains**: Medicine, legal, financial advice — domain expertise required
- **Novel domains**: No training data exists for the evaluation task
- **Calibrating LLM judges**: Initial human labels needed to validate automated evaluators
- **Cultural sensitivity**: General-purpose models miss culturally-specific evaluation criteria
- **Establishing baselines**: Human-human agreement sets the ceiling for automated evaluation

### Annotation Guidelines

**Best practices (from Hamel Husain):**
- Binary pass/fail decisions, not Likert scales
- Require detailed written critiques explaining the decision
- Include sufficient context (user metadata, system information, external resources)
- Ensure diverse examples across scenarios, features, personas
- Start with ~30 examples, expand until no new failure modes emerge
- Have the principal domain expert define what "good" means — not a committee

**Anti-patterns:**
- Terse critiques without reasoning
- Missing external context that would inform the judgment
- Insufficient example diversity
- Multiple annotators without alignment calibration

### Inter-Rater Reliability

| Metric | Interpretation | When to Use |
|--------|---------------|-------------|
| Cohen's κ | Chance-adjusted agreement between 2 raters | Binary/categorical judgments |
| Krippendorff's α | Chance-adjusted, works with >2 raters, handles missing data | Multiple annotators |
| Percent agreement | Raw agreement without chance correction | Quick sanity check only |
| Spearman's ρ | Rank correlation | Ordinal ratings |

**What counts as good agreement:**
- κ > 0.8: Excellent (rarely achieved for subjective tasks)
- κ 0.6-0.8: Substantial (good target for most tasks)
- κ 0.4-0.6: Moderate (acceptable for subjective dimensions)
- κ < 0.4: Fair to poor (annotation guidelines need work)

**Benchmark:** Human-human agreement on MT-Bench was 81%. GPT-4 exceeded this at 85%.

### Cost and Scale Considerations

- Start with domain expert (1 person) for initial 30-100 examples
- Use LLM judges for scale after calibrating against human labels
- Periodically re-sample and re-annotate to detect drift
- Annotation platforms: Scale AI, Surge AI, or custom tools (Gradio/Streamlit can be built in a day)

---

## Production Monitoring

### Detecting Drift and Degradation

**Model behavior changes (upstream drift):**
- Model provider updates (silent model changes behind the same API version)
- Distribution shift in user inputs over time
- Context window content changes (RAG index updates, knowledge base modifications)

**Monitoring approach:**
- Run eval suite on production traffic samples continuously
- Track quality metrics over time windows (daily, weekly)
- Alert on statistically significant drops (not individual sample failures)
- A/B test prompt changes against baselines before full rollout

### What to Log

- Full input/output pairs (including system prompts)
- Token counts and latency per call
- Model version / provider endpoint used
- Retrieval context (for RAG systems)
- User feedback signals (thumbs up/down, task completion, follow-up queries)
- Cost per query
- Judge scores (if running online evaluation)

### Observability Stack

Tracing infrastructure options:
- **LangSmith**: LangChain-integrated, annotation queues
- **Arize Phoenix**: Open-source, embedding drift detection
- **HumanLoop**: Human review workflows
- **OpenLLMetry**: Open-source OpenTelemetry for LLMs
- **Braintrust**: Async online scoring of production traces

Key principle: traces should group related LLM interactions (user message → AI response → follow-up) and support searching, filtering, and readable display.

### Alerting Strategy

| Signal | Threshold | Action |
|--------|-----------|--------|
| Pass rate drop | >5% below baseline over 24h | Investigate — possible model update or input distribution shift |
| Latency spike | >2x p99 baseline | Check provider status, model routing |
| Cost spike | >50% above daily average | Check for prompt bloat, retry loops, or abuse |
| Toxicity rate increase | Any sustained increase | Immediate investigation — possible jailbreak or input drift |
| User feedback decline | Statistically significant drop | Sample and manually review recent outputs |

---

## Guardrails and Safety

### Constitutional AI (Anthropic)

Source: https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback

**Training-time approach:**
1. Supervised Learning: Model generates outputs → self-critiques based on constitutional principles → revises → finetuned on revisions
2. Reinforcement Learning from AI Feedback (RLAIF): AI model evaluates which outputs better adhere to principles → trains reward model → guides further RL

The constitution is a set of human-written principles — the only human oversight required. Reduces annotation requirements dramatically vs RLHF.

### Constitutional Classifiers (Anthropic, 2025)

Source: https://www.anthropic.com/research/constitutional-classifiers

**Runtime guardrails:**
- Input and output classifiers trained on synthetically generated data
- Constitution defines allowed vs disallowed content categories
- Reduced jailbreak success from **86% → 4.4%** (blocking >95% of advanced jailbreaks)
- Only **0.38% increased refusal rate** on legitimate queries
- 23.7% additional compute overhead
- Red team testing: 183 participants, 3000+ hours, no universal bypass found in prototype

### NeMo Guardrails (NVIDIA)

Source: https://docs.nvidia.com/nemo/guardrails/

**Architecture:**
- **Colang**: Domain-specific language for defining guardrail logic (v1.0 and v2.0)
- Four rail types: input rails, output rails, dialog rails, retrieval rails
- YAML configuration + Colang scripts
- Deployment: Python SDK, FastAPI server, or Kubernetes microservice

**Execution flow:**
User input → Input rails → LLM inference → Output rails → Response

### Guardrails AI

Source: https://www.guardrailsai.com/

**Architecture:**
- Guard (main validation interface) + validators (condition-testing components)
- Validator Hub: pre-built validators (PII detection, toxicity, etc.)
- Two modes: filter offending output or re-prompt with context for correction
- Claims up to 20x greater accuracy vs raw LLM output
- Integrates with NeMo Guardrails for combined approach

### Defense-in-Depth Pattern

```
User Input
    │
    ▼
Input Validation (PII detection, jailbreak detection, topic boundaries)
    │
    ▼
Model Inference (Constitutional AI training, system prompt constraints)
    │
    ▼
Output Validation (toxicity filter, schema validation, factuality check)
    │
    ▼
Business Logic Checks (domain-specific rules, compliance requirements)
    │
    ▼
User Output
```

---

## Notable Sources

### Papers
- Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (NeurIPS 2023) — https://arxiv.org/abs/2306.05685
- RAGAS: "RAGAS: Automated Evaluation of Retrieval Augmented Generation" (2023) — https://arxiv.org/abs/2309.15217
- "Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge" (2024) — https://arxiv.org/html/2410.02736v1
- "Self-Preference Bias in LLM-as-a-Judge" (2024) — https://arxiv.org/html/2410.21819v2
- "A Survey on LLM-as-a-Judge" (2024) — https://arxiv.org/abs/2411.15594
- "LLMs-as-Judges: A Comprehensive Survey on LLM-based Evaluation Methods" (2024) — https://arxiv.org/html/2412.05579v2
- SelfCheckGPT (EMNLP 2023) — Sampling-based hallucination detection
- Constitutional AI (Anthropic, 2022) — https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback
- Constitutional Classifiers (Anthropic, 2025) — https://www.anthropic.com/research/constitutional-classifiers

### Blog Posts & Guides
- Hamel Husain, "Using LLM-as-a-Judge For Evaluation: A Complete Guide" — https://hamel.dev/blog/posts/llm-judge/
- Hamel Husain, "Your AI Product Needs Evals" — https://hamel.dev/blog/posts/evals/
- Hamel Husain, "LLM Evals: Everything You Need to Know" — https://hamel.dev/blog/posts/evals-faq/
- Eugene Yan, writings on evaluation and guardrails — https://eugeneyan.com/
- Anthropic, "Define success criteria and build evaluations" — https://docs.anthropic.com/en/docs/build-with-claude/develop-tests
- OpenAI, "Evaluation best practices" — https://platform.openai.com/docs/guides/evaluation-best-practices
- Pragmatic Engineer, "A pragmatic guide to LLM evals for devs" — https://newsletter.pragmaticengineer.com/p/evals

### Frameworks & Tools
- promptfoo — https://promptfoo.dev/ (open-source)
- DeepEval — https://deepeval.com/ (open-source + commercial)
- RAGAS — https://docs.ragas.io/ (open-source)
- OpenAI Evals — https://github.com/openai/evals (open-source)
- LangSmith — https://smith.langchain.com/ (commercial)
- Braintrust — https://braintrustdata.com/ (commercial)
- NeMo Guardrails — https://docs.nvidia.com/nemo/guardrails/ (open-source)
- Guardrails AI — https://www.guardrailsai.com/ (open-source + commercial)

### Courses & Talks
- Hamel Husain & Shreya Shankar, "AI Evals For Engineers & PMs" (Maven course) — https://maven.com/parlance-labs/evals
- Hamel Husain, "AI Evaluations Crash Course" (Lenny's Newsletter) — https://www.lennysnewsletter.com/p/evals-error-analysis-and-better-prompts

---

## Code Examples

### Basic Eval with promptfoo (YAML)

```yaml
# promptfooconfig.yaml
description: "Customer service response quality"
prompts:
  - file://prompts/customer-service-v2.txt
providers:
  - id: anthropic:messages:claude-sonnet-4-6
    config:
      max_tokens: 1024
tests:
  - description: "Handles refund request"
    vars:
      query: "I want a refund for order #12345"
    assert:
      - type: contains
        value: "refund"
      - type: not-contains
        value: "I'm just an AI"
      - type: is-json  # if expecting structured response
      - type: llm-rubric
        value: "Response acknowledges the customer's concern, provides clear next steps, and maintains a professional tone"
      - type: latency
        threshold: 3000  # max 3 seconds
  - description: "Rejects off-topic request"
    vars:
      query: "Write me a poem about cats"
    assert:
      - type: llm-rubric
        value: "Response politely redirects to customer service topics"
```

### LLM-as-Judge with Binary Pass/Fail (Python)

```python
import anthropic

client = anthropic.Anthropic()

def judge_output(input_text: str, output_text: str, context: str = "") -> dict:
    """Binary pass/fail judge following Hamel Husain's methodology."""
    judge_prompt = f"""You are evaluating an AI assistant's response.

<input>{input_text}</input>
<output>{output_text}</output>
{"<context>" + context + "</context>" if context else ""}

Evaluate this response on these criteria:
1. Accuracy: Is the information factually correct?
2. Relevance: Does it address the user's actual question?
3. Completeness: Does it cover the key points?
4. Safety: Does it avoid harmful or misleading content?

First, write a detailed critique explaining your reasoning.
Then provide a binary verdict: PASS or FAIL.

<example>
Critique: The response correctly identifies the return policy timeframe but fails
to mention the exception for electronics which have a shorter window. The tone is
appropriate and professional. However, the omission of the electronics exception
could lead to customer frustration.
Verdict: FAIL
</example>

Respond in this exact format:
Critique: [your detailed analysis]
Verdict: [PASS or FAIL]"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": judge_prompt}],
    )
    
    text = response.content[0].text
    verdict = "PASS" if "Verdict: PASS" in text else "FAIL"
    critique = text.split("Verdict:")[0].replace("Critique:", "").strip()
    
    return {"verdict": verdict, "critique": critique}
```

### RAGAS-Style Faithfulness Check (Python)

```python
import anthropic

client = anthropic.Anthropic()

def check_faithfulness(answer: str, context: str) -> float:
    """Decompose answer into claims and verify each against context."""
    
    # Step 1: Extract claims
    extraction = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"""Extract individual factual claims from this answer.
Return one claim per line, nothing else.

Answer: {answer}"""}],
    )
    claims = [c.strip() for c in extraction.content[0].text.strip().split("\n") if c.strip()]
    
    if not claims:
        return 1.0
    
    # Step 2: Verify each claim against context
    verified = 0
    for claim in claims:
        check = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": f"""Can this claim be inferred from the context?
Respond only YES or NO.

Context: {context}
Claim: {claim}"""}],
        )
        if "YES" in check.content[0].text.upper():
            verified += 1
    
    return verified / len(claims)
```

### CI Quality Gate (GitHub Actions)

```yaml
name: LLM Eval
on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'src/llm/**'
      - 'promptfooconfig.yaml'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Run evals
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx promptfoo@latest eval --output results.json
          
          # Extract pass rate
          PASS_RATE=$(jq '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100' results.json)
          echo "Pass rate: ${PASS_RATE}%"
          
          # Fail if below threshold
          FAILURES=$(jq '.results.stats.failures' results.json)
          if [ "$FAILURES" -gt 0 ]; then
            echo "::error::${FAILURES} eval assertions failed"
            npx promptfoo@latest eval --output results.html
            exit 1
          fi

      - name: Generate report
        if: always()
        run: npx promptfoo@latest eval --output results.html
        
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: results.html
```

### Output Validation Pipeline (TypeScript)

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const client = new Anthropic();

// Define expected output schema
const ResponseSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(z.string()).min(1),
});

type ValidatedResponse = z.infer<typeof ResponseSchema>;

async function queryWithValidation(
  prompt: string,
  context: string
): Promise<ValidatedResponse | { error: string; fallback: string }> {
  
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    system: `Answer based on the provided context. Return JSON matching this schema:
{answer: string, confidence: "high"|"medium"|"low", sources: string[]}

Context: ${context}`,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Layer 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: retry with explicit JSON instruction
    const retry = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: text },
        { role: "user", content: "Please format your response as valid JSON." },
      ],
    });
    try {
      parsed = JSON.parse(
        retry.content[0].type === "text" ? retry.content[0].text : ""
      );
    } catch {
      return { error: "json_parse_failure", fallback: text };
    }
  }

  // Layer 2: Schema validation
  const result = ResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { error: "schema_validation_failure", fallback: text };
  }

  // Layer 3: Confidence-based routing
  if (result.data.confidence === "low") {
    // Could escalate to more capable model or human review
    console.warn("Low confidence response — consider human review");
  }

  return result.data;
}
```
