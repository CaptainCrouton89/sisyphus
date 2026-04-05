# Multi-Agent Orchestration for LLMs — Research Report

## Key Findings

1. **Multi-agent systems show extreme performance variance**: +81% improvement on parallelizable tasks vs -70% degradation on sequential tasks. Architecture choice matters more than agent count. [1]

2. **The most successful implementations use simple, composable patterns**, not complex frameworks. Anthropic's production guidance: "The most successful implementations weren't using complex frameworks or specialized libraries." [2]

3. **Multi-agent systems fail at 41-86.7% rates in production**, primarily from inter-agent coordination breakdowns (37% of failures), not individual LLM limitations. [3]

4. **Token cost is 15x chat for multi-agent systems**, with token usage explaining 80% of performance variance. Economic viability requires high-value tasks. [4]

5. **Stateless orchestrators that are killed and respawned each cycle avoid context exhaustion** — the most robust production pattern for long-running sessions. Proven in sisyphus, Anthropic's research system, and similar architectures.

6. **A capability ceiling exists at ~45% single-agent accuracy** — beyond this threshold, multi-agent coordination yields diminishing or negative returns (β = −0.408). [1]

---

## Patterns & Techniques

### Pattern 1: Orchestrator-Worker (Hub-and-Spoke)

A central LLM dynamically decomposes tasks, delegates to worker LLMs, and synthesizes results. The most widely deployed pattern in production.

**How it works**: Orchestrator analyzes input → determines subtasks (not pre-defined) → spawns workers → collects results → synthesizes.

**When to use**: Complex tasks where subtasks cannot be predicted in advance. Coding products making multi-file changes, research tasks gathering from multiple sources. [2]

**Key design decisions**:
- Orchestrator determines task decomposition based on specific inputs rather than following fixed paths
- Workers receive self-contained instructions with all necessary context
- Orchestrator owns quality bar and decides when work is sufficient

**Evidence**: Anthropic's multi-agent research system uses this pattern — Opus as lead, Sonnet subagents. "Outperformed single-agent Claude Opus 4 by 90.2%" on internal research evaluations. Spawns 3-5 subagents typically. [4]

**Failure modes**: Early versions exhibited spawning 50+ subagents for simple queries, task duplication among subagents, and endless searching for nonexistent sources. [4]

**Production example — Sisyphus**:
```
Orchestrator (stateless, killed after yield)
  ├── agent-001: implement auth middleware
  ├── agent-002: implement session store  
  └── agent-003: review auth design
```
Orchestrator is respawned fresh each cycle with latest state. Has no memory beyond what's in its prompt. This prevents context exhaustion on long sessions.

### Pattern 2: Pipeline / Sequential Chain

Agents process work in stages. Output of one agent feeds the next.

**How it works**: Agent A → Agent B → Agent C, each with a specialized role.

**When to use**: When work has natural sequential dependencies — plan → implement → review → validate. MetaGPT uses software development SOPs (Product Manager → Architect → Engineer → QA). [5]

**Critical vulnerability**: MAS-FIRE fault injection study found linear pipeline architectures are "fundamentally vulnerable" — a corrupted output from one agent propagates downstream unchecked, with each subsequent stage compounding errors. A single planning error halts the entire workflow. [6]

**Mitigation**: Add feedback loops. Table-Critic's iterative critique-refinement loop "neutralized over 40% of faults that cause catastrophic collapse in linear workflows." [6]

**Production example — Sisyphus planning pipeline**:
```
explore → requirements → design → plan → review-plan → implement → review → validate
```
Each stage produces artifacts to `context/` directory. Later stages read earlier artifacts. The orchestrator manages progression and can backtrack (e.g., review finds design flaws → return to design).

### Pattern 3: Debate / Critic

Multiple agents argue or review each other's work to improve output quality.

**How it works**: Multiple solver agents process the same problem, exchange responses, refine based on neighbor feedback across rounds, then an aggregator uses majority voting. [7]

**Evidence**: AutoGen implements this on GSM8K benchmark. Planning faults showed 45% advantage for iterative architectures with self-correction loops vs rigid pipelines. [6]

**When to use**: When correctness matters more than speed. Math reasoning, code review, plan validation.

