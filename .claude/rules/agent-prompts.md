---
paths:
  - "templates/agent-suffix.md"
  - "templates/agent-plugin/agents/**/*.md"
  - "templates/agent-plugin/agents/*.md"
---

Agent prompts must preserve narrow scope and defensive posture.

- Agents perform best with one specific task. Their primary failure mode is scope creep and quality degradation, not lack of ambition.
- The "bail and report" pattern (stop, report unexpected complexity, let orchestrator decide) is load-bearing. Don't weaken it with motivational language about being ambitious or pushing through difficulty.
- Agents can't reliably distinguish "this is outside my scope" (correct bail) from "this is hard but in scope" (incorrect bail). The current bias toward bailing is the safer default — over-reporting is cheap, a bad implementation is expensive.
- Never inject ambition, motivation, or "think bigger" language into agent prompts. Ambition belongs at the orchestrator level; discipline belongs at the agent level.
- Conservative behavior from training data is expected. Claude's "pragmatic" instinct comes from pre-AI-era training data. Accept it and rely on the review cycle to catch it structurally — don't try to override the training prior with prompt engineering.

## Sub-agent extraction pattern

When an agent type's prompt grows beyond orchestration logic (spawning, validating, synthesizing) into detailed domain instructions, extract those domain instructions into sub-agent definition files.

- **Structure**: Create a subdirectory matching the agent type name under `agents/` (e.g., `agents/review/`). Each `.md` file in that subdirectory becomes a sub-agent type available via the Agent tool within that agent's session.
- **Mechanism**: `createAgentPlugin()` in `src/daemon/agent.ts` copies sub-agent files into the plugin's `agents/` directory at spawn time. Sub-agents are invisible to the orchestrator — only the parent agent can spawn them.
- **Parent prompt**: Should contain only orchestration logic — scope determination, sub-agent dispatch strategy (scaling table), validation, synthesis. Reference sub-agents by `subagent_type` name, not by inlining their instructions.
- **Sub-agent prompt**: Should be self-contained with its own frontmatter (name, description, model), focused review criteria, search methodology, and output format. No orchestration logic.
- **Hooks**: The corresponding `UserPromptSubmit` hook should list available sub-agent types and reinforce that the parent agent orchestrates via sub-agents, not by doing the work directly.
