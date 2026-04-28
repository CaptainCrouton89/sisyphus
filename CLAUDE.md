**Agent resolution order (first match wins):** `.claude/agents/{name}.md` → `~/.claude/agents/{name}.md` → bundled `sisyphus:{name}` → installed Claude Code plugins (`~/.claude/plugins/`). Note: the orchestrator's agent listing shows only bundled `sisyphus:*` types — project/user agents are hidden from its prompt but still resolve when invoked.

**Always mutate state through `state.ts`** — atomic temp-file + rename via `atomicWrite`; never call `writeFileSync` on state JSON directly.
