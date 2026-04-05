# Adversarial Integration Tests: Plugin Resolution, Agent Types, and Setup

Source code reference: `src/daemon/frontmatter.ts` (resolution, parsing, discovery), `src/cli/onboard.ts` (setup/install).

---

## 1. Project-Local Agent Type Shadows Bundled Type

- **What the user does**: Creates `.claude/agents/worker.md` with custom frontmatter, then spawns `--type worker`. Expects their version, not bundled.
- **What breaks**: Nothing should break — but verify the local file actually wins. If bundled path is checked first due to a regression, user's customization is silently ignored.
- **How to test**: Create `.claude/agents/worker.md` with `color: red` and a distinctive body. Spawn agent, verify the resolved config uses `color: red` via daemon log or state.json agent entry.
- **Tier**: Tier 1 (filesystem + daemon only, no tmux needed for resolution logic unit test; Tier 2 for full spawn)

## 2. Malformed YAML Frontmatter — Partial Parse

- **What the user does**: Creates agent type file with broken YAML: missing closing `---`, tabs instead of spaces, colons in values without quoting, duplicate keys.
- **What breaks**: `parseAgentFrontmatter()` uses regex extraction per-field (frontmatter.ts:25-57), not a real YAML parser. Missing closing `---` means the regex `/^---\n([\s\S]*?)\n---/` won't match at all — entire frontmatter is silently dropped, agent spawns with defaults. User thinks they set `model: claude-haiku-4-5` but gets the session default.
- **How to test**: Create agent files with these variants: (a) no closing `---`, (b) `model: claude-opus-4-5 # fast` (comment in value), (c) `skills: [a, b]` (inline array, not block list). Resolve each, assert parsed fields match expectations.
- **Tier**: Tier 1 (pure function test)

## 3. Agent Type References Nonexistent Model

