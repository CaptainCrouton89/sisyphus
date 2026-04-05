# Achievement Audit & Expansion — Behavioral & Timing

## Part 1: Existing Achievement Evaluation

### Time Achievements

| ID | Verdict | Issue | Recommendation |
|----|---------|-------|----------------|
| `night-owl` | **Too easy** | 65% of sessions are evening (21:00-02:00). Triggers on any session started 00:00-06:00. Most evening sessions that cross midnight qualify. | **Raise threshold**: require 3+ sessions completed after midnight in a single week. Rename to reflect habit, not one-off. Or: narrow window to 01:00-04:00 to exclude casual midnight crossers. |
| `dawn-patrol` | **Too easy** | Any long evening session spanning midnight qualifies. With median duration 2.3h and 65% starting 21:00-02:00, many sessions naturally span midnight-6am. | **Raise threshold**: require session to be *actively running agents* at both midnight AND 5am (not just wall-clock span). Or: require 4+ hour session that spans midnight. |
| `early-bird` | **OK but ambiguous** | Checks `getHours() < 6`. The 12% morning sessions are mostly 06:00-09:00, so few before 6am. Genuinely rare. | **Keep as-is.** Correctly rare (~2-5% of sessions). |
| `weekend-warrior` | **OK** | Depends on weekend usage. One-time unlock, reasonable. | **Keep as-is.** |
| `all-nighter` | **Barely achievable** | Max session is 7.2h (434.8 min). Threshold is 6h (360 min). Only P90+ sessions qualify. `activeMs` is used, not wall clock — sleep detection caps credited time. | **Lower to 5 hours** (`18_000_000` ms). At P90=334min, still requires an exceptional session but not the literal maximum. Alternatively keep 6h but use wall-clock (`completedAt - createdAt`) instead of `activeMs`. |
| `witching-hour` | **Good — genuinely rare** | 3-4am start. Very few sessions start here even with heavy night usage. | **Keep as-is.** Perfect rare achievement. |

### Behavioral Achievements

| ID | Verdict | Issue | Recommendation |
|----|---------|-------|----------------|
| `sisyphean` | **OK** | 3+ retries of same task. Depends on retry behavior. The `normalizeTask` hash is coarse (lowercase, 100 chars, cwd basename prefix) so minor rephrasing avoids detection. | **Keep threshold, improve hash.** Consider fuzzy matching or just accept the coarseness as part of the charm. |
| `stubborn` | **OK** | 5+ retries AND completion. Rarer than sisyphean. Good progression. | **Keep as-is.** |
| `creature-of-habit` | **OK** | 10 visits to same repo. With 2 repos and ~3.5 sessions/day, ~5 days to unlock. | **Keep as-is.** Reasonable early-mid achievement. |
| `loyal` | **OK** | 30 visits. ~2 weeks. Good long-term goal. | **Keep as-is.** |
| `wanderer` | **IMPOSSIBLE** | 5+ repos in one calendar day. User has 2 repos. Even with growth, 5 in one day is extreme. | **Fix: lower to 3 repos/day.** This is still meaningful — working across 3 different projects in a single day shows breadth. |
| `streak` | **OK** | 7 consecutive days. Achievable in first week with daily use. | **Keep as-is.** |
| `hot-streak` | **Trivially easy** | 5 consecutive clean sessions. With 0% crash rate, unlocks within 2 days. | **Raise to 15 consecutive clean sessions.** Still achievable in ~4-5 days but requires sustained reliability, not just existing. |
| `momentum` | **Trivially easy** | 3 sessions in 3 hours. At 2-5 sessions/day, most days qualify. | **Raise to 5 sessions in 4 hours.** Requires genuinely intense burst, not normal cadence. |
| `patient-one` | **Interesting** | 30+ min idle between orchestrator cycles. Requires leaving a session idle mid-run. Natural for "start before bed, check in morning." | **Keep as-is.** Nice discovery achievement. |
| `message-in-a-bottle` | **OK** | 10+ user messages to one session. Depends on messaging habits. | **Keep as-is.** |
| `comeback-kid` | **OK** | Resume and complete. Requires `parentSessionId != null`. | **Keep as-is.** |
| `pair-programming` | **Too easy** | 3+ user messages during a session. Very low bar. | **Raise to 8 user messages.** That's genuine back-and-forth, not just a couple of adjustments. |

---

## Part 2: Proposed New Timing Achievements

