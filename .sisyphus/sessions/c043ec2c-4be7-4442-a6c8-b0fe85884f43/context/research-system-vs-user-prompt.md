# System Prompt vs User Prompt — Research Findings

## Key Findings

1. **System prompts get elevated priority through training, not just position.** Models are specifically trained via RLHF/constitutional AI to treat system messages as higher-authority. Position (primacy bias) helps, but the trained hierarchy is the primary mechanism.

2. **Prompt caching makes placement a cost/latency decision, not just a behavioral one.** Anthropic's caching gives 90% discount on cached reads; OpenAI gives 50%. Stable instructions in the system prompt = massive savings at scale.

3. **Instructions degrade in the middle of long contexts.** "Lost in the Middle" (Liu et al., 2023) shows a U-shaped performance curve — models retrieve best from the start and end. System prompts benefit from primacy; critical constraints should also be repeated at the end.

4. **System prompts are a defense layer, not a security boundary.** They provide defense-in-depth against prompt injection but cannot guarantee isolation. OWASP ranks prompt injection #1 in LLM risks.

5. **OpenAI formalized the trust hierarchy with "developer" messages.** The shift from system→developer in late 2024 makes the Platform→Developer→User hierarchy explicit, with developer instructions taking precedence over user messages.

6. **Provider implementations differ significantly.** Anthropic uses a dedicated API parameter, OpenAI uses message roles with evolving hierarchy, Google uses constructor-level system_instruction, and open-source models have inconsistent support.

---

## Mechanics & Evidence

### Positional Effects: Lost in the Middle

