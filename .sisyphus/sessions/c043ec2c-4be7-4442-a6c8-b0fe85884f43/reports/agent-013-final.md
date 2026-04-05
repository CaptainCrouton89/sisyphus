# Skill Files Review Report

Reviewed 12 files (6 SKILL.md + 6 reference.md) across 6 skills against output-variety and prompting-effectively style targets.

---

## 1. Voice/Tone Consistency — PASS

All 12 files match the practitioner voice established in the style targets. Direct, opinionated, evidence-backed. Examples:

- multi-agent-orchestration/SKILL.md:8 — "Multi-agent systems are not an upgrade from single-agent."
- tool-design/SKILL.md:8 — "Tools are not APIs with documentation bolted on. They're prompt engineering."
- context-management/SKILL.md:8 — "Context is a finite budget."
- eval-and-quality-gates/SKILL.md:8 — "LLM outputs are probabilistic."
- structured-output/SKILL.md:8 — "Structured output isn't post-processing"

No hedging, no filler, no "it might be helpful to consider" patterns found in any file. All files use the same imperative, ranked-advice structure as the targets.

---

## 2. Format Consistency — PASS

**YAML frontmatter**: All 6 SKILL.md files have correct YAML frontmatter with `name` and `description` fields. ✓

**No frontmatter on reference.md**: All 6 reference.md files start with `# Title` (no frontmatter). ✓

**Cross-links**: All 6 SKILL.md files link to `[reference.md](reference.md)`. All 6 reference.md files link back to `[SKILL.md](SKILL.md)`. ✓

**Structure**: All follow the same pattern as style targets — SKILL.md gives overview + principles, reference.md gives code + details. Consistent use of `---` section dividers in reference.md files.

---

## 3. Citation Quality — MINOR

**Citation format inconsistency across skills:**

- multi-agent-orchestration uses **double-bracket** inline citations: `[[Google Research (2025)](URL)]` (SKILL.md:10, 23, 34, etc.)
- system-vs-user-prompt uses **prose references** inline + a `## Sources` section at the bottom (reference.md:342-351)
- structured-output uses **prose references** inline + `## Sources` section (SKILL.md:122-130)
- context-management uses **prose references** inline + a citation table in reference.md (reference.md:242-255)
- tool-design uses **prose references** inline + `## Sources` in reference.md (reference.md:316-327)
- eval-and-quality-gates uses **prose references** inline + `## Key Sources` (reference.md:420-427)

The style targets (output-variety, prompting-effectively) have **no citations at all**, so there's no target format to compare against. The inconsistency is between the 6 new skills themselves, not against the targets. Not a major issue since each skill is internally consistent.

**URL spot-check results (5 URLs tested):**

1. `https://arxiv.org/abs/2306.05685` (Zheng et al.) — Valid, correct paper. ✓
2. `https://arxiv.org/abs/2408.02442` (Tam et al.) — Valid, correct paper. ✓
3. `https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/` — Valid, correct blog post. ✓
4. `https://arxiv.org/abs/2503.13657` (Cemri et al.) — Valid, correct paper. ✓
5. `https://aclanthology.org/2024.acl-long.91/` — **WRONG PAPER.** Context-management/reference.md:250 cites this as "LLMLingua-2" but it resolves to **LongLLMLingua** (a different paper in the same family). See criterion 7 for details.

---

## 4. Code Example Quality — MINOR

**Positive findings**: Code examples across all reference.md files are realistic, not toy. TypeScript uses modern patterns (async/await, generics, const assertions, proper typing). Python uses type hints, Pydantic v2, and modern SDK patterns. API code uses current model IDs (claude-opus-4-5, claude-sonnet-4-6, gpt-5.2, o3).

**Zod v3/v4 inconsistency in structured-output/reference.md:**

- Lines 15-33: Uses `.describe()` (Zod v3 pattern) and `z.string().enum([...])` — the latter doesn't exist in standard Zod v3 or v4. In v3 it's `z.enum([...])`. In v4 it may be valid but is unusual.
- Lines 38-44: Uses `.meta({ description: "..." })` (Zod v4 pattern) and `z.toJSONSchema()` (v4).
- Lines 59-63 (OpenAI section): Uses `.describe()` again (v3).

The same file mixes Zod v3 and v4 patterns. The Anthropic example uses a questionable `z.string().enum()` pattern. Since the skill itself discusses Zod v4 native JSON Schema conversion (SKILL.md:83), the examples should be consistently v4.

**No issues found** in Python examples across all skills. Pydantic models, Instructor patterns, and Anthropic/OpenAI SDK usage are all correct.

---

## 5. Content Density — PASS

All 12 files are dense with actionable content. No padding or filler detected. Every section earns its space.

Specific positive notes:
- multi-agent-orchestration/SKILL.md "Prompt Asymmetry" table (lines 129-136) — compact, high-value comparison
- tool-design/SKILL.md anti-patterns section (lines 144-151) — terse, no redundancy with earlier sections
- eval-and-quality-gates/SKILL.md "Metrics That Are Theater" (lines 79-87) — opinionated and useful, not just a list
- context-management/SKILL.md token budget table (lines 30-37) — concrete numbers with reasoning
- structured-output/reference.md "Key Numbers" table (lines 392-404) — clean summary table