### `deep-night` (replaces current `night-owl` behavior)
- **Category**: time
- **Description**: Complete a session that ran for 2+ hours entirely between midnight and 6am.
- **Justification**: Distinguishes "session happened to cross midnight" from "you were genuinely coding through the dead hours." With 65% evening sessions but median 2.3h, only sessions started ~midnight-4am and lasting 2h+ qualify.
- **Expected unlock**: 2-3 weeks (requires a genuinely late start + sustained work).

### `lunch-break`
- **Category**: time
- **Description**: Start and complete a session between 11:30am and 1:30pm.
- **Justification**: With 65% evening and 12% morning sessions, midday sessions are rare (~10-15%). Completing one within the lunch window is a distinctive pattern.
- **Expected unlock**: 1-2 weeks (whenever they first code during lunch).

### `full-week`
- **Category**: time
- **Description**: Complete at least one session on every day of the week (Mon-Sun) within a single calendar week.
- **Justification**: `streak` measures consecutive days but not covering all 7 weekdays. This requires weekend + weekday coverage in one week.
- **Expected unlock**: 2-3 weeks (requires deliberate weekend use).
- **State needed**: Can derive from `dailyRepos` dates — check if any 7-day Mon-Sun span has all days covered.

### `night-shift`
- **Category**: time
- **Description**: Start 3 sessions after 10pm in a single calendar week.
- **Justification**: Replaces `night-owl` as the "you're a night coder" achievement. Common for this user (65% evening) but not instant — requires 3 sessions in one week to confirm the pattern.
- **Expected unlock**: 1 week.
- **State needed**: New field or derive from `recentCompletions` timestamps.

### `timezone-defier`
- **Category**: time
- **Description**: Complete sessions in 4 different 6-hour time blocks (00-06, 06-12, 12-18, 18-24) within 48 hours.
- **Justification**: Rare and genuinely impressive — means coding at all hours. Even with heavy evening use, catching 06-12 AND 12-18 AND 00-06 in 48h is unusual.
- **Expected unlock**: 1+ month (requires unusual schedule disruption).

---

## Part 3: Proposed New Behavioral Achievements

### `swarm`
- **Category**: session
- **Description**: Complete a session with 30+ agents.
- **Justification**: P75 is 20 agents, P90 is 30. This is a genuinely large orchestration. The current `marathon` (15+ agents) is P50-P75 territory.
- **Expected unlock**: 1-2 weeks.

### `overdrive`
- **Category**: behavioral
- **Description**: Complete 6+ sessions in a single calendar day.
- **Justification**: Average is 3.5/day, max observed window suggests 5 is common at P75+. 6 requires a genuinely intense day.
- **Expected unlock**: 1-2 weeks.

### `rapid-fire`
- **Category**: behavioral
- **Description**: Start a new session within 5 minutes of completing the previous one.
- **Justification**: Shows urgency/flow state. Derivable from `recentCompletions` — check gap between last two entries.
- **Expected unlock**: 1 week (likely happens naturally during intense work).

### `deep-conversation`
- **Category**: behavioral
- **Description**: Send 20+ messages to a single session.
- **Justification**: Progression from `message-in-a-bottle` (10). Shows genuine interactive orchestration rather than fire-and-forget.
- **Expected unlock**: 2-4 weeks.

### `phoenix`
- **Category**: behavioral
- **Description**: Restart the same task after a crash and complete it successfully.
- **Justification**: Different from `comeback-kid` (resume) and `stubborn` (5+ retries). This is specifically about recovering from failure. Requires: taskHistory entry exists AND previous session with same task hash had agent crashes.
- **State needed**: Would need crash tracking per task hash (new field) or derive from session history.
- **Expected unlock**: Depends on crash rate. With 0% currently, this is aspirational — but crash rate will change as usage grows.

### `two-front-war`
- **Category**: behavioral
- **Description**: Have sessions running in 2 different repos simultaneously.
- **Justification**: With 2 active repos, this is achievable but requires deliberately starting concurrent sessions. The daemon supports multiple active sessions.
- **State needed**: Derivable at runtime — check if multiple sessions are active with different `cwd` values.
- **Expected unlock**: 1-2 weeks.

### `iron-streak`
- **Category**: behavioral
- **Description**: 14 consecutive days with at least one session.
- **Justification**: Progression from `streak` (7 days). Two full weeks of daily use.
- **Expected unlock**: 2-3 weeks.

