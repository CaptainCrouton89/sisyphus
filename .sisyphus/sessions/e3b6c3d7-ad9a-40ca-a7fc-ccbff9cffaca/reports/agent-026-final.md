Added 6 adversarial test functions to test/integration/suites/test-full.sh with 18 total new assertions.

## New assertions by function

### test_agent_type_resolution (4 assertions)
- agent-type-file-created — file exists at .claude/agents/custom-test.md
- agent-type-frontmatter-parsed — node inline parses color:red from frontmatter
- agent-type-resolve-no-crash — daemon survives spawn request with local custom type
- agent-type-no-claude-dir-no-crash — daemon survives session start in cwd with no .claude/ dir

### test_malformed_frontmatter (3 assertions)
- malformed-fm-daemon-alive (early return on start_daemon fail — becomes a fail, not assertion name mismatch)
- malformed-fm-broken-no-crash — daemon alive after spawn attempt with missing-closing-delimiter file
- malformed-fm-array-skills-no-crash — daemon alive after spawn attempt with inline YAML array skills

### test_setup_idempotency (2 assertions)
- setup-idempotent-first-run — begin.md exists after first sisyphus setup
- setup-idempotent-preserves-custom — begin.md still contains appended CUSTOM MARKER after second sisyphus setup

### test_tui_graceful_no_tty (2 assertions)
- tui-no-tty-pipe — TUI exits within 5s with piped stdin (timeout=124 = fail)
- tui-no-tty-devnull — TUI exits within 5s with /dev/null stdin

### test_doctor_comprehensive (5 assertions)
- doctor-adv-no-failures — no ✗ in doctor output (all green in full tier)
- doctor-adv-node-ok — ✓.*[Nn]ode present
- doctor-adv-tmux-ok — ✓.*tmux present
- doctor-adv-claude-ok — ✓.*[Cc]laude present
- doctor-adv-nvim-ok — ✓.*nvim present

### test_permissions_agent_dir (2 assertions, skipped when root)
- perm-agent-dir-no-crash — daemon alive after session start with unreadable agents dir (symlinked)
- perm-agent-dir-daemon-alive — daemon alive after spawn attempt with unreadable agents dir

## Adjustments from plan

1. **sisyphus spawn --list-types does not exist** — this flag is mentioned in CLAUDE.md but is not implemented in src/cli/commands/spawn.ts. Tested agent type resolution via daemon protocol (spawn requests) instead.

2. **test_agent_type_resolution**: Uses node inline script to parse frontmatter directly (no --list-types CLI) + daemon spawn request to prove resolution path doesn't crash. The no-.claude-dir test uses a start request (not spawn --list-types) to exercise discoverAgentTypes via the daemon.

3. **test_permissions_agent_dir**: Skips with assert_skip when id -u == 0 (Docker root). On Linux, root bypasses DAC (chmod 000 directories are readable by root), making the test meaningless. Uses symlink approach when run as non-root to point session cwd at unreadable agents dir.

4. **test_doctor_comprehensive**: Uses doctor-adv-* prefixes to avoid colliding with existing doctor-claude-ok and doctor-nvim-ok assertions in test_doctor_full. Node pattern uses [Nn]ode to handle capitalization variations.