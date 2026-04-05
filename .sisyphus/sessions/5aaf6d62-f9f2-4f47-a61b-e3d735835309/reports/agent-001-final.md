Exploration complete. Documented 13 integration points across 8 files:

1. **session-manager.ts**: 6 hook points (startSession, handleComplete, handleSpawn, handleSubmit, handlePaneExited x2) with exact line numbers and available data
2. **pane-monitor.ts**: Poll cycle at 5s interval, hook after L162 for mood recompute/flash expiry
3. **status-bar.ts**: Companion section appends to sections[] array at L154-156, must use tmux format strings
4. **tree.ts**: Companion pins to last row(s) of innerH, reduces maxVisible, uses writeClipped()
5. **overlays.ts**: Standard pattern: drawBorder + writeClipped lines. Help overlay already references 'c' key
6. **input.ts**: 'c' is top-level key (L991), NOT leader key. Leader dispatch at L716 for adding overlay trigger
7. **types.ts**: Confirmed no nickname field on Agent (L47-65). Optional field safe for existing state
8. **Existing infra**: companion-context CLI, buildCompanionContext() XML builder, openCompanionPane() tmux split, companion plugin with hook