- **What the user does**: Agent type file has `model: claude-5-opus` (typo or outdated name).
- **What breaks**: Frontmatter parsing succeeds. The model string is passed through to Claude Code's `--model` flag. Claude Code itself rejects it, but the agent pane has already been created. The pane shows an error and the agent is stuck — pane-monitor sees it as still running (Claude Code process exited but tmux pane remains).
- **How to test**: Create agent type with `model: nonexistent-model-xyz`. Spawn agent, wait for pane-monitor poll, verify agent transitions to a failed/error state (or document that it doesn't — potential bug).
- **Tier**: Tier 2 (needs tmux + process lifecycle)

## 4. Missing .claude/ Directory Entirely

- **What the user does**: Runs sisyphus in a repo with no `.claude/` directory. Spawns agent with `--type custom-type` that only exists at `~/.claude/agents/`.
- **What breaks**: `scanDir()` (frontmatter.ts:131-133) catches `readdirSync` error on missing dir and skips it. Resolution falls through to user-global or bundled. This is correct behavior — test that it doesn't throw or log scary errors.
- **How to test**: Run in a temp dir with no `.claude/`. Call `discoverAgentTypes()` and `resolveAgentTypePath("custom", ...)`. Verify no crash, verify user-global types still discovered.
- **Tier**: Tier 1

## 5. Stale Agent Type File With Incompatible Frontmatter Fields

- **What the user does**: Has an old `.claude/agents/reviewer.md` from a previous sisyphus version that uses fields like `provider: openai` or `timeout: 300` (fields that no longer exist or were renamed).
- **What breaks**: Unknown fields are silently ignored by regex-based parsing — no error, no warning. User thinks they set a timeout but nothing happens. The real risk: if a future version reuses a field name with different semantics.
- **How to test**: Create agent type with `provider: openai`, `timeout: 300`, `maxRetries: 3`. Parse it, verify these are silently dropped. Optionally test that a warning is logged.
- **Tier**: Tier 1

## 6. `sisyphus setup` Run Multiple Times — Idempotency

- **What the user does**: Runs `sisyphus setup` twice. Second run should be a no-op.
- **What breaks**: `installBeginCommand()` (onboard.ts:255-271) checks `existsSync(dest)` before writing. If file exists, returns `{installed: true, autoInstalled: false}` — safe. BUT: if the bundled template was updated in a new version, the user's stale copy is never refreshed. Setup says "already installed" but the command is outdated.
- **How to test**: Run setup, modify the installed `begin.md`, run setup again. Verify the modified file is preserved (current behavior). Then test the inverse concern: install v1 template, upgrade sisyphus, run setup again — the old template remains. Document whether this is desired.
- **Tier**: Tier 1 (filesystem only)

## 7. User Has Custom Commands in ~/.claude/commands/sisyphus/

- **What the user does**: Already has `~/.claude/commands/sisyphus/my-custom.md` before running setup.
- **What breaks**: `mkdirSync` with `recursive: true` won't clobber existing dir. `writeFileSync` only writes `begin.md`. Custom files are safe. BUT: if user had a custom `begin.md` there before sisyphus — it would be detected as "already installed" and left alone, meaning setup never installs the real template.
- **How to test**: Pre-create `~/.claude/commands/sisyphus/begin.md` with dummy content. Run setup. Verify the dummy content is preserved (not overwritten). Verify other files in dir are untouched.
- **Tier**: Tier 1

## 8. Broken Symlinks in ~/.claude/plugins/

- **What the user does**: Has `~/.claude/plugins/installed_plugins.json` pointing to a plugin whose `installPath` no longer exists (uninstalled but not cleaned up).
- **What breaks**: `findPluginInstallPath()` (frontmatter.ts:64-77) returns the stale path. `resolveAgentTypePath()` calls `existsSync()` on `{stalePath}/agents/{name}.md` — returns false, resolution falls through. For `discoverAgentTypes()` (frontmatter.ts:155-175), `readdirSync` on the stale path throws, caught silently — plugins section is empty. Correct behavior, but test it.
- **How to test**: Create `installed_plugins.json` with `{"myplugin@1.0": {"installPath": "/nonexistent/path"}}`. Call `discoverAgentTypes()`, verify no crash, verify bundled/local types still appear.
- **Tier**: Tier 1

## 9. Agent Type Name With Special Characters

- **What the user does**: Creates `.claude/agents/my agent (v2).md` or `.claude/agents/../../etc/passwd.md`.
- **What breaks**: `resolveAgentTypePath()` does `path.join(cwd, '.claude', 'agents', name + '.md')`. A name like `../../etc/passwd` resolves to a path traversal. Currently no sanitization. For `discoverAgentTypes()`, `scanDir()` reads filenames from disk and strips `.md` — so the discovered name reflects the filename, special chars included.
- **How to test**: (a) Create agent files with spaces, parens, unicode in names. Verify they can be resolved and spawned. (b) Attempt path traversal: `sisyphus spawn --type "../../etc/passwd" --name test "task"`. Verify it doesn't read arbitrary files.
- **Tier**: Tier 1 (resolution logic), Tier 2 (spawn with traversal)

## 10. Permissions Issues on Agent Directories

- **What the user does**: `~/.claude/agents/` exists but is chmod 000 (no read/write/execute).
- **What breaks**: `readdirSync` throws EACCES in `scanDir()`, caught silently — user-global agents are invisible. `resolveAgentTypePath()` calls `existsSync()` which returns false for unreadable paths — falls through to bundled. No error surfaced to user.
- **How to test**: `chmod 000 ~/.claude/agents/`, run `discoverAgentTypes()`, verify no crash and only project-local + bundled types appear. Restore permissions after.
- **Tier**: Tier 1

## 11. ~/.claude/commands/sisyphus/ Is a Symlink

- **What the user does**: `~/.claude/commands/sisyphus` is a symlink to another directory (e.g., dotfiles repo).
- **What breaks**: `mkdirSync` with `recursive: true` on an existing symlink-to-dir is fine. `writeFileSync` follows the symlink and writes into the target directory. This is actually correct behavior but should be verified — some users use this pattern for dotfile management.
- **How to test**: Create symlink `~/.claude/commands/sisyphus → /tmp/dotfiles-commands/`. Run setup. Verify `begin.md` appears in the symlink target.
- **Tier**: Tier 1

## 12. Inline YAML Array for Skills (Parser Mismatch)

- **What the user does**: Writes `skills: [skill-a, skill-b]` in frontmatter (valid YAML inline array syntax).
- **What breaks**: The skills regex (frontmatter.ts) expects block list format (`- item` lines). Inline `[a, b]` won't match — skills field is silently empty. Agent spawns without requested skills.
- **How to test**: Create agent type with `skills: [code-review, testing]`. Parse frontmatter, assert skills array. Currently this will fail — document as a known limitation or bug.
- **Tier**: Tier 1

## 13. Concurrent Setup + Agent Spawn Race

- **What the user does**: Two sessions start simultaneously in the same project. Both try to resolve agent types while one is modifying `.claude/agents/`.
- **What breaks**: `readFileSync` during resolution could read a partially-written file if another process is writing. Unlikely but possible on slow filesystems. More realistically: one session's orchestrator discovers types, then user edits an agent file, second session sees different types.
- **How to test**: Write a script that spawns two `sisyphus start` commands concurrently while a background loop modifies agent type files. Check for crashes or corrupted reads in daemon logs.
- **Tier**: Tier 2

## 14. Namespaced Type With Missing Plugin Registry

- **What the user does**: `sisyphus spawn --type myplugin:reviewer --name r1 "review"` but `~/.claude/plugins/installed_plugins.json` doesn't exist.
- **What breaks**: `findPluginInstallPath()` catches the ENOENT, returns null. `resolveAgentTypePath()` only checks the bundled path for namespaced types (if namespace isn't `sisyphus`). Returns null. Caller gets null config — agent spawn should fail with a clear error.
- **How to test**: Remove `installed_plugins.json`. Spawn with `--type fakeplugin:worker`. Verify error message is clear (not a stack trace or silent failure).
- **Tier**: Tier 2

## 15. Setup When ~/.claude/commands/ Has Wrong Permissions

- **What the user does**: `~/.claude/commands/` is owned by root or chmod 555 (read-only).
- **What breaks**: `mkdirSync` or `writeFileSync` throws EACCES. The catch in `installBeginCommand()` returns `{installed: false}`. Setup prints a generic failure message — no hint about permissions.
- **How to test**: `chmod 555 ~/.claude/commands/`. Run `sisyphus setup`. Verify it doesn't crash and prints a useful message. Restore permissions.
- **Tier**: Tier 1

---

## Summary by Tier

| Tier | Scenarios |
|------|-----------|
| **Tier 1** (filesystem, no tmux) | 1 (resolution only), 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15 |
| **Tier 2** (tmux + daemon) | 1 (full spawn), 3, 9 (traversal spawn), 13, 14 |

## High-Priority Bugs to Investigate

1. **Path traversal** (#9) — `resolveAgentTypePath` doesn't sanitize names. Could read arbitrary .md files.
2. **Inline skills array** (#12) — Common YAML syntax silently drops skills.
3. **Stale setup template** (#6) — No upgrade path for the begin.md slash command.
4. **Bad model passes through** (#3) — No validation of model name before spawning pane.
