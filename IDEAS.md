# Ideas

## Reactive Orchestrator (Inbox Model)

Currently the orchestrator only wakes up when ALL agents finish. Instead, agents could trigger orchestrator wakeups via interim reports.

**Core concept:** An "inbox" where agent reports accumulate. The orchestrator wakes up when new reports arrive (not just when all agents complete).

**How it works:**
- Agent calls `sis agent report` → report saved + queued as "unseen"
- If orchestrator is NOT running → spawn it after a short debounce (3-5s to batch rapid reports)
- If orchestrator IS running → queue the report; when orchestrator yields, check inbox — if new reports exist, respawn immediately
- `sis agent submit` still works as today (report + "I'm done")
- `allAgentsDone` remains as a trigger, just not the only one

**What this enables:**
- Orchestrator reacts to validation findings while other agents are still working
- Spawns new agents based on interim discoveries
- Re-prioritizes or kills agents going down the wrong path
- Starts next wave before current wave fully finishes

**Key concerns:**
- **Thrashing** — Each spawn is a new Claude session (tokens, startup cost). Debouncing is essential.
- **Watermarking** — Need `lastProcessedReportIndex` or similar so the orchestrator prompt can flag "new since last cycle" vs. already-seen reports.
- **Opt-out** — Maybe `yield --wake-on-report` vs `yield --wake-on-complete` so the orchestrator controls its own wake schedule.

**Implementation surface:**
- `session-manager.ts` `handleReport()` — add debounced orchestrator spawn trigger
- `orchestrator.ts` `handleOrchestratorYield()` — check for unseen reports, respawn immediately if any
- `state.ts` — add report watermark to session state
- `orchestrator.ts` `formatStateForOrchestrator()` — annotate reports as NEW vs. seen

## Other Ideas
- What if the agent made tasks for itself, and marking them complete had haiku determine if it was "actually done" or smth?
- Dynamic goals?

## Self Evolving Harness
- System where you define what a successful system as a whole looks like, and the evaluator and evolution agents update teh ahrness as it goes
- Maybe autopsy automatically runs?

## Lessons/Grading/Rubric Idea Savings
- Have user define rubric of quality? For research, if user defines what a good research paper looks like, the agent can grade and autonomously gather more
https://blog.sylph.ai/posts/autoscholar-harness

## Other Ideas
- Cron, open-claw-ify sisyphus??
Or maybe they always yield, and we always let the orchestrator decide if it wants to yield—it can yield after reports come back, or just keep going?

## Misc
keep tools narrow
keep policy editable
keep memory explicit
keep the loop small
keep progress versioned

Brain wave: All “tools” should be replaced with clis as well, and should be extensible. Tools and commands are kinda like “file systems” where you drill down on command for more and more specific versions of it (i.e. sis agent spawn -h  gets help for just that command specifically). Agent would not have any “normal” tools—just fucking bash pretty much. Major benefit of this system is the agent would be able to string together tools in interesting programmatic ways, like feeding output of one tool directly into the propmt-argument for a subagent. Then, make it so clis that implement this protocol must have some “to-system-prompt” method or wtvr (or some other layer) that lets the agent know about it.
Then, if this was how claude code native tools worked, then you make the clis extensible. Now you have fucking magic. Tools are hard to extend, but I think you could make clis much more modularly extensible. That way you could expose new “sub-paths” of search tool or wtvr else. imagine extending its search tool so it could pass an extra argument that made it do a semantic search instead or something. Rather than giving it a whole new-ass fucking tool, you just tweak one of its existing ones and don’t bloat the agent;

Clarifications:
- By having tool be a cli, you can have top layer/most common layer described by the tool, but then also have further "drilling down" the agent can do via `-h`.
- CLI can pipe between things
- Can have super nuanced edits/tweaks/logs/etc on agents

Architecting this:
- Needs to make it easy to make any CLI comply
- Can view custom logs, jq over them
- Virtual Bash environment? 

Forking with context (btw style).
  Hooks with memory
  More hackability. I've built a system around the claude code
  ecosystem for stringing full claude code sessions together.
  Can we make tools more like CLIs that users can extend?