### `centurion-agents`
- **Category**: milestone
- **Description**: Spawn 500 agents over a lifetime.
- **Justification**: `hive-mind` is 200. At ~7.25 agents/session median and ~3.5 sessions/day, that's ~25 agents/day → 200 in 8 days, 500 in 20 days. Good progression.
- **Expected unlock**: 3 weeks.

---

## Part 4: Combination / Hidden Achievements

### `vampire`
- **Category**: time (hidden)
- **Description**: Complete 5 sessions, all started between midnight and 5am, without any session started between 6am and 6pm.
- **Justification**: Pure nocturnal pattern. Satisfying to discover for habitual night coders. The "without any daytime session" clause makes it tricky — one afternoon session resets the count.
- **State needed**: New counter tracking consecutive night-only sessions.
- **Expected unlock**: 2-4 weeks (requires extended night-only pattern).

### `marathon-owl`
- **Category**: session (hidden)
- **Description**: Complete a 4+ hour session that started after 11pm.
- **Justification**: Combines duration + timing. Starting late AND going long. P75 duration is ~5h, so 4h sessions happen — but starting after 11pm narrows the window.
- **Expected unlock**: 2-3 weeks.

### `blitz-dawn`
- **Category**: session (hidden)
- **Description**: Complete a session in under 10 minutes, started before 7am.
- **Justification**: Quick morning task. Rare because morning sessions are already uncommon (12%), and quick ones even rarer.
- **Expected unlock**: 1+ month.

### `the-mountain-knows`
- **Category**: behavioral (hidden)
- **Description**: Have the companion reach level 10.
- **Justification**: Based on XP formula (strength×80 + endurance/3.6M×15 + wisdom×40 + patience×5) and the leveling curve (1.35× threshold growth), level 10 requires sustained use. Satisfying milestone that players discover when they check their companion.
- **Expected unlock**: 2-3 weeks.

### `one-must-imagine`
- **Category**: behavioral (hidden)
- **Description**: Restart the same task 10+ times.
- **Justification**: The ultimate Sisyphus achievement. Progression beyond `stubborn` (5). Named for the Camus quote. Extremely rare — most people give up or rephrase before 10 attempts.
- **Expected unlock**: Months (if ever). True hidden achievement.

### `parallel-universe`
- **Category**: session (hidden)
- **Description**: Complete a session with 40+ agents where every agent completed successfully.
- **Justification**: Massive flawless orchestration. P90 agent count is 30, max is 59. Getting 40+ all clean is exceptional.
- **Expected unlock**: 1+ month.

---

## Part 5: Summary of Required Fixes

### Must Fix
1. **`wanderer`**: Lower from 5 to **3 repos/day**
2. **`hot-streak`**: Raise from 5 to **15 consecutive clean sessions**
3. **`momentum`**: Raise from 3-in-3h to **5-in-4h**
4. **`night-owl`**: Narrow window from 00:00-06:00 to **01:00-05:00** (excludes casual midnight crossers)
5. **`pair-programming`**: Raise from 3 to **8 user messages**

### Should Fix
6. **`all-nighter`**: Lower from 6h to **5h** OR switch from `activeMs` to wall-clock duration
7. **`dawn-patrol`**: Add minimum duration requirement (session must be **3+ hours** and span midnight-6am)

### Implementation Notes
- New achievements need entries in: `AchievementId` type union, `ACHIEVEMENTS` array, `ACHIEVEMENT_CHECKERS` record, `BADGE_ART` record
- Hidden achievements: add a `hidden: boolean` field to `AchievementDef` — render as "???" in gallery until unlocked
- Combination achievements that need cross-session state (like `vampire`) require new `CompanionState` fields
- Achievements derivable from existing state (`rapid-fire`, `overdrive`, `full-week`) can use `recentCompletions` and `dailyRepos`
- `recentCompletions` is capped at 10 entries (sliced to last 10) — may need to increase for `rapid-fire` and intensity-based achievements, or add a separate `recentSessionStarts` field with timestamps

### Priority Order for Implementation
1. Fix the 5 broken thresholds (quick wins, no new state needed)
2. Add `swarm`, `overdrive`, `rapid-fire` (derivable from existing state)
3. Add `night-shift`, `full-week` (need minor state additions)
4. Add hidden achievements (`vampire`, `marathon-owl`, `one-must-imagine`)
5. Add `deep-conversation`, `iron-streak`, `centurion-agents` (progression achievements)