[Liu et al. (2023) — "Lost in the Middle: How Language Models Use Long Contexts"](https://arxiv.org/abs/2307.03172)

Key findings:
- Models retrieve information best from the **beginning and end** of long contexts (U-shaped curve)
- Performance degrades significantly for information placed in the middle of the context
- Effect is consistent across models (OpenAI, Claude, open-source)
- Directly implies: system prompts benefit from primacy (first position), and critical instructions should be repeated near the end of the system prompt

### Trained Instruction Hierarchy

Models don't just follow system prompts because they're first — they're specifically trained to privilege them:

- **RLHF training** teaches models that system instructions are from a trusted developer, while user messages are from an end-user who may attempt to override constraints
- **Anthropic's constitutional AI** approach embeds behavioral principles during training, reinforced by system prompt placement at inference time
- **OpenAI's Instruction Hierarchy paper (2024)** demonstrates that explicit hierarchical training (System > Developer > User) improves robustness against prompt injection by 20-30% on benchmarks

### Multi-Turn Degradation

System prompt instructions maintain more influence over long conversations than instructions in early user messages because:
- System prompts occupy a **persistent first position** — re-injected at every API call
- User message instructions get **interleaved and diluted** by subsequent turns
- However, all instructions degrade somewhat as conversations grow — recency of recent assistant/user turns creates competing attention signals
- Practical implication: for long conversations, repeat critical system prompt constraints in user messages periodically ("reminder" pattern)

### Attention Patterns

- Transformer attention creates natural **primacy and recency biases**
- System prompts benefit from primacy (first tokens in context)
- Most recent user message benefits from recency
- Middle of long system prompts is the weakest position for instruction compliance
- No clean published paper isolates system vs user attention specifically, but the Lost in the Middle findings and attention mechanism research support this model

---

## Prompt Caching — Cost & Latency Implications

### Anthropic Prompt Caching
- **Mechanism**: Explicit `cache_control` breakpoints in API requests
- **Savings**: Cached reads cost **10% of base input price** (90% discount); cache writes cost 125% (25% premium)
- **Minimum cacheable**: 1,024 tokens (Haiku), 2,048 tokens (Sonnet/Opus)
- **TTL**: 5 minutes, refreshed on each cache hit
- **Prefix-based**: Only contiguous prefix of message sequence is cached
- **Implication**: System prompt + tool definitions = ideal cache target. Variable user content goes after.

**Cost example (Anthropic):**
- 10K token system prompt, 1K user message, 100 requests
- Without caching: 1M input tokens at full price
- With caching: ~109K effective token cost (~89% savings on system prompt portion)

[Anthropic Docs — Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

### OpenAI Automatic Caching
- **Mechanism**: Automatic, no opt-in — applies to all API requests
- **Savings**: Cached tokens are **50% cheaper** (vs Anthropic's 90%)
- **Minimum prefix**: 1,024 tokens
- **TTL**: "Minutes to hours" depending on usage
- **No write premium** (unlike Anthropic)
- **Implication**: Same principle — stable system/developer messages get cached across requests

[OpenAI Docs — Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)

### Google Gemini Context Caching
- **Mechanism**: Explicit API (`caching.CachedContent.create()`)
- **Savings**: 75% discount on cached tokens
- **Minimum**: 32,768 tokens (much higher threshold — designed for large contexts)
- **TTL**: Default 1 hour, configurable
- **Implication**: Best for very large stable contexts (documents, codebases), not typical system prompts

[Google Docs — Context Caching](https://ai.google.dev/gemini-api/docs/caching)

### Design Principle
**System prompt = stable, cacheable zone.** User prompt = variable, per-request zone. The more stable content you put in the system prompt, the more caching benefits you get. Tool definitions also get cached (they sit between system prompt and messages).

---

## Security & Prompt Injection

### System Prompt as Defense Layer
- System prompts are the **primary location for safety constraints** — models are trained to treat them as trusted
- But they are **not a security boundary** — prompt injection can still override system instructions
- Defense-in-depth approach: system prompt constraints + output validation + input sanitization

### Attack Taxonomy
1. **Direct injection**: User crafts messages to override system instructions ("Ignore previous instructions and...")
2. **Indirect injection**: Malicious payloads embedded in retrieved documents, tool outputs, web content — harder to defend because model can't distinguish legitimate content from adversarial payloads
3. **System prompt extraction**: "Repeat your instructions" attacks — no placement strategy fully prevents this

[Greshake et al. (2023) — "Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection"](https://arxiv.org/abs/2302.12173)

### OpenAI's Instruction Hierarchy Training
- Models trained with explicit hierarchy: **Platform > Developer > User**
- Improves robustness against injection by 20-30% on benchmarks
- Developer (formerly system) instructions override user instructions when conflicts arise

[OpenAI (2024) — "The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions"](https://arxiv.org/abs/2404.13208)

### Defense Strategies
1. **Sandwich defense**: Repeat critical instructions at end of system prompt (after tool defs) to exploit recency bias
2. **Delimiter-based separation**: Use XML tags or clear markers between trusted (system) and untrusted (user/retrieved) content
3. **Instruction repetition**: State key constraints multiple times in different phrasings
4. **Output validation**: Programmatic validation of model output — don't rely solely on prompt-level defenses
5. **Minimize exposure**: Avoid instructions that acknowledge or discuss the system prompt contents
6. **Treat system prompts as non-secret**: They add defense but shouldn't contain credentials or sensitive data

[OWASP Top 10 for LLMs (2025)](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — Prompt Injection ranked #1

[Simon Willison's Blog — Extensive prompt injection coverage](https://simonwillison.net/series/prompt-injection/)

---

## Provider Differences

### Anthropic (Claude)
- **API**: Dedicated top-level `system` parameter (not a message role)
- **Default**: No default system prompt when omitted
- **Structure**: Supports text blocks and `cache_control` for caching
- **Guidance**: Use system prompt for role/persona, context, tone, rules, tool instructions
- **Delimiter convention**: XML tags (`<instructions>`, `<context>`) recommended for structure

[Anthropic Messages API](https://docs.anthropic.com/en/api/messages)

### OpenAI
- **Original**: `system` role in chat completions (introduced 2023 with early chat models)
- **Evolution**: `developer` role introduced with newer models (late 2024, starting with o1 family)
- **Hierarchy**: Platform → Developer → User (explicit, trained)
- **Backward compat**: `system` role still accepted but `developer` gets stronger adherence in newer models
- **Why the change**: Formalizes that "system" instructions are from the app developer, not the platform — makes the trust model explicit

[OpenAI Chat Completions API](https://platform.openai.com/docs/guides/text-generation)
[OpenAI Developer Messages](https://platform.openai.com/docs/guides/text-generation#developer-messages)

### Google (Gemini)
- **API**: `system_instruction` parameter in GenerativeModel constructor
- **Behavior**: Processed before user content as a preamble
- **Scope**: Sets context, persona, rules, format — functionally equivalent to Anthropic's approach
- **Available**: Gemini 1.5 Pro, Flash, 2.0 models

[Google Gemini System Instructions](https://ai.google.dev/gemini-api/docs/system-instructions)

### Open-Source Models
- **Llama 2/3**: `[INST] <<SYS>>` template tags for system content
- **Mistral**: `[INST]` without explicit system demarcation
- **ChatML format**: `<|im_start|>system` becoming de facto standard for fine-tuned models
- **Key difference**: Open models generally don't enforce system > user priority as strongly as commercial APIs — depends heavily on fine-tuning approach
- **Practical note**: If using open models, test system prompt adherence explicitly; don't assume commercial-grade hierarchy

---

## Practical Guidelines

### What Goes Where

**System Prompt (stable, trusted, cacheable):**
- Identity and persona definition
- Output format constraints
- Safety and behavioral rules
- Tone and style guidelines
- Domain context that applies to all interactions
- Tool usage instructions
- Response length constraints

**User Prompt (variable, per-request):**
- The specific task or question
- Per-request context (documents, data)
- Task-specific few-shot examples
- Variable parameters and inputs

**Debated — depends on use case:**
- Few-shot examples: template examples in system prompt (cached), task-specific in user prompt (flexible)
- Retrieved context (RAG): usually user prompt, but consider system prompt for stable reference docs

### Structural Patterns (from Production Systems)

1. **Organized sections**: Use XML tags or markdown headers to separate concerns within system prompts
   ```
   <identity>You are a code reviewer...</identity>
   <rules>Always explain reasoning before giving a verdict...</rules>
   <output_format>Respond in JSON with keys: verdict, reasoning, suggestions</output_format>
   ```

2. **Priority ordering**: Most critical instructions first AND last (exploit both primacy and recency biases)

3. **Negative instructions at the end**: "Do NOT..." constraints at the end of system prompts where recency bias helps compliance

4. **Sandwich pattern**: Important rules → tool definitions → repeat important rules

5. **Keep it focused**: A system prompt that's a wall of text dilutes everything. Be specific and actionable — "Be helpful" is wasted tokens; "Respond in JSON with keys: name, score, reasoning" works.

### Multi-Turn Best Practices
- System prompt instructions persist better than user message instructions over long conversations
- For critical constraints in long conversations, periodically reinforce in user messages
- Test instruction compliance at turn 10+, not just turn 1
- Consider "system prompt refresh" patterns for very long conversations

---

## Common Mistakes

1. **Over-stuffing the system prompt**: Putting everything in the system prompt makes it enormous and dilutes important instructions. Instructions in the middle of a long system prompt get lost (Lost in the Middle effect).

2. **Ignoring multi-turn degradation**: Instructions that work in single-turn may fail by turn 10. Test across conversation lengths.

3. **Not repeating critical instructions**: Key constraints should appear at both the beginning and end of the system prompt.

4. **Mixing concerns without structure**: Combining persona, rules, and task instructions without clear delimiters. Use XML tags or markdown sections.

5. **Being too vague**: Generic instructions waste tokens. Be specific and actionable.

6. **Duplicating between system and user**: Saying the same thing in both wastes tokens and creates confusion if they drift apart.

7. **Treating system prompt as a security boundary**: System prompts provide defense-in-depth but cannot guarantee isolation from prompt injection. Always validate outputs programmatically.

8. **Not considering caching**: Putting variable content in the system prompt breaks caching and increases costs.

9. **Assuming consistent behavior across providers**: System prompt handling differs significantly between Anthropic, OpenAI, Google, and open-source models. Test on each target.

10. **Ignoring the developer message evolution**: For OpenAI's newer models, `developer` role gets better adherence than `system`. Update accordingly.

---

## Notable Sources

### Academic Papers
- [Liu et al. (2023) — "Lost in the Middle: How Language Models Use Long Contexts"](https://arxiv.org/abs/2307.03172) — U-shaped retrieval performance, primacy/recency biases in long contexts
- [OpenAI (2024) — "The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions"](https://arxiv.org/abs/2404.13208) — Formal training for System > Developer > User hierarchy, 20-30% robustness improvement
- [Greshake et al. (2023) — "Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection"](https://arxiv.org/abs/2302.12173) — Taxonomy of indirect prompt injection attacks

### Provider Documentation
- [Anthropic — Messages API (system parameter)](https://docs.anthropic.com/en/api/messages)
- [Anthropic — Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Anthropic — System Prompts Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts)
- [OpenAI — Chat Completions / Developer Messages](https://platform.openai.com/docs/guides/text-generation)
- [OpenAI — Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)
- [Google — System Instructions](https://ai.google.dev/gemini-api/docs/system-instructions)
- [Google — Context Caching](https://ai.google.dev/gemini-api/docs/caching)

### Security Resources
- [OWASP Top 10 for LLMs (2025)](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — Prompt injection #1
- [Simon Willison — Prompt Injection Series](https://simonwillison.net/series/prompt-injection/) — Extensive practical coverage of injection attacks and defenses

### Practitioner Resources
- [Anthropic — Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering) — XML tag convention, system prompt structure
- [OpenAI — Prompt Engineering Best Practices](https://platform.openai.com/docs/guides/prompt-engineering) — Concise system messages, delimiter usage
