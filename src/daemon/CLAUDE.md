- `continueSession` clears last cycle's `completedAt` — orchestrator's `.reverse().find(c => c.completedAt)` mode lookup skips it and falls back to the penultimate cycle's mode (or `'discovery'` if only one cycle exists), losing the completion-mode context. Cross-file trap: `state.ts` + `orchestrator.ts`.
- `updateTask()` updates both state and `goal.md` inside the lock. `updateSession({task})` skips `goal.md`; orchestrator reads the old goal on the next cycle.
- `reconnectSession()` does NOT call `resetAgentCounterFromState()` — silent agent-ID collision risk post-reconnect. `resume` and `clone` do call it.
- Adding a new agent-termination path requires calling `gcBgTasks(cwd, sessionId, agentId)` — `register-bg-task.sh` records background-Task agentIds; `require-submit.sh` consumes them. Leftover entries from an unterminated path leak silently into the next cycle.
- `ssyph_` prefix is load-bearing for `isSisyphusSession()` and `findHomeSession()` (both in `shared/paths.ts` / `tmux.ts`). Session names containing tmux format characters (`#`, `{`, `}`) break the status bar compositor silently — no escaping is applied.
- `setPaneStyle()` writes a static `pane-border-format` string; `updatePaneMeta()` updates only the variables without rebuilding the format. Calling `updatePaneMeta()` on a pane that never had `setPaneStyle()` produces invisible labels.
- `flushAgentTimer(sessionId, agentId)` is read-only — returns full accumulated ms (not a delta). Pass into `updateAgent({activeMs})` to persist; it sets the **absolute** value. `flushTimers()` uses `incrementActiveTime` for deltas. Mixing the two paths silently corrupts active-time accounting.
- `switchToHomeSession()` must be called before `tmux.killSession()` — reversing the order detaches clients before they can switch.

## Companion

- Async commentary callbacks must reload fresh companion state immediately before saving; never close over a captured companion reference across an `await` — concurrent fire-and-forget callbacks clobber each other.
- `companionCredited{Cycles,ActiveMs,Strength,Wisdom}` are written to session state on `handleComplete()`. `onSessionComplete()` reads these to skip already-credited work if the session is continued and completed again — omitting the write causes double-counting.
