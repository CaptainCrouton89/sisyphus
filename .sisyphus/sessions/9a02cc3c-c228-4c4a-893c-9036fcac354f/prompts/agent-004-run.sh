#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-004' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort high --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-004-plugin" --agent 'sisyphus:review' --session-id "b059e5bc-d427-4710-8612-a6e8557e2cf0" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning review-recalibration-review c2' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-004-system.md')" 'Review the companion recalibration implementation for correctness and edge cases.

**Session goal:** Recalibrate companion thresholds so moods cycle visibly, levels feel rewarding, and achievements unlock at reasonable pace.

**Files changed:**
- src/daemon/companion.ts — XP formula, level curve, mood scoring, achievement thresholds
- src/shared/companion-render.ts — boulder form 6-tier, stat cosmetic thresholds
- src/shared/companion-types.ts — MoodSignals extended with cycleCount, sessionsCompletedToday
- src/daemon/pane-monitor.ts — temporal decay signals, event setters, mood polling loop
- src/daemon/session-manager.ts — event hook calls (markEventCompletion, markEventCrash, markEventLevelUp, updateCycleCount)

**Reference:** context/recalibration-spec.md contains the full spec with current vs proposed values.

**Focus areas:**
1. Mood scoring: Does removing the grinding base advantage actually produce variability? Walk through 3-4 representative signal scenarios (morning start, mid-grind, late night, post-completion) and compute which mood wins.
2. Edge cases: What happens when signals are all zero? When optional fields are undefined? When sessions have 0 agents?
3. Temporal decay: The 2-minute decay window for justCompleted/justCrashed/justLeveledUp — is that wired correctly in pane-monitor.ts?
4. Level curve: With threshold=150 and scaling=1.35, what XP is needed for levels 1-10? Does it feel right given the XP formula?
5. Achievement thresholds: Any that are still unreachable or frontloaded?
6. Code quality: Any patterns that could cause runtime errors (null access, missing optional chaining, etc.)?'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2461