**Key principle**: Cross-agent critique only — researchers never review their own findings; the critic is always a fresh agent with different context. This prevents confirmation bias.

**Production example — Sisyphus review pattern**:
```
review coordinator (opus)
  ├── reuse reviewer (sonnet) 
  ├── quality reviewer (sonnet)
  ├── efficiency reviewer (sonnet)
  ├── security reviewer (opus) [conditional]
  └── compliance reviewer (sonnet) [conditional]
After review:
  ├── validation subagent 1 (opus for bugs/security)
  ├── validation subagent 2 (sonnet for everything else)
  └── dismissal audit (sonnet) — samples dismissed findings
```
Findings that don't survive validation are dropped. This two-layer approach filters noise.

### Pattern 4: Hierarchical Delegation

Multi-level orchestration where sub-orchestrators manage their own teams.

**How it works**: Top-level orchestrator spawns mid-level coordinators, which spawn their own workers. Each level handles its own scope.

**When to use**: Large features spanning multiple domains (15+ files, 3+ subsystems). When a single orchestrator would need too much context to manage everything directly.

**Key design decision**: Sub-agents are invisible to the parent orchestrator — only the coordinator agent can spawn them via the Agent tool. This prevents the orchestrator from micromanaging.

**Production example — Sisyphus plan lead**:
```
orchestrator
  └── plan-lead (opus)
        ├── sub-planner: backend (sonnet)
        ├── sub-planner: frontend (sonnet)  
        └── sub-planner: data layer (sonnet)
        [plan-lead synthesizes sub-plans into master plan]
        ├── review: code-smells (sonnet)
        ├── review: security (opus)
        └── review: requirements-coverage (sonnet)
```

### Pattern 5: Parallelization (Sectioning & Voting)

LLMs work simultaneously on tasks with outputs aggregated programmatically. [2]

**Two variants**:
- **Sectioning**: Independent subtasks run in parallel (e.g., guardrail screening while processing queries)
- **Voting**: Same task runs multiple times for diverse outputs (e.g., code vulnerability review via multiple prompts)

**When to use**: When subtasks can be parallelized for speed, or when multiple perspectives improve confidence.

**Key tradeoff**: Increased cost and latency for improved confidence/speed. OpenHands achieved SWE-bench SOTA using inference-time scaling: "trying multiple solutions and picking the best one" via a trained critic model. [8]

### Pattern 6: Evaluator-Optimizer Loop

One LLM generates responses while another provides iterative feedback. [2]

**When to use**: When clear evaluation criteria exist and iterative refinement demonstrably improves results.

**Examples**: Literary translation refinement, multi-round search and analysis.

---

## Agent Communication Mechanisms

### File-Based Artifact Passing (Most Robust)

Agents write structured artifacts to a shared filesystem rather than passing everything through conversation history. This is the dominant production pattern.

**Anthropic's approach**: "Subagent output goes to a filesystem to minimize miscommunication, and specialized agents can create outputs that persist independently." [4]

**Sisyphus implementation**:
```
$SESSION_DIR/context/
  ├── requirements-auth.md     (written by requirements agent)
  ├── design-auth.md           (written by design agent, reads requirements)
  ├── plan-stage-1-backend.md  (written by sub-planner, reads design)
  ├── explore-auth-patterns.md (written by explore agent)
  └── e2e-recipe.md            (written by orchestrator, read by all)
```

**Advantages**: Artifacts persist across agent lifecycles. Context is selective — agents read only files relevant to their task. No context window pollution.

### Message Queue (Asynchronous)

Agents communicate through a message queue that the orchestrator reads on its next cycle.

**Sisyphus**: `sisyphus message "..."` queues a message visible to the orchestrator when it respawns. Agents can also submit reports via `sisyphus report`.

### Shared State with Reducers (LangGraph)

LangGraph uses a single shared state object that flows through every graph node. Updates are merged using reducer logic (similar to Redux). Provides deterministic updates during concurrent execution. [9]

**Tradeoff**: More complex to reason about but provides checkpoint/resume capabilities. State is checkpointed after each super-step.

### Conversation-Based (AutoGen)

Agents exchange messages through a conversable interface with turn-taking. A GroupChat manager broadcasts messages and decides next speaker. [7]

