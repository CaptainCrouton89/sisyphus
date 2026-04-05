## Review: Companion Threshold Calibration + Session Metadata Integration

Build: passing (238/238). Five sub-agent reviewers (reuse, quality, efficiency, security, compliance) spawned; findings validated against source.

---

### CONFIRMED BUGS

**1. [HIGH] `splitBodyAndBoulder` rendering corruption at levels 12-19 and 20+**
- `src/shared/companion-render.ts:99-110`
- `getBaseForm` embeds fixed boulders per level tier (`OO` for levels 12-19, `@` for 20+). `getBoulderForm` returns dynamic boulders based on agent count (`.`, `o`, `O`, `@`). When these don't match, `splitBodyAndBoulder` either fails to find the boulder base (`lastIndexOf` returns -1) or splits incorrectly.
- Examples: Level 15 + 0 agents → body has `OO`, boulder is `.` → output `ᕦ(face)ᕤ OO.` (both inline and dynamic boulder). Level 15 + 6 agents with `wisps` cosmetic → splits at second O in `OO`, produces `ᕦ(face)ᕤ O~O~` (stray O). Level 20 + 0 agents → `ᕦ(face)ᕤ @.`.
- Impact: Visual corruption in the status bar for engaged users (level 12+ is exactly when cosmetics start appearing). No tests cover cross-level/boulder combinations.

**2. [HIGH] `onAgentCrashed` increments `sessionsCrashed` per agent, not per session**
- `src/daemon/companion.ts:505-511`
- `sessionsCrashed` is incremented once per `onAgentCrashed()` call. `onAgentCrashed` is called from `session-manager.ts:701` inside `handlePaneExited` — which fires per individual agent crash. A session with 5 crashed agents increments `sessionsCrashed` by 5.
- The luck formula at line 509 (`sessionsCompleted / (sessionsCompleted + sessionsCrashed)`) uses this counter as a denominator. With per-agent counting, luck degrades 5x faster than a per-session model would. Since luck feeds XP via `(stats.luck * 100) * 2`, this cascades into incorrect XP, level, and title.

**3. [HIGH] `callHaiku` duplicated between `companion-commentary.ts` and `summarize.ts` with split cooldown**
- `src/daemon/companion-commentary.ts:8-42` vs `src/daemon/summarize.ts:16-49`
- Word-for-word identical pattern: module-level `disabledUntil`, `COOLDOWN_MS`, same `query()` call, same `for await` text accumulation, same 401/403 cooldown logic. Two independent cooldown clocks — if `summarize.ts` gets a 401, `companion-commentary.ts` still fires Haiku calls (and vice versa), burning two cooldown windows against the same auth failure.
- Fix: Extract shared `callHaiku(prompt): Promise<string | null>` with unified cooldown.

---

### CONFIRMED DESIGN ISSUES

**4. [MEDIUM] Stale session passed to `onSessionComplete` achievement checkers**
- `src/daemon/session-manager.ts:497-516`
- `state.getSession` at line 497 reads session BEFORE `flushTimers` at line 498. The captured `session` object has pre-flush `activeMs`. This same object is passed to `onSessionComplete` at line 516, feeding achievement checkers (`blitz`, `speed-run`, `all-nighter`) stale values.
- Practical impact is low (delta ≤ 5s poll interval vs 5-minute/8-hour thresholds) but the ordering is incorrect. Fix: move `const session = state.getSession(cwd, sessionId)` to after `flushTimers` and `handleOrchestratorComplete`.

**5. [MEDIUM] Unconditional `saveCompanion` every 5s from `computeMood` debug side effect**
- `src/daemon/companion.ts:214` + `src/daemon/pane-monitor.ts:227-228`
- `computeMood` always mutates `companion.debugMood`, forcing `saveCompanion` every poll cycle even when mood is unchanged. This is 12 synchronous disk writes/minute (JSON.stringify + writeFileSync + renameSync) during active sessions.
- Documented as intentional in CLAUDE.md ("always saved"). But `debugMood` could be kept in-memory-only (module-level variable in pane-monitor) rather than persisted, eliminating the unconditional save.

**6. [MEDIUM] Double `state.getSession` per session per poll cycle**
- `src/daemon/pane-monitor.ts:187` (mood signal loop) + `:236` (inside `pollSession`)
- Each `state.getSession` does `readFileSync` + `JSON.parse` with no cache. The mood signal builder at line 185-199 re-reads every tracked session that was already read by `pollSession`. With 5 active sessions, that's 10 file reads per poll where 5 would suffice.
- Fix: pass session objects from `pollSession` into the mood signal loop, or cache session reads within a poll cycle.

**7. [MEDIUM] `fireCommentary` last-writer-wins on `lastCommentary` across 3 concurrent chains**
- `src/daemon/session-manager.ts:520-531`
- On completion with level-up and achievement, 3 independent `fireCommentary` calls race. Each does Haiku API call → `loadCompanion()` → set `lastCommentary` → `saveCompanion()`. The last Haiku response to resolve wins — non-deterministic across 3 concurrent network requests. The CLAUDE.md acknowledges this as acceptable, but the user sees whichever event's Haiku call was slowest.

**8. [MEDIUM] `saveCompanion` uses fixed temp filename**
- `src/daemon/companion.ts:44`
- Uses `.companion.json.tmp` (fixed name) vs `state.ts:36` which uses `.state.${randomUUID()}.tmp`. In Node.js single-threaded model, `writeFileSync` can't truly interleave, so corruption is unlikely. But it's inconsistent with the established pattern and would be unsafe if ever called from concurrent processes.

---

### LOW SEVERITY / DROPPED

- `updateRepoMemory` returns `CompanionState` unnecessarily (inconsistent with void handlers) — cosmetic
- `fireCommentary('agent-crash')` called despite CLAUDE.md saying it "returns null entirely" — actually has 30% chance per `shouldGenerateCommentary`; CLAUDE.md is stale, not the code
- `handleSpawn` `updateAgent` "silently discards" — `.catch(() => {})` correctly swallows the throw; comment is imprecise but behavior is safe
- `loadCompanion` `existsSync` before `readFileSync` — extra stat syscall, minor
- `sessionLengthMs` takes max across all sessions — reasonable for a global companion entity
- `handleSpawn` synchronous load+save per agent — 10 pairs in burst is minor wall-clock

---

### COMPLIANCE SUMMARY

All checked CLAUDE.md constraints are satisfied:
- ✓ `fireCommentary` reload-before-save pattern correctly implemented (line 29: `const c = loadCompanion()` inside `.then()`)
- ✓ `onSessionComplete` return value inspected; achievement commentary gated on non-empty array
- ✓ `flash=true` only for session-complete, level-up, achievement
- ✓ Companion uses own load/save, not state.ts
- ✓ pane-monitor always saves after mood recompute
- ✓ New Session/Agent fields serialize cleanly (all plain JSON types)

### RECOMMENDATIONS (priority order)

1. Fix `splitBodyAndBoulder` — either make `getBaseForm` return the character + boulder separately, or have `composeLine` extract the inline boulder from the form based on level tier, not from the runtime boulder arg
2. Fix `onAgentCrashed` — either rename to `agentsCrashed` and adjust the luck formula, or deduplicate by tracking per-session crash state
3. Extract `callHaiku` into shared `src/daemon/haiku.ts` with unified cooldown
4. Move `debugMood` to in-memory-only storage in pane-monitor
5. Reorder `handleComplete` to read session after flushTimers