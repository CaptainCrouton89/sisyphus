#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-004-plugin" --agent 'sisyphus:research-lead' --session-id "925cf4b4-e2ee-4df2-9c90-fae8aff6b907" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:generate-authoring-skills research-context-research-lead c1' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/c043ec2c-4be7-4442-a6c8-b0fe85884f43/prompts/agent-004-system.md')" 'Research the topic: **Context Management for LLM Applications — Windows, Retrieval, and Compression**

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

Structure: Key Findings → Context Window Mechanics (with citations) → RAG Patterns → Compression Techniques → Token Budgeting → Caching → Common Mistakes → Notable Sources (with URLs)'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %240