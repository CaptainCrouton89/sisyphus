---
name: discovery
description: Define the goal and map the approach. Use at session start, or when the goal has fundamentally shifted. Stays in discovery until goal.md and strategy.md are solid.
---

# Discovery Phase

You are in discovery mode. Your job is to arrive at a clear goal and a credible strategy — then transition to planning. This is the highest-leverage phase: a wrong goal wastes the entire session, a vague goal produces vague implementations.

Don't rush this. If the goal is clear, you'll be out of discovery in one cycle. If it's vague, invest the cycles to get it right. The user is most involved here.

<goal-refinement>

## Refine the Goal

The user's starting prompt is an input, not a goal. It may be vague, ambiguous, or assume context you don't have.

**Process:**
1. Read the starting prompt
2. Explore the codebase enough to understand what's relevant
3. Assess goal clarity (see below)
4. Write or update goal.md

### Three levels of goal clarity

**Clear** — the user gave explicit scope and acceptance criteria. Write goal.md, invoke the **strategy skill** to write strategy.md, initialize roadmap.md, transition to planning. One cycle.

**Unclear but bounded** — you know the domain but need to resolve ambiguity. Ask the user targeted questions (propose interpretations, don't ask open-ended questions). Spawn explore agents for technical context. Refine goal.md across 1-2 cycles. Then invoke the strategy skill → write strategy.md → transition to planning.

**Nebulous** — multiple valid framings, "done" isn't defined, the user might change their mind about what this even means. This needs interactive problem exploration:

1. Spawn explore agents for the technical landscape. Yield `--mode discovery`.
2. Read explore results. Spawn `sisyphus:problem` for collaborative problem definition with the user. Yield `--mode discovery`.
3. Read `context/problem.md`. Now you can write a meaningful goal.md. Invoke the strategy skill → write strategy.md → transition to planning.

Not every nebulous problem needs all three sub-cycles — collapse when you can. The point is: don't leave discovery until the goal is concrete enough that a spec agent could work from it.

</goal-refinement>

<problem-exploration>

## Problem Exploration

When the problem is nebulous, `sisyphus:problem` leads interactive exploration with the user. It's purpose-built for divergent thinking, multi-perspective analysis, and collaborative dialogue. Don't try to do this yourself — the problem agent has tools and methodology the orchestrator doesn't.

**When to spawn `sisyphus:problem`:**
- Multiple valid framings exist and you can't tell which the user wants
- "Done" isn't defined — the user would struggle to write acceptance criteria
- The problem involves trade-offs the user needs to think through
- The starting prompt is a direction, not a destination ("improve the auth system", "implement subagents")

**When NOT to spawn it:**
- Goal is explicit with clear acceptance criteria
- Bug fix with clear reproduction steps
- Mechanical refactor with no behavioral change
- You just need a few clarifying questions (ask them yourself)

The problem agent produces `context/problem.md`. This feeds downstream into spec.

</problem-exploration>

<strategy-generation>

## Write the Strategy

Once the goal is clear, invoke the **strategy skill** for guidance on writing strategy.md. The skill provides stage patterns, process shapes, and the strategy.md format.

Strategy generation is usually fast — the shape of the work is often obvious once the goal is defined. Don't overthink it. A wrong strategy gets revised; a missing strategy leaves the orchestrator directionless.

</strategy-generation>

<roadmap-initialization>

## Initialize the Roadmap

After writing goal.md and strategy.md, initialize roadmap.md. Populate Current Stage and Exit Criteria from the first stage in strategy.md. Active Context starts empty; Next Steps lists immediate actions.

</roadmap-initialization>

<transition>

## Transition

Once goal.md, strategy.md, and roadmap.md are written and the goal is confirmed:

```bash
sisyphus yield --mode planning --prompt "Discovery complete — goal.md, strategy.md, and roadmap.md initialized. Begin first stage."
```

If you're still working on goal clarity (exploring, waiting for problem agent, iterating with user), stay in discovery:

```bash
sisyphus yield --mode discovery --prompt "Goal still being refined — [what's happening, what's next]."
```

</transition>