No file exceeds the density level of the style targets. The longest reference.md (multi-agent-orchestration at 270 lines) is within range of prompting-effectively/reference.md (447 lines).

---

## 6. Cross-Skill Coherence — MINOR

**Valid cross-reference found:**
- system-vs-user-prompt/SKILL.md:13 → `[prompting-effectively](../prompting-effectively/SKILL.md)` — correct relative path, valid reference. ✓

**Missing cross-references that would add value:**

1. **context-management ↔ system-vs-user-prompt**: Both discuss caching implications of content placement. context-management/SKILL.md:84-98 covers caching in detail; system-vs-user-prompt/SKILL.md:79-85 also covers caching. Neither references the other. A reader of one would benefit from a pointer to the other.

2. **structured-output ↔ tool-design**: Tool-design discusses strict mode schemas (SKILL.md:59), structured-output covers schema design deeply (SKILL.md:30-65). Tool-design/reference.md:91 mentions `additionalProperties: false` which is a structured-output concept. No cross-reference exists.

3. **multi-agent-orchestration → eval-and-quality-gates**: Multi-agent/SKILL.md:63-83 discusses the debate/critic pattern and two-layer review. The eval skill covers LLM-as-judge methodology. A cross-reference from multi-agent's review discussion to eval would help.

4. **multi-agent-orchestration → context-management**: Multi-agent/reference.md:196-209 discusses token budgets for multi-agent. Context-management covers token budgets as its core topic. No cross-reference.

These are all MINOR — each skill is self-contained and usable independently. But the cross-references would improve navigation.

---

## 7. Factual Spot-Check — MAJOR (one finding), MINOR (one finding)

### MAJOR: LLMLingua "20x compression" claim — misattributed citation with wrong URL

**Location**: context-management/SKILL.md:71, context-management/reference.md:162, context-management/reference.md:250

**The claim**: "LLMLingua (Microsoft Research, ACL 2024) achieves 20x compression with ~1.5% quality loss on reasoning tasks"

**What's wrong**:
- The URL in reference.md:250 (`https://aclanthology.org/2024.acl-long.91/`) resolves to **LongLLMLingua**, a different paper in the same family — NOT LLMLingua-2.
- LLMLingua-2 (the actual ACL 2024 paper, arxiv 2403.12968) reports **2x-5x compression**, not 20x.
- The 20x figure likely comes from the **original LLMLingua** (EMNLP 2023) at extreme compression settings (rate=0.05).
- The SKILL.md text says "LLMLingua" (correct for the 20x claim) but the reference.md citation says "LLMLingua-2" (wrong paper for the 20x claim) with a URL pointing to a third paper (LongLLMLingua).

**Why it matters**: Three-way mismatch between the claim, the cited paper name, and the URL. A reader following the citation finds a different paper making different claims. The 20x number itself may be defensible for the original LLMLingua, but the attribution chain is broken.

**Fix**: Either cite the original LLMLingua (EMNLP 2023) with its correct URL, or cite LLMLingua-2 with its correct URL and adjust the compression figure to 2x-5x.

### MINOR: Zheng et al. "85% agreement" — imprecise

**Location**: eval-and-quality-gates/SKILL.md:43

**The claim**: "GPT-4 achieves 85% agreement with human experts on MT-Bench"

**What I found**: The paper abstract (arxiv 2306.05685) says "over 80% agreement." The 85% figure may come from a specific evaluation in the paper body (Table 5 shows varying rates by category), but the most widely cited number from this paper is ">80%". Calling it "85%" implies more precision than the paper's headline claim warrants.

**Severity**: MINOR — the number is in the right range and may be from a specific sub-evaluation. But "over 80%" or "~80-85%" would be more accurate to the paper's primary claim.

### PASS: Other claims verified

- **+81% on parallelizable tasks** (Google Research 2025): Confirmed. Blog post says "80.9%". ✓
- **17.2x error amplification** (Google Research 2025): Confirmed in the same source. ✓
- **37% inter-agent coordination failures** (Cemri et al. 2025): Paper title and 1,600+ traces confirmed. 37% figure likely from paper body (not in abstract). Plausible. ✓
- **86% → 4.4% jailbreak reduction** (Constitutional Classifiers): Standard Anthropic published figure. ✓

---

## Summary

| Criterion | Verdict |
|-----------|---------|
| 1. Voice/tone consistency | PASS |
| 2. Format consistency | PASS |
| 3. Citation quality | MINOR — format inconsistency across skills; one wrong URL |
| 4. Code example quality | MINOR — Zod v3/v4 pattern mixing in structured-output |
| 5. Content density | PASS |
| 6. Cross-skill coherence | MINOR — 4 missing cross-references that would add value |
| 7. Factual spot-check | MAJOR — LLMLingua 20x claim has three-way citation mismatch; MINOR — Zheng 85% is imprecise |

**One MAJOR finding**: context-management LLMLingua citation (wrong paper name, wrong URL, questionable compression figure). Needs fix before publication.

**Four MINOR findings**: citation format inconsistency, Zod version mixing, missing cross-references, Zheng agreement figure precision. Non-blocking but worth addressing.