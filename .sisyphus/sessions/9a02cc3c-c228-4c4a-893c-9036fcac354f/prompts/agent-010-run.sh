#!/usr/bin/env bash
cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/templates/banner.txt'
export SISYPHUS_SESSION_ID='9a02cc3c-c228-4c4a-893c-9036fcac354f' && export SISYPHUS_AGENT_ID='agent-010' && export SISYPHUS_CWD='/Users/silasrhyneer/Code/claude-tools/sisyphus' && export SISYPHUS_SESSION_DIR='/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f' && export PATH="/Users/silasrhyneer/Code/claude-tools/.bin:$PATH"
claude --dangerously-skip-permissions --effort low --plugin-dir "/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-010-plugin" --agent 'sisyphus:explore' --session-id "484da86f-8ef5-463e-a781-500f2dd0ab12" --plugin-dir "/Users/silasrhyneer/.claude/plugins/marketplaces/crouton-kit/plugins/devcore" --name 'ssph:data-driven-sisyphus-tuning pattern-audit-explore c9' --append-system-prompt "$(cat '/Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/prompts/agent-010-system.md')" '## Task: Audit & Expand Behavioral & Timing Achievements

You are analyzing the companion achievement system for sisyphus, a multi-agent orchestration tool. Your job is to evaluate **behavioral and timing achievements** against real historical usage data and propose both threshold fixes and new achievements.

### Historical Data (32 sessions, 232 agents, ~2 weeks of use)

| Metric | P10 | P25 | P50 | P75 | P90 | Max |
|--------|-----|-----|-----|-----|-----|-----|
| Session duration (min) | 3.8 | 61.9 | 140.1 | 294.6 | 334.1 | 434.8 |
| Agent count/session | 0 | 2 | 9 | 20 | 30 | 59 |
| Cycle count/session | 1 | 2 | 5 | 10 | 22 | 43 |

- 2-5 sessions/day (~3.5 avg), 21:00-02:00 (~65%), 06:00-09:00 (~12%)
- 2 active repos
- 0% crash rate
- Sessions span midnight frequently (65% are evening sessions)

### Available State for Achievement Checking
```typescript
// CompanionState fields available:
consecutiveCleanSessions: number
consecutiveDaysActive: number
lastActiveDate: string | null      // YYYY-MM-DD
taskHistory: Record<string, number> // task hash → retry count
dailyRepos: Record<string, string[]> // date → repo paths
recentCompletions: string[]        // last 10 ISO timestamps

// Session fields available:
session.createdAt, session.completedAt
session.agents[].status, session.agents[].activeMs, session.agents[].spawnedAt
session.orchestratorCycles[].timestamp, session.orchestratorCycles[].completedAt, session.orchestratorCycles[].mode
session.messages[].source.type
session.parentSessionId (set when resumed)
session.cwd
```

### Current Time Achievements to Evaluate
```
night-owl: session started after midnight — very common (65% evening sessions)
dawn-patrol: session spans midnight to 6am — common for long evening sessions
early-bird: session started before 6am — rare (12% morning, mostly 6-9am, few before 6)
weekend-warrior: session completed on sat/sun — depends on usage pattern
all-nighter: 6+ hour session — max is 7.2h so barely achievable
witching-hour: session started 3-4am — very rare
```

### Current Behavioral Achievements to Evaluate  
```
sisyphean: restart same task 3+ times — depends on retry behavior
stubborn: restart same task 5+ times and complete — rarer
creature-of-habit: 10 visits to same repo — with 2 repos, ~5 days
loyal: 30 visits to same repo — ~2 weeks
wanderer: 5+ repos in one day — user has 2 repos. IMPOSSIBLE?
streak: 7 consecutive days active — achievable in first week
hot-streak: 5 consecutive clean sessions — trivially easy (0% crash rate)
momentum: 3 sessions in 3 hours — very common at 2-5/day
patient-one: 30+ min idle between cycles — requires leaving session idle
message-in-a-bottle: 10+ messages to one session — depends on messaging habits
comeback-kid: resume and complete a session — depends on resume usage
pair-programming: 3+ user messages during a session — common
```

### Your Task

1. **Evaluate each existing threshold** — Which are too easy? Which are impossible given the data? Which feel arbitrary?
2. **Propose new timing achievements:**
   - Time-of-day patterns (lunch coder, afternoon shift, etc.)
   - Day patterns (every weekday, specific day streaks)
   - Holiday/special timing
   - Duration combos (late night + long session)
3. **Propose new behavioral achievements:**
   - Daily intensity (many sessions in one day)
   - Weekly patterns (sessions every day of the week)
   - Messaging depth (conversations with agents)
   - Multi-session patterns (back-to-back, rapid fire)
   - Retry persistence patterns (beyond sisyphean/stubborn)
   - Resume/recovery patterns
   - Cross-session behavioral patterns
4. **Propose combination/hidden achievements:**
   - Achievements that combine conditions (night-owl + marathon, early-bird + blitz)
   - Rare natural occurrences that would be satisfying to "discover"
5. **Fix problematic achievements:**
   - `wanderer` (5 repos/day) is impossible with 2 repos
   - `hot-streak` is trivially easy
   - `momentum` is trivially easy at 2-5 sessions/day
   - `night-owl` is way too common

For each proposed achievement, include: ID, name, category, description, data justification, expected unlock timeline.

Save your analysis to: /Users/silasrhyneer/Code/claude-tools/sisyphus/.sisyphus/sessions/9a02cc3c-c228-4c4a-893c-9036fcac354f/context/audit-patterns.md

Think about what behaviors are genuinely interesting or impressive, not just common occurrences dressed up as achievements.'
node "/Users/silasrhyneer/Code/claude-tools/sisyphus/dist/cli.js" notify pane-exited --pane-id %2497