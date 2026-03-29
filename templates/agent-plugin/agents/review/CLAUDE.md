# review/

Specialized code review agent prompt variants for different review contexts.

## Files

- **review.md** — Core code review agent. Analyzes code quality, identifies issues, suggests improvements.
- **compliance.md** — Compliance-focused review. Validates adherence to standards, security, licensing, architectural patterns.
- **security.md** — Security-focused review. Threat analysis, vulnerability assessment, secure coding practices.
- **performance.md** — Performance-focused review. Bottleneck identification, optimization opportunities, complexity analysis.
- **maintainability.md** — Maintainability-focused review. Code clarity, testability, technical debt, refactoring suggestions.

## Usage

Each file is a complete agent template with YAML frontmatter and strategy. Spawn with:

```bash
sisyphus spawn --agent-type sisyphus:review --instruction "review the auth module"
sisyphus spawn --agent-type sisyphus:compliance --instruction "ensure OAuth compliance"
```

Without a specific variant, `review.md` is the default (general-purpose code review).

## Conventions

- All files follow parent `agents/` template structure (YAML frontmatter + role/strategy sections)
- Placeholders: `{{SESSION_ID}}`, `{{INSTRUCTION}}`
- Each variant emphasizes a different lens (compliance, security, perf, maintainability) without duplication
- Color and model configurable via frontmatter