**Tradeoff**: Natural for debate patterns but creates coupling. All agents see all messages, leading to context pollution on long conversations.

### Handoff (OpenAI Swarm)

When a function returns an Agent object, execution transfers to that agent. Successor agents inherit complete conversation context. Only the active agent's instructions appear in the system prompt. [10]

**Tradeoff**: Clean for customer service routing. Only one agent active at a time — no parallelism.

---

## Common Mistakes

### 1. Using Multi-Agent When Single-Agent Suffices

Multi-agent coordination yields diminishing or negative returns on sequential tasks. PlanCraft showed -70% degradation with multi-agent vs single-agent. If the task requires strict logical ordering, a single agent is better. [1]

**Decision heuristic**: Can the task be decomposed into independent subtasks? If yes, multi-agent helps. If the task requires shared reasoning state, keep it in one agent.

### 2. Independent Agents Without Orchestrator Validation

Independent multi-agent systems (agents working in parallel without talking) amplified errors by 17.2x. Centralized systems with an orchestrator contained this to 4.4x. [1]

### 3. Not Defining Clear Task Boundaries

The MASFT taxonomy found 14 failure modes across 1600+ traces, with "disobey role specification" and "task derailment" among the most common. Agents need explicit scope boundaries. [3]

**Anti-pattern**: "Look at how the existing middleware works" (vague)
**Correct**: "Implement auth middleware per context/requirements-auth.md and context/design-auth.md. Reference context/conventions.md for middleware patterns." (self-contained)

### 4. Over-Engineering the Framework

Anthropic: "Frameworks often obscure underlying prompts and responses, complicating debugging." Production teams that shipped reliable systems built with simple, composable patterns. [2]

### 5. Context Pollution Between Agents

"Every hand-off between agents puts workflow's shared memory at risk. When one model's reply exceeds another's context window, critical details vanish." [3]

**Mitigation**: Each agent gets only the context relevant to its task, not the full conversation history. File-based artifact passing (not message passing) naturally achieves this.

### 6. Injecting Ambition Into Worker Prompts

Worker agents perform best with narrow scope and conservative behavior. Their primary failure mode is scope creep, not lack of ambition. The "bail and report" pattern (stop, report unexpected complexity, let orchestrator decide) is load-bearing. Ambition belongs at the orchestrator level; discipline belongs at the agent level.

### 7. Skipping the Review Cycle

"2+ stages completing without critique" is the trigger for stopping and catching up on verification. Unverified work compounds. A conservative implementation gets caught by reviewers, but an unreviewed implementation ships broken. The structural defense against bad implementations is the critique/refine/validate loop.

### 8. Premature Tool Proliferation

Performance degradation increases proportionally with tool complexity. As agents access 16+ tools, "the tax of coordinating multiple agents increases disproportionately." [1]

### 9. Spawning Too Many Agents for Simple Tasks

Anthropic's early research system versions spawned 50+ subagents for simple queries. Production scaling: simple fact-finding needs 1 agent; direct comparisons need 2-4; complex research needs 10+. [4]

### 10. Not Making Agent Instructions Self-Contained

Agents need: an objective, an output format, guidance on tools and sources, and clear task boundaries. Tell them what to build, not how to write the code. [2][4]

---

## Failure Mode Taxonomy

### MASFT: 14 Failure Modes in 3 Categories [3]

**FC1: Specification and System Design Failures**
- FM-1.1: Disobey task specification
- FM-1.2: Disobey role specification (agents overstep boundaries)
- FM-1.3: Step repetition (unnecessary reiteration)
- FM-1.4: Loss of conversation history (context truncation)
- FM-1.5: Unaware of termination conditions

**FC2: Inter-Agent Misalignment** (37% of failures)
- FM-2.1: Conversation reset (losing context)
- FM-2.2: Fail to ask for clarification
- FM-2.3: Task derailment
- FM-2.4: Information withholding
- FM-2.5: Ignored other agent's input
- FM-2.6: Reasoning-action mismatch

**FC3: Task Verification and Termination**
- FM-3.1: Premature termination
- FM-3.2: No or incomplete verification
- FM-3.3: Incorrect verification

