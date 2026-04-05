Session branching problem exploration complete. Document saved to context/problem-session-branching.md.

## Key Finding

Session branching is a re-orientation and handoff problem, not a hierarchy problem. The implementation is ~30 lines of real delta because all building blocks exist. The critical design insight: child output must flow via context files (the system's native persistent knowledge channel), NOT the message queue (lossy, undifferentiated, causes orchestrator to pivot).

## Recommended Design

1. `--parent <id>` flag on `sisyphus start` + `sisyphus fork` alias
2. Bidirectional refs from day one: `parentSessionId` (exists) + `childSessionIds[]` (new)
3. On child completion: write `context/child-completed-{name}.md` to parent's context dir + brief message nudge
4. Orchestrator prompt template gets `## Child Session Reports` section with "informational, not directive" framing
5. Fix `comeback-kid` achievement (currently fires on any `parentSessionId != null`, needs `resumeCount > 0` or separate achievement)
6. Make pruning parent-child aware (don't prune sessions with active children)

## Strongest Open Question

Whether the orchestrator can reliably treat child reports as informational through prompt framing alone (assumption #3). If it consistently pivots, may need to move to pause-parent model or restrict injection to specific orchestrator modes.

## Reports from 8 Perspective Agents

- **Convergence**: All 8 agreed the core mechanism is parentSessionId + completion hook. Simplifier/first-principles/precedent agreed implementation is tiny (~30 lines).
- **Contrarian + Adversarial**: Independently concluded message queue is wrong wire. Context dir is the right injection channel. Orchestrator needs distinct framing for child reports.
- **Time-traveler**: Add childSessionIds[] now to avoid painful retrofit. Real future primitive is `spawn --as-session`.
- **Systems-thinker**: Found pruning break (parent dirs deleted, breaking refs), comeback-kid misfire, companion baseline skew from short forks.