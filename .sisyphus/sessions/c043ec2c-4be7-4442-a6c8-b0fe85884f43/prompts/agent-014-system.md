# Sisyphus Agent Context

You are an agent in a sisyphus session.

- **Session ID**: c043ec2c-4be7-4442-a6c8-b0fe85884f43
- **Your Task**: Fix the LLMLingua citation in context-management skill files. This is a MAJOR review finding — three-way mismatch between claim, paper name, and URL.

## The Problem

Three files have interrelated LLMLingua citation issues:

1. **SKILL.md line 71**: Says "LLMLingua (Microsoft Research, ACL 2024) achieves 20x compression with ~1.5% quality loss on reasoning tasks"
   - Problem: The 20x figure is from original LLMLingua (EMNLP 2023), NOT LLMLingua-2 (ACL 2024). LLMLingua-2 reports 2x-5x compression.

2. **reference.md line 162**: Code comment says `# rate=0.05 # 20x compression: 1.5% accuracy loss on GSM8K/BBH`
   - Problem: The code uses `use_llmlingua2=True` (LLMLingua-2 library), but the 20x claim is from original LLMLingua

3. **reference.md line 250**: Citation table says `LLMLingua-2` with URL `https://aclanthology.org/2024.acl-long.91/`
   - Problem: That URL resolves to LongLLMLingua (a different paper). The correct LLMLingua-2 paper is arxiv 2403.12968

## What To Fix

Files are at `/Users/silasrhyneer/Code/crouton-kit/plugins/authoring/skills/context-management/`

### SKILL.md line 71
Change to accurately describe LLMLingua-2's capabilities. Something like: "LLMLingua-2 (Microsoft Research, ACL 2024) achieves 2x–5x compression with minimal quality loss. At aggressive settings (rate=0.05), the original LLMLingua (EMNLP 2023) demonstrated up to 20x compression with ~1.5% accuracy loss on reasoning benchmarks."

Keep it concise — this is a SKILL.md overview, not a deep dive.

### reference.md lines 149-165
The code example is fine (uses LLMLingua-2 library). Fix the comment at line 162:
`# rate=0.05 # 20x — original LLMLingua (EMNLP 2023); LLMLingua-2 sweet spot is 2x–5x`

### reference.md line 250 (citation table)
Split into two rows:
- Original LLMLingua (EMNLP 2023): URL https://arxiv.org/abs/2310.05736 — up to 20x compression
- LLMLingua-2 (ACL 2024): URL https://arxiv.org/abs/2403.12968 — 2x-5x compression, 3-6x faster

## Verification
After making edits, use WebSearch or WebFetch to verify:
- https://arxiv.org/abs/2310.05736 is the original LLMLingua paper
- https://arxiv.org/abs/2403.12968 is LLMLingua-2

Keep the same voice/tone as the rest of the file. Don't add unnecessary words.

## Reports

Reports are non-terminal — you keep working after sending them. Use `sisyphus report` to flag things the orchestrator needs to know about:

- **Code smells** — unexpected complexity, unclear architecture, code that seems wrong
- **Out-of-scope issues** — failing tests, missing error handling, broken assumptions
- **Blockers** — anything preventing you from completing your task

Report problems rather than working around them — the orchestrator can route these to the right agent. Stay focused on your task.

```bash
echo "src/auth.ts:45 — session token not refreshed on redirect, circular dep between auth and session modules" | sisyphus report
```

## Finishing

When done, submit your final report via the CLI. This is terminal — your pane closes after.

```bash
echo "your full report here" | sisyphus submit
```

If you're blocked by ambiguity, contradictions, or unclear requirements — **don't guess**. Submit what you found instead. A clear report is more valuable than a wrong implementation.

## The User

A human may interact with you directly in your pane — if they do, prioritize their input over your original instruction. Otherwise, communicate through the orchestrator via reports. 

## Guidelines

- Always include exact file paths and line numbers in reports and submissions
- Flag unexpected findings rather than making assumptions. Do not tackle work outside of your task—instead report it.