**Key finding**: Prompt improvements alone yielded only +14% gains. Failures require structural solutions, not better prompts.

### MAS-FIRE: Fault Injection Results [6]

- Configuration/Instruction faults: Most severe, causing "catastrophic collapse" (robustness → 0% in linear workflows)
- Memory faults: 25% performance gap between shared vs sequential architectures
- Planning faults: 45% advantage for iterative architectures with self-correction
- Communication faults: Least destructive (>93% robustness through infrastructure defenses)

---

## Framework Comparison

### LangGraph (LangChain)
- **Core abstraction**: Directed graph where nodes are agents/functions, edges control data flow
- **State management**: Centralized StateGraph with reducer-based merging. Checkpointed after each super-step.
- **Communication**: Shared state object flows through nodes. Send API for dynamic worker creation.
- **Key design decision**: Graph-based control flow makes execution deterministic and replayable
- **Production use**: AWS integration, supports parallel execution, conditional branching
- **Source**: [docs.langchain.com/oss/python/langgraph](https://docs.langchain.com/oss/python/langgraph)

### CrewAI
- **Core abstraction**: Role-based agents (employees) with backstories (resumes), skills, and goals (OKRs)
- **Communication**: Role-based delegation. Manager agent delegates tasks, validates outcomes.
- **State management**: Isolated context per role, shared crew store (local SQLite)
- **Key design decision**: Organizational metaphor — mirrors human team structures
- **Known issue**: Manager-worker architecture has documented failure modes [11]
- **Source**: [github.com/crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)

### AutoGen (Microsoft)
- **Core abstraction**: ConversableAgent — agents exchange messages through structured turn-taking
- **Communication**: Conversation-based. GroupChat with manager-based speaker selection.
- **State management**: Message exchange between agents. Supports FSM for speaker transitions.
- **Key design decision**: Multi-agent conversation as the primitive. Debate pattern built-in.
- **Source**: [github.com/microsoft/autogen](https://github.com/microsoft/autogen)

### OpenAI Swarm → Agents SDK
- **Core abstraction**: Two primitives — Agents (instructions + tools) and Handoffs (transfer execution)
- **Communication**: Handoffs. When function returns Agent object, execution transfers. Full history carries over.
- **State management**: Stateless (client-side only, no persistence between calls)
- **Key design decision**: Minimal abstraction. "Routines" package instructions with capabilities.
- **Limitation**: Educational framework, not production. OpenAI Agents SDK is the production successor.
- **Source**: [github.com/openai/swarm](https://github.com/openai/swarm)

### Anthropic's Patterns
- **Core abstraction**: Simple, composable patterns — prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer
- **Communication**: File-based artifacts. Subagents write to filesystem.
- **State management**: External memory for context > 200K tokens. Agent summarizes completed work phases.
- **Key design decision**: Subagents have isolated context windows. Only relevant info returns to orchestrator.
- **Agent SDK**: Same tools, agent loop, and context management as Claude Code, programmable in Python/TypeScript.
- **Source**: [anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents)

### Sisyphus (Production Reference)
- **Core abstraction**: Stateless orchestrator + typed agents in tmux panes. Cycle-based execution.
- **Communication**: File-based (context/ directory, reports/, prompts/). Message queue for async.
- **State management**: Atomic JSON state file with session-level mutex. Cycle snapshots for rollback.
- **Key design decisions**:
  - Orchestrator killed after each cycle, respawned fresh with latest state → prevents context exhaustion
  - Agents receive self-contained instructions via rendered templates → no implicit state sharing
  - Sub-agents invisible to orchestrator → hierarchical delegation without micromanagement
  - "Bail and report" pattern → agents flag problems rather than working around them
  - Review agents are read-only → separation of concerns between finding and fixing issues

---

## Prompt Design: Orchestrators vs Workers

### Orchestrator Prompts Should Contain:

1. **Identity and role**: "You are the team lead. You coordinate work by analyzing state, spawning agents, and managing the workflow. You do not implement features."
2. **Cycle workflow**: What to do each cycle — read state, assess, plan, spawn, yield
3. **Quality standards**: "No deferred issues. Unlimited cycles. Failed implementations are more expensive than extra cycles."
4. **Decision heuristics**: Concrete triggers — "Am I guessing? → spawn research agent. Have 2+ stages completed without critique? → stop implementing."
5. **State management instructions**: How to read/update roadmap, strategy, context files
6. **Spawning instructions**: How to create agents, what to include in agent instructions
7. **Available agent types**: What specialized agents exist and when to use each
8. **Completion criteria**: What "done" looks like and how to verify

### Worker/Agent Prompts Should Contain:

1. **Narrow task description**: One specific task, not a broad mandate
2. **Self-contained context**: All references to required files, conventions, patterns
3. **Output format**: Where to save artifacts, what format to use
4. **Scope boundaries**: What's in scope, what to bail on and report
5. **Reporting protocol**: How to flag problems, how to submit results
6. **No ambition language**: Conservative behavior is the safer default. Over-reporting is cheap; bad implementations are expensive.

### Key Asymmetry

| Aspect | Orchestrator | Worker |
|--------|-------------|--------|
| Scope | Broad — sees entire session | Narrow — one task |
| Ambition | High — sets quality ceiling | Low — disciplined execution |
| Failure mode | Too conservative | Scope creep |
| State | Reads/writes roadmap, strategy | Reads context files, writes artifacts |
| Lifecycle | Killed and respawned each cycle | Runs to completion or failure |
| Context | Full session state in prompt | Task instruction + relevant context only |

---

## Scaling Considerations

### When Multi-Agent Helps (Use It)
- Parallelizable subtasks (financial reasoning: +81%, web navigation: +9.2%) [1]
- Research requiring multiple independent investigations [4]
- Large codebases with independent modules
- Review/critique alongside implementation (parallel quality)
- Tasks requiring different expertise (security review vs code quality vs performance)

### When Multi-Agent Hurts (Don't Use It)
- Sequential tasks requiring shared reasoning state (planning: -39% to -70%) [1]
- Simple tasks solvable in one agent session
- Tool-heavy environments where coordination tax exceeds benefit
- When single-agent accuracy already exceeds ~45% [1]
- Tasks requiring tight shared context (coding features with high file overlap)

### Cost Profile
- Multi-agent: ~15x tokens vs single-agent chat [4]
- Parallel tool calling reduces wall-clock time by up to 90% [4]
- Context engineering (pruning tool outputs, selective context) drives savings more than model choice [12]
- Shopify: tool outputs consume "100x more tokens than user messages" [12]

### Model Selection
- **Orchestrator**: Use best available model (Opus/o3). The orchestrator sets the quality ceiling.
- **Workers**: Use cheaper models (Sonnet/Haiku/gpt-5.2-mini) for well-scoped tasks
- **Reviewers**: Match to severity — security/bugs get expensive models, style gets cheap models
- Counterintuitively, "bigger models sometimes decrease accuracy without architectural constraints" [12]
- "Smaller, fine-tuned models with proper harnesses beat larger general-purpose models" [12]

### Parallelism Strategy
- **Independent tasks**: Always parallelize (different files/modules/concerns)
- **Dependent tasks**: Serialize (later tasks need earlier results)
- **Review alongside implementation**: Good parallelism (don't skip review, run it concurrent)
- **Don't**: Skip parts of the development cycle to parallelize (cutting corners, not parallelism)

### Operational Concerns
- **Monitoring**: Track per-agent token usage, wall-clock time, success/failure rates
- **Debugging**: Preserve agent prompts, responses, and artifacts for post-mortem
- **Rollback**: Cycle snapshots allow reverting to known-good state
- **Graceful degradation**: Circuit breakers on cost/turns, human handoff protocols [12]
- **Session-level mutex**: Prevent read-modify-write races on shared state

---

## Notable Sources

### Primary References

[1] Google Research. "Towards a science of scaling agent systems: When and why agent systems work." 2025. https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/

[2] Anthropic. "Building Effective AI Agents." 2024. https://www.anthropic.com/research/building-effective-agents

[3] Cemri, Pan, Yang et al. "Why Do Multi-Agent LLM Systems Fail?" arXiv:2503.13657. 2025. https://arxiv.org/abs/2503.13657

[4] Anthropic. "How we built our multi-agent research system." 2025. https://www.anthropic.com/engineering/multi-agent-research-system

[5] Hong et al. "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework." arXiv. 2023.

[6] MAS-FIRE: "Fault Injection and Reliability Evaluation for LLM-Based Multi-Agent Systems." arXiv. 2026. https://arxiv.org/html/2602.19843

[7] Microsoft. "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." arXiv:2308.08155. https://arxiv.org/abs/2308.08155

[8] OpenHands. "SOTA on SWE-Bench Verified with Inference-Time Scaling and Critic Model." 2025. https://openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model

[9] LangChain. "LangGraph: Agent Orchestration Framework." https://www.langchain.com/langgraph

[10] OpenAI. "Swarm: Educational framework exploring lightweight multi-agent orchestration." https://github.com/openai/swarm

[11] Towards Data Science. "Why CrewAI's Manager-Worker Architecture Fails — and How to Fix It." https://towardsdatascience.com/why-crewais-manager-worker-architecture-fails-and-how-to-fix-it/

[12] ZenML. "What 1,200 Production Deployments Reveal About LLMOps in 2025." https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025

### Academic Surveys

- "Multi-Agent Collaboration Mechanisms: A Survey of LLMs." arXiv:2501.06322. https://arxiv.org/html/2501.06322v1
- "A Survey on LLM-based Multi-Agent System: Recent Advances and New Frontiers." arXiv:2412.17481. https://arxiv.org/html/2412.17481v2
- "Large Language Model based Multi-Agents: A Survey of Progress and Challenges." IJCAI 2024. arXiv:2402.01680.
- "A Survey of Agent Interoperability Protocols: MCP, ACP, A2A, and ANP." arXiv:2505.02279. https://arxiv.org/html/2505.02279v2
- "LLM-Based Multi-Agent Blackboard System for Information Discovery." arXiv:2510.01285.

### Practitioner Resources

- Simon Willison on agent reliability and testing: https://simonwillison.net/2024/Dec/20/building-effective-agents/
- Anthropic Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk/overview
- OpenAI "Orchestrating Agents: Routines and Handoffs" cookbook: https://developers.openai.com/cookbook/examples/orchestrating_agents
- Karpathy's 2025 LLM Year in Review: https://karpathy.bearblog.dev/year-in-review-2025/
- SWE-bench leaderboard: https://www.swebench.com/
- Augment Code failure analysis guide: https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them

---

## Code/Config Examples from Real Systems

### Sisyphus: Stateless Orchestrator Pattern

The orchestrator is killed after each cycle and respawned fresh. State persists via files, not memory.

**Orchestrator prompt structure** (templates/orchestrator-base.md):
```markdown
# Identity
The orchestrator is the team lead. It coordinates work by analyzing state,
spawning agents, and managing the workflow. It does not implement features.

# Cycle Workflow
1. Read roadmap, agent reports, cycle history
2. Assess: What succeeded? What failed? What's unclear?
3. Identify independent work that can run in parallel
4. Spawn agents, update roadmap, yield

# Decision Heuristics
- "Am I guessing?" → Spawn research agent
- "Can one agent do this?" → If no, decompose further  
- "Have 2+ stages completed without critique?" → Stop. Catch up.

# State Files
- strategy.md — problem-solving map (stages, gates, backtrack edges)
- roadmap.md — working memory (current stage, exit criteria, next steps)
- context/ — persistent artifacts (requirements, designs, plans)
```

**Agent prompt structure** (templates/agent-suffix.md):
```markdown
# Sisyphus Agent Context
- Session ID: {{SESSION_ID}}
- Your Task: {{INSTRUCTION}}

## Reports
Use `sisyphus report` to flag problems. Stay focused on your task.

## Finishing
`echo "your full report" | sisyphus submit`

## Guidelines
- Flag unexpected findings rather than making assumptions
- Do not tackle work outside your task—report it instead
```

### Sisyphus: Agent Type Frontmatter

```yaml
---
name: review
description: Code review coordinator. Read-only — orchestrates parallel sub-agents.
model: opus
color: orange
effort: high
---
```

```yaml
---
name: implement
description: Implementation agent.
model: sonnet
color: green
effort: high
---
```

### Sisyphus: Hierarchical Sub-Agent Pattern

Parent agent (e.g., `review.md`) contains orchestration logic only. Sub-agents live in `review/` subdirectory:

```
agents/
  review.md              ← coordinator (spawns sub-agents)
  review/
    reuse.md             ← finds duplicated functionality
    quality.md           ← code quality issues
    efficiency.md        ← performance issues
    security.md          ← security vulnerabilities
    compliance.md        ← rule conformance
```

Sub-agents are self-contained with own frontmatter, criteria, methodology. Coordinator synthesizes, validates, and deduplicates findings.

### Sisyphus: Research Lead (WARP Pattern)

Write-As-You-Research Pattern — living draft evolves with each researcher round:

```
1. Decompose question into sub-questions (2-8 based on complexity)
2. Maintain question queue (FIFO, critic gaps push to front)  
3. Spawn researcher sub-agents in parallel
4. After each batch: update living draft at context/research-{topic}.md
5. Spawn critic to review draft for gaps/contradictions
6. Iterate: critic gap questions → targeted researchers → update draft
7. Final synthesis: single-pass rewrite of living draft
```

### OpenAI Swarm: Handoff Pattern

```python
# Agent definition
triage_agent = Agent(
    name="Triage Agent",
    instructions="Route to the right department.",
    functions=[transfer_to_sales, transfer_to_support]
)

# Handoff function — returning an Agent transfers execution
def transfer_to_sales():
    """Transfer when the user wants to buy something."""
    return sales_agent

# State passage via Result object
def process_refund(item_id, reason="not provided"):
    return Result(
        value="Refund processed",
        agent=support_agent,  # handoff
        context_variables={"last_refund": item_id}  # state update
    )
```

### LangGraph: State Graph Pattern

```python
from langgraph.graph import StateGraph, MessagesState

# State shared across all nodes
class AgentState(TypedDict):
    messages: list
    plan: str
    code: str
    review_notes: str

# Define the graph
graph = StateGraph(AgentState)
graph.add_node("planner", planner_agent)
graph.add_node("coder", coder_agent)  
graph.add_node("reviewer", reviewer_agent)

# Edges control flow
graph.add_edge("planner", "coder")
graph.add_edge("coder", "reviewer")
graph.add_conditional_edges(
    "reviewer",
    should_revise,  # function that checks review_notes
    {"revise": "coder", "approve": END}
)
```

### Anthropic: Subagent Context Isolation

```python
# From Claude Agent SDK documentation
# Subagents have isolated context — only relevant info returns

# Orchestrator spawns subagent for research
subagent_result = await agent.spawn_subagent(
    task="Find all S&P 500 IT companies and their board members",
    tools=["web_search", "web_fetch"],
    # Subagent gets its own context window
    # Only summary returns to orchestrator
)

# Orchestrator receives compressed findings, not full search results
```

### Blackboard Pattern (Research)

```
Main Agent → posts natural-language requests to shared blackboard
  ↓
Helper agents monitor blackboard, self-select based on capability
  ↓
Responses go to separate "response boards" (not back to blackboard)
  ↓
Main agent reads response boards, synthesizes

Key: Responses are NOT written back to the blackboard to avoid
dependencies where one sub-agent's output could influence others.
```

Results: 13-57% improvement over RAG, outperformed master-slave assignment across all datasets. [arxiv:2510.01285]

---

## Summary Decision Framework

| Task Characteristic | Recommended Architecture | Why |
|---|---|---|
| Parallelizable subtasks | Orchestrator-worker | +81% on financial reasoning [1] |
| Sequential with feedback | Pipeline + critic loops | Catches 40% of cascading faults [6] |
| Correctness-critical | Debate/voting | Multiple perspectives improve confidence |
| Large scope (15+ files) | Hierarchical delegation | Sub-orchestrators manage complexity |
| Simple/well-scoped | Single agent | Avoid 17.2x error amplification overhead [1] |
| Long-running (hours) | Stateless orchestrator cycles | Prevents context exhaustion |
| High-value research | WARP pattern (write-as-you-research) | Iterative refinement with critic feedback |
| Code review | Parallel specialized reviewers + validation | Two-layer filtering reduces noise |
