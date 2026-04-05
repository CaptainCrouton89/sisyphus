# Supporting Directories & Config — Exploration Report

## Directories

### `templates/` — System Prompt Templates
The core of sisyphus prompt engineering. Contains templates rendered at runtime for orchestrator and agent initialization.

**Key files:**
- `orchestrator-base.md` — Foundation orchestrator prompt (role, cycle workflow, context persistence)
- `orchestrator-planning.md` / `orchestrator-strategy.md` / `orchestrator-impl.md` / `orchestrator-validation.md` — Phase-specific orchestrator guidance, appended based on `--mode` flag
- `agent-suffix.md` — Agent system prompt with `{{SESSION_ID}}` and `{{INSTRUCTION}}` placeholders
- `dashboard-claude.md` — TUI companion prompt with `{{CWD}}` and `{{SESSIONS_CONTEXT}}` placeholders
- `orchestrator-settings.json` — Default orchestrator config (model, behavior flags)
- `begin.md` — Template for the `/sisyphus:begin` skill
- `banner.txt` — ASCII art banner
- `nvim-tutorial.txt` — Neovim tutorial content (newly staged)
- `CLAUDE.md` — Detailed documentation of template rendering rules and conventions

**Subdirectories (plugin templates for crouton-kit):**
- `agent-plugin/` — Specialized agent types: `debug`, `explore`, `operator`, `plan`, `review`, `review-plan`, `test-spec`, `design`, `problem`, `requirements`. Includes hooks (`require-submit.sh`, `intercept-send-message.sh`, per-type `*-user-prompt.sh`) and review concern files.
- `orchestrator-plugin/` — Orchestrator overrides: hooks (`explore-gate.sh`, `hooks.json`), skills (`orchestration/SKILL.md`, `task-patterns.md`, `workflow-examples.md`), commands (`design.md`, `problem.md`, `requirements.md`, `strategize.md`)
- `companion-plugin/` — Plugin for companion workflows: hooks for user prompt context injection

### `launchd/` — macOS Service Config
Single file: `com.sisyphus.daemon.plist`
- Runs `dist/daemon.js` via `/opt/homebrew/bin/node`
- `RunAtLoad: true`, `KeepAlive` on non-zero exit
- Logs to `~/.sisyphus/daemon.log`
- Working directory: user home

### `.claude/` — Claude Code Project Configuration
- `rules/agent-prompts.md` — Rules for editing agent prompt templates
- `rules/orchestrator-prompts.md` — Rules for editing orchestrator prompt templates
- `agents/codex-test.md` — A custom agent definition
- `commands/restart.md` — The `/restart` slash command
- `specs/multi-repo-support.spec.md` — Feature spec for multi-repo support
- `pipeline/multi-repo-support.state.md` — Pipeline state for that spec

### `.github/` — GitHub CI/CD
Single workflow: `workflows/publish.yml`
- Triggers on push to `main` (skips release commits)
- Auto-bumps patch version, pushes tag, publishes to npm with provenance
- Uses Node 22, npm trusted publishing (id-token: write)

### `dist/` — Build Output
Contains built entry points (`cli.js`, `daemon.js`, `tui.js`), shared chunks, source maps, and a `templates/` copy. All JS files get `#!/usr/bin/env node` shebang via tsup banner config.

### `tmp/` — Temporary Files
Contains two directories: `stress-app-sisyphus-wt` and `todo-app`. Likely test/demo projects used during development. Not gitignored (or partially tracked).

## Root Files

### `package.json`
- **Name**: `sisyphi` (npm package name), v1.1.7
- **Bin entries**: `sisyphus` → `dist/cli.js`, `sisyphusd` → `dist/daemon.js`
- **Scripts**: `build` (tsup), `dev` (watch), `dev:daemon` (watch + auto-restart), `test` (node native test runner via tsx), `prepublishOnly` (build + test)
- **Dependencies**: `commander` (CLI), `uuid`, `string-width`, `@r-cli/sdk`
- **Dev deps**: TypeScript, tsup, tsx, @types
- **Engine**: Node >=22, ESM

### `tsconfig.json`
- Target ES2022, NodeNext module resolution, strict mode
- JSX: react-jsx (possibly for future TUI use)
- Source maps and declarations enabled
- Includes only `src/`, outputs to `dist/`

### `tsup.config.ts`
- Three entry points: `daemon`, `cli`, `tui`
- ESM format, Node 22 target, code splitting enabled
- Adds `#!/usr/bin/env node` shebang to all outputs
- `onSuccess`: copies `templates/` → `dist/templates/` (keeps templates with deployed binaries)

### `README.md`
- ASCII art banner + project description
- Explains the "Ralph Wiggum loop" concept — sisyphus as a structured multi-agent loop
- Covers: what it is, how it works, architecture, usage

### `IDEAS.md`
- **Reactive Orchestrator (Inbox Model)**: Agents trigger orchestrator wakeups via interim `sisyphus report` instead of waiting for all agents to finish. Includes debouncing, report watermarking, and opt-in/opt-out design. Lists specific implementation files.
- **Other ideas**: Agent self-tasking with haiku validation, dynamic goals (brief notes)

### `CLAUDE.md`
- Comprehensive project guide: architecture (4 layers), session lifecycle, prompt delivery, template system, key conventions (naming, colors, state, tmux layout), common patterns (adding commands, modifying state, local testing)
- This is the primary onboarding document for Claude Code agents working in the repo
