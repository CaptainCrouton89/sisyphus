Research report saved to context/research-multi-agent-orchestration.md (~500 lines).

Key findings synthesized from 4 parallel research agents + sisyphus codebase analysis:

1. **Performance variance is extreme**: +81% on parallelizable tasks, -70% on sequential tasks. Architecture choice > agent count.
2. **Simple patterns win**: Anthropic's production guidance says "simple, composable patterns" beat complex frameworks.
3. **Production failure rates 41-86.7%**: Inter-agent coordination (37%) is the #1 failure category, not individual LLM failures.
4. **15x token cost**: Multi-agent uses ~15x tokens vs chat. Token usage explains 80% of performance variance.
5. **Stateless orchestrator cycles** (sisyphus pattern) are the most robust for long-running sessions.
6. **Capability ceiling at ~45% single-agent accuracy**: Beyond this, coordination overhead exceeds gains.

Report structure: Key Findings → 6 Patterns with citations → 10 Common Mistakes → MASFT 14-failure taxonomy → Framework comparison (LangGraph/CrewAI/AutoGen/Swarm/Anthropic/Sisyphus) → Prompt design asymmetry (orchestrator vs worker) → Scaling decision framework → Notable sources with URLs → Code examples from real systems.

Sources: 12 primary references including Anthropic's "Building Effective Agents" and multi-agent research system blog, Google's scaling science paper, MASFT failure taxonomy (arXiv:2503.13657), MAS-FIRE fault injection study, 1200 production deployment analysis, SWE-bench leaderboard data, and extensive sisyphus codebase patterns.